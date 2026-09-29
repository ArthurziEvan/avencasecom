import os
import re
import unicodedata
from datetime import date, datetime

import requests
from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ComentarioAvenca

URL_SITE = "https://www6g.senado.gov.br/transparencia/licitacoes-e-contratos/contratos"
URL_EDITAL = "https://www6g.senado.gov.br/transparencia/licitacoes-e-contratos/licitacoes/{id}/edital"


# ---------- leitura tolerante do JSON do Senado ----------

def _k(s):
    """Normaliza nome de campo: sem acento, minúsculo, sem _ . espaço (data_fim_vigencia -> datafimvigencia)."""
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", s)


def achatar(d, prefixo="", saida=None):
    saida = {} if saida is None else saida
    if isinstance(d, dict):
        for k, v in d.items():
            achatar(v, f"{prefixo}.{k}" if prefixo else str(k), saida)
    elif not isinstance(d, list):
        saida[prefixo] = d
    return saida


def mapa(c):
    """Cada valor fica acessível pelo caminho completo (empresa.nome -> empresanome) e pelo nome final (nome)."""
    m = {}
    for caminho, v in achatar(c).items():
        if v in (None, "", []):
            continue
        m.setdefault(_k(caminho), v)
        m.setdefault(_k(caminho.split(".")[-1]), v)
    return m


def pick(m, *nomes):
    for n in nomes:
        v = m.get(_k(n))
        if v not in (None, ""):
            return v
    return None


def achar(m, *partes):
    for k, v in m.items():
        if all(p in k for p in partes):
            return v
    return None


def texto(v):
    return "" if v is None else str(v).strip()


def parse_data(v):
    if not v:
        return None
    s = str(v).strip()
    for fmt, n in (("%Y-%m-%d", 10), ("%d/%m/%Y", 10), ("%Y%m%d", 8)):
        try:
            return datetime.strptime(s[:n], fmt).date()
        except ValueError:
            continue
    return None


def data_de(m, nomes, *fuzzy):
    for n in nomes:
        d = parse_data(m.get(_k(n)))
        if d:
            return d
    for partes in fuzzy:
        for k, v in m.items():
            if all(p in k for p in partes):
                d = parse_data(v)
                if d:
                    return d
    return None


def iso(d):
    return d.isoformat() if d else None


def formatar_numero(raw):
    """CT20040116 / 20040116 -> ('CT', '116/2004'), igual ao site do Senado."""
    r = raw.strip()
    mt = re.match(r"^([A-Za-z]*)\s*(\d{4})(\d{1,4})$", r)
    if mt:
        tipo, ano, seq = mt.groups()
        return (tipo.upper() or "CT"), f"{int(seq)}/{ano}"
    mt = re.match(r"^([A-Za-z]+)\s*(.+)$", r)
    if mt:
        return mt.group(1).upper(), mt.group(2)
    return "CT", r


# ---------- editais (licitações) ----------

def base_api():
    return os.environ["SENADO_CONTRATOS_URL"].rstrip("/")


def get_json(url):
    r = requests.get(url, headers={"Accept": "application/json"}, timeout=60)
    r.raise_for_status()
    return r.json()


def como_lista(dados):
    if isinstance(dados, dict):
        for k in ("contratos", "licitacoes", "aditivos", "itens", "data", "content", "items", "resultado"):
            if isinstance(dados.get(k), list):
                return dados[k]
        return [dados]
    return dados


def chaves_licitacao(v):
    """Aceita '29/2018', '292018' ou '20180029' e devolve possíveis (sequencial, ano)."""
    s = texto(v)
    m = re.match(r"^(\d+)\s*/\s*(\d{4})$", s)
    if m:
        return [(int(m.group(1)), m.group(2))]
    d = re.sub(r"\D", "", s)
    saida = []
    if len(d) >= 5:
        saida.append((int(d[:-4]), d[-4:]))
        if 1990 <= int(d[:4]) <= 2100:
            saida.append((int(d[4:]), d[:4]))
    return saida


