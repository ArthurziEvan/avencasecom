#!/usr/bin/env python3
"""
app.py
------
Ferramenta de pesquisa de preço: cada visitante cola URLs, o app tira um
"print" da página inteira (vira uma página de PDF) e vai juntando tudo em
uma pesquisa. No final, baixa um PDF único com todos os produtos.

NÃO TEM LOGIN — mas cada pessoa que acessa recebe um identificador anônimo
(cookie de sessão) e só vê os produtos que ELA MESMA adicionou. Duas pessoas
usando ao mesmo tempo não se misturam.

RODAR LOCALMENTE:
    pip install -r requirements.txt
    playwright install chromium
    python app.py
Depois acesse http://localhost:5000

Para hospedar na nuvem, veja o Dockerfile e as instruções de deploy
que acompanham este projeto.
"""

import asyncio
import json
import os
import re
import time
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

from flask import Flask, request, render_template, redirect, url_for, send_file, flash, session
from playwright.async_api import async_playwright
from pypdf import PdfWriter, PdfReader

BASE_DIR = Path(__file__).parent
PASTA_DADOS = BASE_DIR / "dados_pesquisas"
PASTA_DADOS.mkdir(exist_ok=True)

# Depois de quantas horas sem uso uma pesquisa "órfã" pode ser limpa
# automaticamente (evita acumular disco com sessões abandonadas).
HORAS_PARA_EXPIRAR = 48

# CEP usado para definir a localização de entrega em sites como a Amazon,
# já que o servidor roda fora do Brasil e o site não consegue adivinhar
# a localização certa sozinho. Pode trocar via variável de ambiente CEP_PADRAO.
CEP_PADRAO = os.environ.get("CEP_PADRAO", "70165900")  # Senado Federal, Brasília-DF

app = Flask(__name__)
# Em produção, defina a variável de ambiente SECRET_KEY (veja instruções de deploy).
# Isso garante que o cookie de sessão de cada pessoa continue válido entre reinícios.
app.secret_key = os.environ.get("SECRET_KEY", "chave-local-de-desenvolvimento-troque-em-producao")


# ---------- Sessão anônima por visitante ----------

def pasta_da_sessao() -> Path:
    """Cada visitante recebe um ID aleatório salvo em cookie assinado.
    A pesquisa dele fica isolada numa subpasta com esse ID."""
    if "sessao_id" not in session:
        session["sessao_id"] = uuid.uuid4().hex
        session.permanent = True
    pasta = PASTA_DADOS / session["sessao_id"]
    (pasta / "paginas").mkdir(parents=True, exist_ok=True)
    return pasta


def carregar_estado(pasta_sessao: Path) -> list:
    arquivo_estado = pasta_sessao / "estado.json"
    if arquivo_estado.exists():
        return json.loads(arquivo_estado.read_text(encoding="utf-8"))
    return []


def salvar_estado(pasta_sessao: Path, itens: list):
    arquivo_estado = pasta_sessao / "estado.json"
    arquivo_estado.write_text(json.dumps(itens, ensure_ascii=False, indent=2), encoding="utf-8")
    # Marca a última atividade, usado pela limpeza automática
    (pasta_sessao / ".ultima_atividade").write_text(str(time.time()))


# ---------- Geração do PDF de cada página ----------

def nome_arquivo_seguro(url: str) -> str:
    dominio = urlparse(url).netloc or "pagina"
    dominio = re.sub(r"[^a-zA-Z0-9.\-]", "_", dominio)
    sufixo = uuid.uuid4().hex[:6]
    return f"{dominio}_{sufixo}.pdf"


async def configurar_cep_amazon(page, cep: str):
    """Se a página for da Amazon, define o CEP de entrega antes do print.
    Se algo não bater (a Amazon muda o site com frequência), simplesmente
    desiste e segue em frente — não deve travar a geração do PDF."""
    try:
        link_localizacao = page.locator("#nav-global-location-popover-link")
        await link_localizacao.click(timeout=5000)

        campo_cep = page.locator("#GLUXZipUpdateInput")
        await campo_cep.wait_for(timeout=5000)
        await campo_cep.fill(cep)

        botao_aplicar = page.locator("#GLUXZipUpdate input[type='submit'], #GLUXZipUpdate button")
        await botao_aplicar.click(timeout=5000)

        # Depois de aplicar, geralmente aparece um botão "Concluído"/"Done"
        # para fechar o popover de confirmação.
        botao_concluir = page.locator(
            "button:has-text('Concluído'), button:has-text('Done'), "
            "input[name='glowDoneButton']"
        )
        await botao_concluir.click(timeout=5000)

        # Dá um tempo para a página recarregar os preços/frete com o novo CEP.
        await page.wait_for_timeout(2000)
    except Exception:
        # Não é uma página da Amazon, ou a Amazon mudou o layout — segue sem travar.
        pass


