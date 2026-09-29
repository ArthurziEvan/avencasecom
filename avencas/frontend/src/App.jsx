import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Clock, Search, ChevronDown, ChevronRight, ExternalLink, Send, Pencil, Trash2, Check, X,
  ShieldAlert, FileText, Download, Eraser, LogOut, Landmark,
} from "lucide-react";

const API = import.meta.env.VITE_API;
const SENSIVEIS = ["segurança", "seguranca", " ti ", "infraestrutura", "manutenção", "manutencao", "suporte", "nuvem", "licença", "licenca"];
const ESPECIES = [
  "Acordo de Cooperação Técnica", "Ata de Registro de Preços", "Autorização de Uso", "Carta Contrato", "Cessão de Uso",
  "Comodato", "Contrato", "Contrato de Adesão", "Convênio", "Convênio - Consignação",
  "Credenciamento de Entidade de Saúde", "Memorando de Entendimento", "Nota de Empenho", "Permissão de Uso",
  "Protocolo de Execução", "Protocolo de Intenções",
];
const VAZIO = { empresa: "", numero: "", ano: "", objeto: "", especie: "", maoObra: false, obras: false, renovacao: false };

const fmt = (d) => (d ? new Date(d.length === 10 ? d + "T00:00" : d).toLocaleDateString("pt-BR") : "—");
const brl = (v) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const digitos = (s) => String(s || "").replace(/\D/g, "");

function chaveNumero(c) {
  const [seq, ano] = String(c.numero).split("/");
  return `${ano || ""}${digitos(seq).padStart(4, "0")}`;
}
function anoDe(c) { return String(c.numero).split("/")[1] || ""; }
function progresso(c) {
  if (!c.inicio || !c.fim) return 0;
  const i = new Date(c.inicio).getTime(), f = new Date(c.fim).getTime();
  return Math.max(0, Math.min(100, ((Date.now() - i) / (f - i)) * 100));
}
function baixarCSV(lista, nome) {
  const cab = ["Empresa", "CNPJ", "Contrato", "Objeto", "Início", "Fim", "Dias restantes", "Valor", "Órgão", "Edital"];
  const lin = lista.map((c) => [c.fornecedor, c.cnpj, `${c.tipo} ${c.numero}`, c.objeto, fmt(c.inicio), fmt(c.fim),
    c.dias_restantes ?? "", c.valor ?? "", c.orgao, c.edital || ""]);
  const txt = [cab, ...lin].map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + txt], { type: "text/csv;charset=utf-8" }));
  a.download = nome;
  a.click();
}

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

