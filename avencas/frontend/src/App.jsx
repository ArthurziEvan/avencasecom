import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Clock, Search, ChevronDown, ChevronRight, ExternalLink, Send, Pencil, Trash2, Check, X, ShieldAlert,
} from "lucide-react";

const API = import.meta.env.VITE_API;
const SENSIVEIS = ["segurança", "seguranca", " ti ", "infraestrutura", "manutenção", "manutencao", "suporte", "nuvem", "licença", "licenca"];

const fmt = (d) => (d ? new Date(d.length === 10 ? d + "T00:00" : d).toLocaleDateString("pt-BR") : "—");
const brl = (v) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

async function api(path, opts = {}, token) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Token ${token}` }) },
  });
  if (!r.ok) {
    const corpo = await r.json().catch(() => ({}));
    const e = new Error(corpo.erro || corpo.detail || r.status);
    e.status = r.status;
    throw e;
  }
  return r.status === 204 ? null : r.json();
}

function Relogio({ c }) {
  if (c.urgencia_critica)
    return (
      <span className="inline-flex animate-pulse items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
        <Clock size={14} /> {c.dias_restantes} dias
      </span>
    );
  if (c.vence_em_6_meses)
    return (
      <span className="inline-flex items-center gap-1 rounded bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
        <Clock size={14} /> {c.dias_restantes} dias
      </span>
    );
  return null;
}

function Comentarios({ c, user, token, onChange }) {
  const [texto, setTexto] = useState("");
  const [data, setData] = useState("");
  const [edit, setEdit] = useState(null);
  const [erro, setErro] = useState("");

  const enviar = async () => {
    if (!texto.trim()) return;
    try {
      const novo = await api("/comentarios/", {
        method: "POST",
        body: JSON.stringify({ id_avenca_senado: c.id, texto, data_controle_interna: data || null }),
      }, token);
      onChange(c.id, (l) => [novo, ...l]);
      setTexto(""); setData(""); setErro("");
    } catch (e) { setErro("Não foi possível salvar: " + e.message); }
  };

  const salvar = async () => {
    try {
      const at = await api(`/comentarios/${edit.id}/`, {
        method: "PUT",
        body: JSON.stringify({ texto: edit.texto, data_controle_interna: edit.data || null }),
      }, token);
      onChange(c.id, (l) => l.map((x) => (x.id === at.id ? at : x)));
      setEdit(null); setErro("");
    } catch (e) { setErro("Não foi possível editar: " + e.message); }
  };

  const excluir = async (id) => {
    if (!confirm("Excluir este comentário?")) return;
    try {
      await api(`/comentarios/${id}/`, { method: "DELETE" }, token);
      onChange(c.id, (l) => l.filter((x) => x.id !== id));
    } catch (e) { setErro("Não foi possível excluir: " + e.message); }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3}
          placeholder="Novo parecer ou anotação…" className="flex-1 rounded border bg-white p-2 text-sm" />
        <div className="flex flex-col gap-2">
          <label className="text-xs text-gray-600">Data de controle</label>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="rounded border bg-white p-1 text-sm" />
          <button onClick={enviar} className="flex items-center justify-center gap-1 rounded bg-blue-700 px-3 py-1.5 text-sm text-white hover:bg-blue-800">
            <Send size={14} /> Enviar
          </button>
        </div>
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
        {c.comentarios.length === 0 && <p className="text-sm text-gray-500">Nenhum comentário ainda.</p>}
        {c.comentarios.map((m) => (
          <div key={m.id} className="rounded border bg-white p-3 text-sm">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <b className="text-gray-800">{m.autor}</b>
              {m.foi_editado && <span className="rounded bg-gray-200 px-1.5">Editado</span>}
              <span>{fmt(m.data_criacao)}</span>
              {m.data_controle_interna && (
                <span className="rounded bg-yellow-100 px-1.5 py-0.5 font-semibold text-yellow-800">
                  Controle: {fmt(m.data_controle_interna)}
                </span>
              )}
              {m.autor_id === user.id && edit?.id !== m.id && (
                <span className="ml-auto flex gap-3">
                  <button title="Editar" onClick={() => setEdit({ id: m.id, texto: m.texto, data: m.data_controle_interna || "" })}><Pencil size={14} /></button>
                  <button title="Excluir" onClick={() => excluir(m.id)}><Trash2 size={14} /></button>
                </span>
              )}
            </div>
            {edit?.id === m.id ? (
              <div className="space-y-2">
                <textarea value={edit.texto} onChange={(e) => setEdit({ ...edit, texto: e.target.value })} className="w-full rounded border p-2" rows={3} />
                <div className="flex items-center gap-2">
                  <input type="date" value={edit.data} onChange={(e) => setEdit({ ...edit, data: e.target.value })} className="rounded border p-1" />
                  <button onClick={salvar} className="rounded bg-green-600 p-1.5 text-white"><Check size={16} /></button>
                  <button onClick={() => setEdit(null)} className="rounded bg-gray-300 p-1.5"><X size={16} /></button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap">{m.texto}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Login({ onLogin }) {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [erro, setErro] = useState("");

  const entrar = async () => {
    try {
      const { token } = await api("/login/", { method: "POST", body: JSON.stringify({ username: u, password: p }) });
      const me = await api("/me/", {}, token);
      onLogin({ token, id: me.id, username: me.username });
    } catch { setErro("Usuário ou senha inválidos"); }
  };

  return (
    <div className="mx-auto mt-24 w-80 space-y-3 rounded border bg-white p-6">
      <h1 className="text-xl font-semibold">Controle de Avenças</h1>
      <input placeholder="Usuário" value={u} onChange={(e) => setU(e.target.value)} className="w-full rounded border p-2" />
      <input type="password" placeholder="Senha" value={p} onChange={(e) => setP(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && entrar()} className="w-full rounded border p-2" />
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <button onClick={entrar} className="w-full rounded bg-blue-700 p-2 text-white">Entrar</button>
    </div>
  );
}

export default function App() {
  const [sessao, setSessao] = useState(() => JSON.parse(localStorage.getItem("sessao") || "null"));
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [orgao, setOrgao] = useState("");
  const [so6m, setSo6m] = useState(false);
  const [soSensiveis, setSoSensiveis] = useState(false);
  const [ordem, setOrdem] = useState("urgencia");
  const [aberto, setAberto] = useState({});

  const login = (s) => { localStorage.setItem("sessao", JSON.stringify(s)); setSessao(s); };
  const sair = () => { localStorage.removeItem("sessao"); setSessao(null); setLista([]); };

  useEffect(() => {
    if (!sessao) return;
    setCarregando(true);
    api("/contratos-vigentes/", {}, sessao.token)
      .then((d) => { setLista(d); setErro(""); })
      .catch((e) => (e.status === 401 ? sair() : setErro("Erro ao carregar: " + e.message)))
      .finally(() => setCarregando(false));
  }, [sessao]);

  const atualizarComentarios = (id, fn) =>
    setLista((l) => l.map((c) => (c.id === id ? { ...c, comentarios: fn(c.comentarios) } : c)));

  const orgaos = useMemo(() => [...new Set(lista.map((c) => c.orgao))].sort(), [lista]);

  const filtrada = useMemo(() => {
    const q = busca.toLowerCase();
    return lista
      .filter((c) =>
        (!so6m || c.vence_em_6_meses) &&
        (!orgao || c.orgao === orgao) &&
        (!soSensiveis || SENSIVEIS.some((t) => ` ${c.objeto.toLowerCase()} `.includes(t))) &&
        (!q || `${c.fornecedor} ${c.objeto} ${c.numero} ${c.cnpj}`.toLowerCase().includes(q)))
      .sort((a, b) =>
        ordem === "valor" ? (b.valor || 0) - (a.valor || 0)
        : ordem === "comentarios" ? b.comentarios.length - a.comentarios.length
        : (a.dias_restantes ?? 1e9) - (b.dias_restantes ?? 1e9));
  }, [lista, busca, orgao, so6m, soSensiveis, ordem]);

  if (!sessao) return <Login onLogin={login} />;

  return (
    <div className="mx-auto max-w-6xl p-4 text-gray-800">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Contratos vigentes</h1>
        <button className="text-sm text-blue-700" onClick={sair}>Sair ({sessao.username})</button>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded border p-3"><div className="text-2xl font-bold">{lista.length}</div><div className="text-sm">Contratos vigentes</div></div>
        <button onClick={() => setSo6m(!so6m)} className="rounded border border-orange-300 bg-orange-50 p-3 text-left">
          <div className="text-2xl font-bold text-orange-700">{lista.filter((c) => c.vence_em_6_meses).length}</div>
          <div className="text-sm">Vencem em 6 meses</div>
        </button>
        <div className="rounded border border-red-300 bg-red-50 p-3">
          <div className="text-2xl font-bold text-red-700">{lista.filter((c) => c.urgencia_critica).length}</div>
          <div className="text-sm">Críticos (menos de 60 dias)</div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded bg-gray-100 p-3">
        <div className="flex items-center gap-1 rounded border bg-white px-2">
          <Search size={16} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Empresa, contrato ou objeto" className="p-2 text-sm outline-none" />
        </div>
        <select value={orgao} onChange={(e) => setOrgao(e.target.value)} className="rounded border bg-white p-2 text-sm">
          <option value="">Todos os órgãos</option>
          {orgaos.map((o) => <option key={o}>{o}</option>)}
        </select>
        <select value={ordem} onChange={(e) => setOrdem(e.target.value)} className="rounded border bg-white p-2 text-sm">
          <option value="urgencia">Vencimento mais próximo</option>
          <option value="valor">Maior valor</option>
          <option value="comentarios">Mais comentados</option>
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={so6m} onChange={(e) => setSo6m(e.target.checked)} />
          <Clock size={14} /> Vencem nos próximos 6 meses
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={soSensiveis} onChange={(e) => setSoSensiveis(e.target.checked)} />
          <ShieldAlert size={14} /> Objeto sensível
        </label>
      </div>

      {erro && <p className="mb-2 text-red-600">{erro}</p>}
      <p className="mb-2 text-sm text-blue-700">{carregando ? "Carregando…" : `${filtrada.length} contrato(s) encontrado(s).`}</p>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b font-semibold">
            <th className="w-8 p-2" /><th className="p-2">Empresa</th><th className="p-2">Contrato</th>
            <th className="p-2">Objeto</th><th className="p-2">Vigência</th>
          </tr>
        </thead>
        <tbody>
          {filtrada.map((c) => (
            <Fragment key={c.id}>
              <tr onClick={() => setAberto({ ...aberto, [c.id]: !aberto[c.id] })}
                className={`cursor-pointer border-b border-l-4 hover:bg-gray-50 ${
                  c.urgencia_critica ? "border-l-red-500" : c.vence_em_6_meses ? "border-l-orange-400" : "border-l-gray-300"}`}>
                <td className="p-2">{aberto[c.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                <td className="p-2">{c.fornecedor}<div className="text-xs text-gray-500">{c.cnpj}</div></td>
                <td className="p-2 text-blue-800">
                  <a href={c.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1">
                    CT {c.numero} <ExternalLink size={12} />
                  </a>
                  <div className="mt-1"><Relogio c={c} /></div>
                </td>
                <td className="p-2 text-blue-800">{c.objeto}<div className="text-xs text-gray-500">{c.comentarios.length} comentário(s)</div></td>
                <td className="whitespace-nowrap p-2">{fmt(c.inicio)}<br />até {fmt(c.fim)}</td>
              </tr>
              {aberto[c.id] && (
                <tr>
                  <td colSpan={5} className="bg-gray-50 p-4">
                    <p className="mb-3 text-xs text-gray-600">Órgão gestor: {c.orgao} · Valor: {brl(c.valor)}</p>
                    <Comentarios c={c} user={sessao} token={sessao.token} onChange={atualizarComentarios} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