async def gerar_pdf_de_url(url: str, pasta_paginas: Path) -> Path:
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],  # necessário em muitos ambientes de nuvem
        )
        context = await browser.new_context(
            viewport={"width": 1366, "height": 900},
            locale="pt-BR",
        )
        page = await context.new_page()
        await page.goto(url, wait_until="networkidle", timeout=60_000)

        if "amazon." in urlparse(url).netloc:
            await configurar_cep_amazon(page, CEP_PADRAO)

        await page.wait_for_timeout(1500)

        caminho_pdf = pasta_paginas / nome_arquivo_seguro(url)
        await page.pdf(
            path=str(caminho_pdf),
            format="A4",
            print_background=True,
            margin={"top": "10mm", "bottom": "10mm", "left": "10mm", "right": "10mm"},
        )
        await browser.close()
        return caminho_pdf


# ---------- Limpeza de sessões antigas ----------

def limpar_sessoes_expiradas():
    agora = time.time()
    limite = HORAS_PARA_EXPIRAR * 3600
    if not PASTA_DADOS.exists():
        return
    for pasta in PASTA_DADOS.iterdir():
        if not pasta.is_dir():
            continue
        marcador = pasta / ".ultima_atividade"
        if marcador.exists():
            try:
                ultima = float(marcador.read_text())
            except ValueError:
                ultima = 0
            if agora - ultima > limite:
                import shutil
                shutil.rmtree(pasta, ignore_errors=True)


# ---------- Rotas ----------

@app.route("/", methods=["GET"])
def index():
    limpar_sessoes_expiradas()
    pasta_sessao = pasta_da_sessao()
    itens = carregar_estado(pasta_sessao)
    return render_template("index.html", itens=itens)


@app.route("/adicionar", methods=["POST"])
def adicionar():
    pasta_sessao = pasta_da_sessao()
    url = request.form.get("url", "").strip()

    if not url.startswith("http"):
        flash("Informe uma URL válida, começando com http:// ou https://")
        return redirect(url_for("index"))

    try:
        caminho_pdf = asyncio.run(gerar_pdf_de_url(url, pasta_sessao / "paginas"))
    except Exception as e:
        flash(f"Não consegui gerar o PDF dessa página: {e}")
        return redirect(url_for("index"))

    itens = carregar_estado(pasta_sessao)
    itens.append({
        "id": uuid.uuid4().hex,
        "url": url,
        "dominio": urlparse(url).netloc,
        "adicionado_em": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "arquivo": caminho_pdf.name,
    })
    salvar_estado(pasta_sessao, itens)

    return redirect(url_for("index"))


@app.route("/remover/<item_id>")
def remover(item_id):
    pasta_sessao = pasta_da_sessao()
    itens = carregar_estado(pasta_sessao)
    item_removido = next((i for i in itens if i["id"] == item_id), None)

    itens = [i for i in itens if i["id"] != item_id]
    salvar_estado(pasta_sessao, itens)

    if item_removido:
        caminho = pasta_sessao / "paginas" / item_removido["arquivo"]
        if caminho.exists():
            caminho.unlink()

    return redirect(url_for("index"))


@app.route("/nova-pesquisa")
def nova_pesquisa():
    pasta_sessao = pasta_da_sessao()
    itens = carregar_estado(pasta_sessao)
    for item in itens:
        caminho = pasta_sessao / "paginas" / item["arquivo"]
        if caminho.exists():
            caminho.unlink()
    salvar_estado(pasta_sessao, [])
    return redirect(url_for("index"))


@app.route("/baixar")
def baixar():
    pasta_sessao = pasta_da_sessao()
    itens = carregar_estado(pasta_sessao)
    if not itens:
        flash("Adicione ao menos um produto antes de baixar.")
        return redirect(url_for("index"))

    writer = PdfWriter()
    for item in itens:
        caminho = pasta_sessao / "paginas" / item["arquivo"]
        if caminho.exists():
            reader = PdfReader(str(caminho))
            for pagina in reader.pages:
                writer.add_page(pagina)

    nome_final = f"pesquisa_de_preco_{datetime.now().strftime('%Y-%m-%d_%H-%M')}.pdf"
    caminho_final = pasta_sessao / nome_final
    with open(caminho_final, "wb") as f:
        writer.write(f)

    return send_file(caminho_final, as_attachment=True, download_name=nome_final)


@app.route("/saude")
def saude():
    """Rota simples para verificar se o serviço está no ar (útil para o Render)."""
    return {"status": "ok"}


if __name__ == "__main__":
    porta = int(os.environ.get("PORT", 5000))
    app.run(debug=False, host="0.0.0.0", port=porta)