def mapa_editais():
    dados = cache.get("editais")
    if dados is not None:
        return dados
    dados = {}
    try:
        url = base_api().rsplit("/contratos", 1)[0] + "/licitacoes"
        for lic in como_lista(get_json(url)):
            m = mapa(lic)
            link = texto(achar(m, "edital"))
            if not link.startswith("http"):
                _id = pick(m, "id", "codigo")
                link = URL_EDITAL.format(id=_id) if _id else ""
            if not link:
                continue
            for k in chaves_licitacao(pick(m, "numero", "numerolicitacao")):
                dados.setdefault(k, []).append((texto(pick(m, "modalidade")).lower(), link))
    except Exception:
        pass
    cache.set("editais", dados, 6 * 3600 if dados else 300)
    return dados


def localizar_edital(editais, numero_licitacao, modalidade):
    for k in chaves_licitacao(numero_licitacao):
        lst = editais.get(k)
        if lst:
            mod = modalidade.lower()
            for m_, link in lst:
                if mod and m_ and (mod in m_ or m_ in mod):
                    return link
            return lst[0][1]
    return None


# ---------- normalização do contrato ----------

def normalizar(c, editais=None):
    """Se algum campo vier vazio, abra /api/v1/debug-senado/ (admin) e ajuste os nomes abaixo."""
    m = mapa(c)
    assinatura = data_de(m, ["dataAssinatura", "assinatura"])
    publicacao = data_de(m, ["dataPublicacao", "publicacao"])
    inicio = data_de(m, ["inicioVigencia", "dataInicioVigencia", "vigenciaInicio", "dataInicio"], ("inicio", "vigenc")) or assinatura
    fim = data_de(m, ["fimVigencia", "dataFimVigencia", "vigenciaFim", "vigenciaFinal", "dataTermino", "dataFim"],
                  ("fim", "vigenc"), ("termino",), ("final", "vigenc"))
    dias = (fim - date.today()).days if fim else None

    raw = texto(pick(m, "numeroContrato", "numero", "num"))
    tipo, numero = formatar_numero(raw)
    ano = texto(pick(m, "ano", "anoContrato"))
    num_url = re.sub(r"\D", "", raw)
    ano_url = ano if ano and len(num_url) < 8 else ""
    if ano and "/" not in numero and len(num_url) < 8:
        numero = f"{numero}/{ano}"

    valor = pick(m, "valorTotal", "valor", "valorGlobal", "valorContrato", "valorInicial")
    try:
        valor = float(valor) if valor is not None else None
    except (TypeError, ValueError):
        valor = None

    num_lic = texto(pick(m, "numeroLicitacao", "licitacaoNumero", "licitacao"))
    modalidade = texto(pick(m, "modalidade", "modalidadeLicitacao"))
    return {
        "id": texto(pick(m, "id", "codigo", "idContrato", "sequencial")) or f"{num_url}-{ano}",
        "tipo": tipo,
        "numero": numero,
        "objeto": texto(pick(m, "objeto", "descricaoObjeto", "descricao")),
        "fornecedor": texto(pick(m, "empresaNome", "nomeEmpresa", "nomeFornecedor", "empresa", "fornecedor",
                                 "contratada", "razaoSocial")),
        "cnpj": texto(pick(m, "empresaCnpj", "cnpj", "cnpjEmpresa", "cnpjFornecedor", "cnpjCpf")),
        "orgao": texto(pick(m, "orgaoGestorTitular", "orgaoGestor", "unidadeGestoraNome", "unidadeGestora", "orgao"))
                 or "Não informado",
        "valor": valor,
        "assinatura": iso(assinatura),
        "publicacao": iso(publicacao),
        "inicio": iso(inicio),
        "fim": iso(fim),
        "dias_restantes": dias,
        "vence_em_6_meses": dias is not None and 0 <= dias < 180,
        "urgencia_critica": dias is not None and 0 <= dias < 60,
        "processo": texto(pick(m, "processo", "numeroProcesso")),
        "modalidade": modalidade,
        "numero_licitacao": num_lic,
        "edital": localizar_edital(editais or {}, num_lic, modalidade) if num_lic else None,
        "link": f"{URL_SITE}?numero={num_url}&ano={ano_url}&v=true",
    }


def buscar_senado():
    return como_lista(get_json(base_api()))


def serializar(c):
    return {
        "id": c.id, "texto": c.texto, "autor": c.autor.username, "autor_id": c.autor_id,
        "data_controle_interna": c.data_controle_interna, "data_criacao": c.data_criacao,
        "data_modificacao": c.data_modificacao, "foi_editado": c.foi_editado,
    }