function Prazo({ c }) {
  if (c.dias_restantes == null) return <span className="text-xs text-slate-400">sem prazo</span>;
  if (c.dias_restantes < 0)
    return <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">Encerrado</span>;
  const cor = c.urgencia_critica ? "bg-red-100 text-red-700" : c.vence_em_6_meses ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cor} ${c.urgencia_critica ? "animate-pulse" : ""}`}>
      <Clock size={12} /> {c.dias_restantes === 0 ? "vence hoje" : `${c.dias_restantes} dias`}
    </span>
  );
}

function Barra({ c }) {
  const cor = c.urgencia_critica ? "bg-red-500" : c.vence_em_6_meses ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div className={`h-full rounded-full ${cor}`} style={{ width: `${progresso(c)}%` }} />
    </div>
  );
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
    if (!confirm("Excluir esta anotação?")) return;
    try {
      await api(`/comentarios/${id}/`, { method: "DELETE" }, token);
      onChange(c.id, (l) => l.filter((x) => x.id !== id));
    } catch (e) { setErro("Não foi possível excluir: " + e.message); }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3}
          placeholder="Escreva um parecer ou anotação sobre esta avença…"
          className="w-full resize-y rounded border border-slate-200 p-2 text-sm outline-none focus:border-sky-600" />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            Data de controle
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className="rounded border border-slate-200 p-1 text-sm" />
          </label>
          <button onClick={enviar} className="flex items-center gap-1 rounded bg-sky-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-900">
            <Send size={14} /> Salvar anotação
          </button>
        </div>
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {c.comentarios.length === 0 && <p className="text-sm text-slate-500">Nenhuma anotação ainda. Registre o primeiro parecer acima.</p>}
        {c.comentarios.map((m) => (
          <div key={m.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <b className="text-slate-800">{m.autor}</b>
              {m.foi_editado && <span className="rounded bg-slate-200 px-1.5">Editado</span>}
              <span>{fmt(m.data_criacao)}</span>
              {m.data_controle_interna && (
                <span className="rounded bg-yellow-100 px-1.5 py-0.5 font-semibold text-yellow-800">Controle: {fmt(m.data_controle_interna)}</span>
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
                  <button onClick={salvar} className="rounded bg-emerald-600 p-1.5 text-white"><Check size={16} /></button>
                  <button onClick={() => setEdit(null)} className="rounded bg-slate-300 p-1.5"><X size={16} /></button>
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
    <div className="grid min-h-screen place-items-center bg-slate-100 p-4">
      <div className="w-full max-w-sm space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-sky-900"><Landmark size={22} /><h1 className="text-xl font-semibold">Controle de Avenças</h1></div>
        <input placeholder="Usuário" value={u} onChange={(e) => setU(e.target.value)} className="w-full rounded border border-slate-300 p-2" />
        <input type="password" placeholder="Senha" value={p} onChange={(e) => setP(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && entrar()} className="w-full rounded border border-slate-300 p-2" />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button onClick={entrar} className="w-full rounded bg-sky-800 p-2 font-medium text-white hover:bg-sky-900">Entrar</button>
      </div>
    </div>
  );
}

const campo = "rounded border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-sky-600 focus:ring-1 focus:ring-sky-600";

export default function App() {
  const [sessao, setSessao] = useState(() => JSON.parse(localStorage.getItem("sessao") || "null"));
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState("vigentes");
  const [rascunho, setRascunho] = useState(VAZIO);
  const [f, setF] = useState(VAZIO);
  const [orgao, setOrgao] = useState("");
  const [so6m, setSo6m] = useState(false);
  const [soCriticos, setSoCriticos] = useState(false);
  const [soSensiveis, setSoSensiveis] = useState(false);
  const [ordem, setOrdem] = useState("urgencia");
  const [aberto, setAberto] = useState({});

  const login = (s) => { localStorage.setItem("sessao", JSON.stringify(s)); setSessao(s); };
  const sair = () => { localStorage.removeItem("sessao"); setSessao(null); setLista([]); };

  useEffect(() => {
    if (!sessao) return;
    setCarregando(true);
    api(`/contratos-vigentes/?situacao=${aba}`, {}, sessao.token)
      .then((d) => { setLista(d); setErro(""); })
      .catch((e) => (e.status === 401 ? sair() : setErro("Erro ao carregar: " + e.message)))
      .finally(() => setCarregando(false));
  }, [sessao, aba]);

  const atualizarComentarios = (id, fn) =>
    setLista((l) => l.map((c) => (c.id === id ? { ...c, comentarios: fn(c.comentarios) } : c)));

  const orgaos = useMemo(() => [...new Set(lista.map((c) => c.orgao))].sort(), [lista]);
  const especies = useMemo(() => [...new Set([...ESPECIES, ...lista.map((c) => c.especie).filter(Boolean)])].sort(), [lista]);
  const buscar = () => setF(rascunho);
  const limpar = () => { setRascunho(VAZIO); setF(VAZIO); setOrgao(""); setSo6m(false); setSoCriticos(false); setSoSensiveis(false); };
  const set = (k, v) => setRascunho((r) => ({ ...r, [k]: v }));

  const filtrada = useMemo(() => {
    const emp = norm(f.empresa), obj = norm(f.objeto), num = digitos(f.numero);
    return lista
      .filter((c) =>
        (!emp || norm(`${c.fornecedor} ${c.cnpj}`).includes(emp) || (digitos(emp) && digitos(c.cnpj).includes(digitos(emp)))) &&
        (!num || chaveNumero(c).includes(num) || digitos(c.numero).includes(num)) &&
        (!f.ano || anoDe(c) === f.ano) &&
        (!obj || norm(c.objeto).includes(obj)) &&
        (!f.especie || c.especie === f.especie) &&
        (!f.maoObra || c.mao_de_obra) && (!f.obras || c.obra_engenharia) && (!f.renovacao || c.em_renovacao) &&
        (!orgao || c.orgao === orgao) &&
        (!so6m || c.vence_em_6_meses) && (!soCriticos || c.urgencia_critica) &&
        (!soSensiveis || SENSIVEIS.some((t) => ` ${c.objeto.toLowerCase()} `.includes(t))))
      .sort((a, b) =>
        ordem === "valor" ? (b.valor || 0) - (a.valor || 0)
        : ordem === "comentarios" ? b.comentarios.length - a.comentarios.length
        : aba === "encerrados" ? (b.dias_restantes ?? -1e9) - (a.dias_restantes ?? -1e9)
        : (a.dias_restantes ?? 1e9) - (b.dias_restantes ?? 1e9));
  }, [lista, f, orgao, so6m, soCriticos, soSensiveis, ordem, aba]);

  if (!sessao) return <Login onLogin={login} />;

  const n6 = lista.filter((c) => c.vence_em_6_meses).length;
  const nCrit = lista.filter((c) => c.urgencia_critica).length;
  const Stat = ({ n, rotulo, cor, ativo, onClick }) => (
    <button onClick={onClick} className={`rounded-xl border-2 p-4 text-left transition ${cor} ${ativo ? "ring-2 ring-sky-700" : ""}`}>
      <div className="text-3xl font-bold tabular-nums">{n}</div>
      <div className="text-sm">{rotulo}</div>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="bg-sky-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2"><Landmark size={22} /><h1 className="text-xl font-semibold">Controle de Avenças · SECOM</h1></div>
          <button onClick={sair} className="flex items-center gap-1 text-sm text-sky-100 hover:text-white"><LogOut size={15} /> Sair ({sessao.username})</button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 p-4">
        {aba === "vigentes" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat n={lista.length} rotulo="Contratos vigentes" cor="border-slate-300 bg-white" ativo={!so6m && !soCriticos} onClick={() => { setSo6m(false); setSoCriticos(false); }} />
            <Stat n={n6} rotulo="Vencem em 6 meses" cor="border-amber-300 bg-amber-50 text-amber-900" ativo={so6m} onClick={() => { setSo6m(!so6m); setSoCriticos(false); }} />
            <Stat n={nCrit} rotulo="Críticos (menos de 60 dias)" cor="border-red-300 bg-red-50 text-red-800" ativo={soCriticos} onClick={() => { setSoCriticos(!soCriticos); setSo6m(false); }} />
          </div>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-4" onKeyDown={(e) => e.key === "Enter" && buscar()}>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
            <input className={`${campo} md:col-span-2`} placeholder="Empresa ou CNPJ" value={rascunho.empresa} onChange={(e) => set("empresa", e.target.value)} />
            <input className={campo} placeholder="Número (ex.: 20210158)" value={rascunho.numero} onChange={(e) => set("numero", e.target.value)} />
            <input className={campo} placeholder="Ano do contrato" value={rascunho.ano} onChange={(e) => set("ano", e.target.value)} />
            <input className={`${campo} md:col-span-2`} placeholder="Objeto do contrato" value={rascunho.objeto} onChange={(e) => set("objeto", e.target.value)} />
            <select className={`${campo} md:col-span-3`} value={rascunho.especie} onChange={(e) => set("especie", e.target.value)}>
              <option value="">Todas espécies</option>
              {especies.map((e) => <option key={e}>{e}</option>)}
            </select>
            <select className={`${campo} md:col-span-3`} value={orgao} onChange={(e) => setOrgao(e.target.value)}>
              <option value="">Todos os órgãos</option>
              {orgaos.map((o) => <option key={o}>{o}</option>)}
            </select>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={rascunho.maoObra} onChange={(e) => set("maoObra", e.target.checked)} /> Apenas mão de obra</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={rascunho.obras} onChange={(e) => set("obras", e.target.checked)} /> Apenas obras de engenharia</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={rascunho.renovacao} onChange={(e) => set("renovacao", e.target.checked)} /> Apenas em renovação</label>
            <label className="flex items-center gap-1.5"><ShieldAlert size={14} /><input type="checkbox" checked={soSensiveis} onChange={(e) => setSoSensiveis(e.target.checked)} /> Objeto sensível</label>
            <select className={`${campo} ml-auto`} value={ordem} onChange={(e) => setOrdem(e.target.value)}>
              <option value="urgencia">{aba === "vigentes" ? "Vencimento mais próximo" : "Encerrados mais recentes"}</option>
              <option value="valor">Maior valor</option>
              <option value="comentarios">Mais anotados</option>
            </select>
            <button onClick={limpar} className="flex items-center gap-1 rounded border border-slate-300 px-3 py-2 hover:bg-slate-50"><Eraser size={14} /> Limpar</button>
            <button onClick={buscar} className="flex items-center gap-1 rounded bg-sky-800 px-4 py-2 font-medium text-white hover:bg-sky-900"><Search size={14} /> Buscar</button>
          </div>
        </section>

        <div className="flex items-end justify-between border-b border-slate-300">
          <div className="flex gap-1">
            {["vigentes", "encerrados"].map((a) => (
              <button key={a} onClick={() => setAba(a)}
                className={`rounded-t-lg border border-b-0 px-5 py-2 text-sm font-medium capitalize ${aba === a ? "border-slate-300 bg-white text-sky-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                {a}
              </button>
            ))}
          </div>
          <button onClick={() => baixarCSV(filtrada, `avencas-${aba}.csv`)} disabled={!filtrada.length}
            className="mb-1 flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40">
            <Download size={14} /> Exportar CSV
          </button>
        </div>

        {erro && <p className="text-red-600">{erro}</p>}
        <p className="text-sm text-sky-800">{carregando ? "Carregando…" : `${filtrada.length} contrato(s) encontrado(s).`}</p>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr><th className="w-8 p-3" /><th className="p-3">Empresa</th><th className="p-3">Contrato</th><th className="p-3">Objeto</th><th className="w-48 p-3">Vigência</th></tr>
            </thead>
            <tbody>
              {filtrada.map((c) => (
                <Fragment key={c.id}>
                  <tr onClick={() => setAberto({ ...aberto, [c.id]: !aberto[c.id] })}
                    className={`cursor-pointer border-t border-l-4 align-top hover:bg-sky-50/50 ${
                      aba === "encerrados" ? "border-l-slate-300" : c.urgencia_critica ? "border-l-red-500" : c.vence_em_6_meses ? "border-l-amber-400" : "border-l-emerald-400"}`}>
                    <td className="p-3">{aberto[c.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</td>
                    <td className="p-3 font-medium">{c.fornecedor}<div className="text-xs font-normal text-slate-500">{c.cnpj}</div></td>
                    <td className="whitespace-nowrap p-3">
                      <a href={c.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 font-medium text-sky-800 hover:underline">
                        {c.tipo} {c.numero} <ExternalLink size={12} />
                      </a>
                    </td>
                    <td className="p-3">
                      <div className="line-clamp-3">{c.objeto}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        {c.comentarios.length > 0 && <span className="rounded bg-yellow-100 px-1.5 py-0.5 font-semibold text-yellow-800">{c.comentarios.length} anotação(ões)</span>}
                        {c.edital && <span className="inline-flex items-center gap-1"><FileText size={12} /> edital disponível</span>}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="whitespace-nowrap tabular-nums">{fmt(c.inicio)} <span className="text-slate-400">até</span> <b>{fmt(c.fim)}</b></div>
                      <Barra c={c} />
                      <div className="mt-1.5"><Prazo c={c} /></div>
                    </td>
                  </tr>
                  {aberto[c.id] && (
                    <tr className="border-t bg-slate-50">
                      <td colSpan={5} className="p-4">
                        <div className="grid gap-4 lg:grid-cols-5">
                          <dl className="space-y-2 text-sm lg:col-span-2">
                            <div><dt className="text-xs text-slate-500">Espécie</dt><dd>{c.especie || c.tipo}</dd></div>
                            <div><dt className="text-xs text-slate-500">Órgão gestor</dt><dd>{c.orgao}</dd></div>
                            <div><dt className="text-xs text-slate-500">Valor</dt><dd>{brl(c.valor)}</dd></div>
                            <div><dt className="text-xs text-slate-500">Processo</dt><dd>{c.processo || "—"}</dd></div>
                            <div><dt className="text-xs text-slate-500">Licitação</dt><dd>{[c.modalidade, c.numero_licitacao].filter(Boolean).join(" ") || "—"}</dd></div>
                            <div className="flex flex-wrap gap-2 pt-1">
                              {c.edital && <a href={c.edital} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded bg-sky-800 px-3 py-1.5 text-white hover:bg-sky-900"><FileText size={14} /> Abrir edital</a>}
                              <a href={c.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50"><ExternalLink size={14} /> Ver no Senado</a>
                            </div>
                          </dl>
                          <div className="lg:col-span-3"><Comentarios c={c} user={sessao} token={sessao.token} onChange={atualizarComentarios} /></div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!carregando && !filtrada.length && <tr><td colSpan={5} className="p-8 text-center text-slate-500">Nenhum contrato com esses filtros. Clique em Limpar para recomeçar.</td></tr>}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
