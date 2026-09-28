import os
from datetime import date, datetime

import requests
from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ComentarioAvenca

URL_SITE = "https://www6g.senado.gov.br/transparencia/licitacoes-e-contratos/contratos"


def pick(c, *nomes):
    mapa = {str(k).lower(): v for k, v in c.items()}
    for n in nomes:
        v = mapa.get(n.lower())
        if v not in (None, "", []):
            return v
    return None


def texto(v):
    if isinstance(v, dict):
        return str(pick(v, "nome", "razaoSocial", "descricao", "sigla") or "")
    return "" if v is None else str(v)


def parse_data(v):
    if not v:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(str(v)[:10], fmt).date()
        except ValueError:
            continue
    return None


def normalizar(c):
    """Se algum campo vier vazio na tela, acesse /api/v1/debug-senado/ e ajuste os nomes abaixo."""
    inicio = parse_data(pick(c, "dataInicioVigencia", "dataInicio", "inicioVigencia", "dataAssinatura"))
    fim = parse_data(pick(c, "dataFimVigencia", "dataFim", "fimVigencia", "dataTermino"))
    dias = (fim - date.today()).days if fim else None
    numero = texto(pick(c, "numero", "numeroContrato", "num"))
    ano = texto(pick(c, "ano", "anoContrato"))
    valor = pick(c, "valorTotal", "valor", "valorGlobal", "valorContrato")
    try:
        valor = float(valor) if valor is not None else None
    except (TypeError, ValueError):
        valor = None
    link = texto(pick(c, "urlContrato", "url", "link", "urlDocumento"))
    if not link:
        link = f"{URL_SITE}?numero={numero}&ano={ano}&v=true"
    return {
        "id": texto(pick(c, "id", "codigo", "idContrato", "sequencial")) or f"{numero}-{ano}",
        "numero": f"{numero}/{ano}" if ano else numero,
        "objeto": texto(pick(c, "objeto", "descricaoObjeto", "descricao")),
        "fornecedor": texto(pick(c, "nomeEmpresa", "nomeFornecedor", "empresa", "fornecedor", "contratada", "razaoSocial")),
        "cnpj": texto(pick(c, "cnpj", "cnpjEmpresa", "cnpjFornecedor", "cnpjCpf")),
        "orgao": texto(pick(c, "orgaoGestorTitular", "orgaoGestor", "unidadeGestora", "orgao")) or "Não informado",
        "valor": valor,
        "inicio": inicio.isoformat() if inicio else None,
        "fim": fim.isoformat() if fim else None,
        "dias_restantes": dias,
        "vence_em_6_meses": dias is not None and 0 <= dias < 180,
        "urgencia_critica": dias is not None and 0 <= dias < 60,
        "link": link,
    }


def buscar_senado():
    r = requests.get(os.environ["SENADO_CONTRATOS_URL"],
                     headers={"Accept": "application/json"}, timeout=60)
    r.raise_for_status()
    dados = r.json()
    if isinstance(dados, dict):
        for k in ("contratos", "data", "content", "items", "resultado"):
            if isinstance(dados.get(k), list):
                return dados[k]
        return [dados]
    return dados


def serializar(c):
    return {
        "id": c.id, "texto": c.texto, "autor": c.autor.username, "autor_id": c.autor_id,
        "data_controle_interna": c.data_controle_interna, "data_criacao": c.data_criacao,
        "data_modificacao": c.data_modificacao, "foi_editado": c.foi_editado,
    }


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
                dados = [normalizar(c) for c in buscar_senado()]
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