def resumir(item):
    m = mapa(item)
    r = {
        "numero": texto(pick(m, "numeroAditivo", "numeroItem", "numero")) or None,
        "descricao": texto(pick(m, "descricao", "objeto")) or None,
        "assinatura": iso(data_de(m, ["dataAssinatura"])),
        "publicacao": iso(data_de(m, ["dataPublicacao"])),
        "fim_vigencia": iso(data_de(m, ["fimVigencia", "dataFimVigencia"], ("fim", "vigenc"))),
        "quantidade": pick(m, "quantidadeContratada", "quantidade"),
        "valor": pick(m, "valorUnitario", "valor", "valorTotal"),
    }
    return {k: v for k, v in r.items() if v is not None}


# ---------- endpoints ----------

class Me(APIView):
    def get(self, request):
        return Response({"id": request.user.id, "username": request.user.username})


class DebugSenado(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        try:
            bruto = buscar_senado()
            return Response({"total": len(bruto), "primeiro_item_bruto": bruto[0] if bruto else None,
                             "primeiro_item_normalizado": normalizar(bruto[0]) if bruto else None})
        except Exception as e:
            return Response({"erro": str(e)}, status=502)


class ContratosVigentes(APIView):
    def get(self, request):
        dados = cache.get("contratos")
        if dados is None:
            try:
                editais = mapa_editais()
                dados = [normalizar(c, editais) for c in buscar_senado()]
            except (requests.RequestException, ValueError) as e:
                return Response({"erro": f"Falha ao consultar o Senado: {e}"},
                                status=status.HTTP_502_BAD_GATEWAY)
            dados = [c for c in dados if c["dias_restantes"] is None or c["dias_restantes"] >= 0]
            cache.set("contratos", dados, 3600)

        por_contrato = {}
        qs = ComentarioAvenca.objects.filter(
            id_avenca_senado__in=[d["id"] for d in dados]).select_related("autor")
        for c in qs:
            por_contrato.setdefault(c.id_avenca_senado, []).append(serializar(c))
        return Response([{**d, "comentarios": por_contrato.get(d["id"], [])} for d in dados])


class ContratoDetalhe(APIView):
    """Aditivos e itens de um contrato, buscados só quando a linha é aberta."""

    def get(self, request, pk):
        chave = f"detalhe-{pk}"
        saida = cache.get(chave)
        if saida is None:
            saida = {"aditivos": [], "itens": [], "erros": []}
            for campo in ("aditivos", "itens"):
                try:
                    saida[campo] = [resumir(x) for x in como_lista(get_json(f"{base_api()}/{pk}/{campo}"))][:100]
                except Exception as e:
                    saida["erros"].append(f"{campo}: {e}")
            if not saida["erros"]:
                cache.set(chave, saida, 1800)
        return Response(saida)


class ComentarioCreate(APIView):
    def post(self, request):
        d = request.data
        if not d.get("id_avenca_senado") or not str(d.get("texto", "")).strip():
            return Response({"erro": "id_avenca_senado e texto são obrigatórios"}, status=400)
        c = ComentarioAvenca.objects.create(
            id_avenca_senado=d["id_avenca_senado"], texto=d["texto"].strip(),
            data_controle_interna=d.get("data_controle_interna") or None, autor=request.user)
        return Response(serializar(c), status=201)


class ComentarioDetail(APIView):
    def _obter(self, request, pk):
        try:
            c = ComentarioAvenca.objects.select_related("autor").get(pk=pk)
        except ComentarioAvenca.DoesNotExist:
            return None, Response({"erro": "Não encontrado"}, status=404)
        if c.autor_id != request.user.id:
            return None, Response({"erro": "Apenas o autor pode alterar"}, status=403)
        return c, None

    def put(self, request, pk):
        c, erro = self._obter(request, pk)
        if erro:
            return erro
        if "texto" in request.data:
            c.texto = str(request.data["texto"]).strip()
        if "data_controle_interna" in request.data:
            c.data_controle_interna = request.data["data_controle_interna"] or None
        c.foi_editado = True
        c.save()
        return Response(serializar(c))

    def delete(self, request, pk):
        c, erro = self._obter(request, pk)
        if erro:
            return erro
        c.delete()
        return Response(status=204)
