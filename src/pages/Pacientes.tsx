import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import type { Paciente } from '../lib/types';
import { cls, cpfMascarado, fmtData, fmtHora, fmtTelefone, hojeISO, MESES } from '../lib/utils';
import { Avatar, Empty, Icon, Pill, Pills, Segmented, Spinner } from '../components/ui';

type Resumo = { proxima?: { data: string; hora_inicio: string }; ultima?: string };

export default function Pacientes() {
  const s = useStore();
  const { etiquetas, versao } = s;
  const [lista, setLista] = useState<Paciente[] | null>(null);
  const [resumo, setResumo] = useState<Record<string, Resumo>>({});
  const [busca, setBusca] = useState('');
  const [modo, setModo] = useState<'cartoes' | 'tabela'>(window.innerWidth < 760 ? 'cartoes' : 'cartoes');
  const [tagsSel, setTagsSel] = useState<string[]>([]);
  const [fAparelho, setFAparelho] = useState(false);
  const [fSemConsulta, setFSemConsulta] = useState(false);
  const [fAniver, setFAniver] = useState(false);
  const [fAtrasados, setFAtrasados] = useState(false); // Pacientes que faltaram ou passaram do dia

  type ConsultaInfo = { data: string; hora_inicio: string; status: string };
  const [detalhesConsultas, setDetalhesConsultas] = useState<Record<string, ConsultaInfo[]>>({});

  useEffect(() => {
    (async () => {
      const hoje = hojeISO();
      const [p, c] = await Promise.all([
        supabase.from('pacientes').select('*, paciente_etiquetas(etiqueta_id)').eq('ativo', true).order('nome'),
        supabase.from('consultas').select('paciente_id,data,hora_inicio,status').order('data', { ascending: false }),
      ]);
      const r: Record<string, Resumo> = {};
      const dets: Record<string, ConsultaInfo[]> = {};
      for (const x of c.data ?? []) {
        (dets[x.paciente_id] ??= []).push(x);
        const o = (r[x.paciente_id] ??= {});
        if (x.status === 'atendido' && x.data <= hoje && !o.ultima) o.ultima = x.data;
        if (['agendado', 'confirmado'].includes(x.status) && x.data >= hoje) o.proxima = x;
      }
      setDetalhesConsultas(dets);
      setResumo(r);
      setLista(p.data ?? []);
    })();
  }, [versao]);

  const mes = new Date().getMonth() + 1;
  const hoje = hojeISO();

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase(); const dig = q.replace(/\D/g, '');
    const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return (lista ?? []).filter((p) => {
      const tags = (p.paciente_etiquetas ?? []).map((x) => x.etiqueta_id);
      if (q && !(norm(p.nome).includes(norm(q)) || (dig.length >= 3 && ((p.telefone_whatsapp ?? '').replace(/\D/g, '').includes(dig) || (p.cpf ?? '').includes(dig))))) return false;
      if (tagsSel.length && !tagsSel.every((t) => tags.includes(t))) return false;
      if (fAparelho && !p.usa_aparelho) return false;
      if (fSemConsulta && resumo[p.id]?.proxima) return false;
      if (fAniver && (!p.data_nascimento || Number(p.data_nascimento.slice(5, 7)) !== mes)) return false;
      
      // Filtro de Paciente que faltou ou passou do dia sem vir
      if (fAtrasados) {
        const hist = detalhesConsultas[p.id] || [];
        const temFaltaRecente = hist.some((c) => c.status === 'faltou');
        const temPassadaNaoAtendida = hist.some((c) => c.data < hoje && ['agendado', 'confirmado'].includes(c.status));
        const aparelhoAtrasado = p.usa_aparelho && !resumo[p.id]?.proxima;
        if (!temFaltaRecente && !temPassadaNaoAtendida && !aparelhoAtrasado) return false;
      }

      return true;
    });
  }, [lista, busca, tagsSel, fAparelho, fSemConsulta, fAniver, fAtrasados, resumo, detalhesConsultas, mes, hoje]);

  const toggleTag = (id: string) => setTagsSel((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  return (
    <div className="page">
      <header className="page-head">
        <div><h1>Pacientes</h1><p className="muted">{lista ? `${lista.length} pacientes cadastrados` : 'Carregando…'}</p></div>
        <div className="head-acoes">
          <Segmented value={modo} onChange={setModo} options={[{ v: 'cartoes', l: <Icon n="grade" s={16} /> }, { v: 'tabela', l: <Icon n="lista" s={16} /> }]} />
          <button className="btn primary" onClick={() => s.abrirPacienteForm({})}><Icon n="mais" s={18} /> Novo paciente</button>
        </div>
      </header>

      <div className="busca-grande"><Icon n="busca" /><input placeholder="Buscar por nome, telefone ou CPF…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {busca && <button className="icon-btn" onClick={() => setBusca('')}><Icon n="x" s={16} /></button>}</div>

      <div className="chips filtros-chips">
        <button className={cls('chip', fAtrasados && 'on vermelho')} onClick={() => setFAtrasados(!fAtrasados)}>⚠️ Faltou / Passou do dia</button>
        <button className={cls('chip', fAparelho && 'on roxo')} onClick={() => setFAparelho(!fAparelho)}>🦷 Usa aparelho</button>
        <button className={cls('chip', fSemConsulta && 'on')} onClick={() => setFSemConsulta(!fSemConsulta)}>📭 Sem consulta marcada</button>
        <button className={cls('chip', fAniver && 'on')} onClick={() => setFAniver(!fAniver)}>🎂 Aniversariantes de {MESES[mes - 1]}</button>
        <span className="sep" />
        {etiquetas.filter((e) => e.tipo === 'paciente').map((e) => (
          <button key={e.id} className={cls('chip-tag', tagsSel.includes(e.id) && 'on')} onClick={() => toggleTag(e.id)}><Pill e={e} small /></button>
        ))}
      </div>

      {!lista ? <Spinner /> : filtrados.length === 0 ? (
        lista.length === 0
          ? <Empty emoji="🧑‍⚕️" titulo="Nenhum paciente ainda" texto="Cadastre o primeiro paciente para começar a marcar consultas." acao={<button className="btn primary" onClick={() => s.abrirPacienteForm({})}>Cadastrar paciente</button>} />
          : <Empty emoji="🔍" titulo="Ninguém encontrado" texto="Tente outra busca ou limpe os filtros." acao={<button className="btn ghost" onClick={() => { setBusca(''); setTagsSel([]); setFAparelho(false); setFSemConsulta(false); setFAniver(false); }}>Limpar filtros</button>} />
      ) : modo === 'cartoes' ? (
        <div className="cards-pacientes fade">{filtrados.map((p) => {
          const r = resumo[p.id] ?? {};
          const hist = detalhesConsultas[p.id] || [];
          const temFaltaRecente = hist.some((c) => c.status === 'faltou');
          const temPassadaNaoAtendida = hist.some((c) => c.data < hoje && ['agendado', 'confirmado'].includes(c.status));
          const alertaAparelho = p.usa_aparelho && !r.proxima;
          const temAtraso = temFaltaRecente || temPassadaNaoAtendida;

          return <button key={p.id} className={cls('card card-paciente', (alertaAparelho || temAtraso) && 'alerta')} onClick={() => s.abrirPaciente(p.id)}>
            <div className="cp-top"><Avatar nome={p.nome} foto={p.foto_url} tam={48} />
              <div><b>{p.nome}</b><small className="muted">{fmtTelefone(p.telefone_whatsapp)}</small></div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                {temFaltaRecente && <span className="pill pill-sm" style={{ background: '#FDE8E8', color: '#9B1C1C', borderColor: '#F8B4B4' }}>Faltou</span>}
                {temPassadaNaoAtendida && !temFaltaRecente && <span className="pill pill-sm" style={{ background: '#FEF08A', color: '#854D0E', borderColor: '#FDE047' }}>Passou da data</span>}
                {p.usa_aparelho && <span className="tag-aparelho" title="Usa aparelho">🦷</span>}
              </div>
            </div>
            <Pills ids={(p.paciente_etiquetas ?? []).map((x) => x.etiqueta_id)} small max={4} />
            <div className="cp-info">
              <div><small>Próxima</small><b className={cls(!r.proxima && ((alertaAparelho || temAtraso) ? 'vermelho-txt' : 'muted'))}>{r.proxima ? `${fmtData(r.proxima.data)} ${fmtHora(r.proxima.hora_inicio)}` : alertaAparelho ? 'Sem manutenção!' : temAtraso ? 'Sem reagendamento!' : '—'}</b></div>
              <div><small>Última visita</small><b>{fmtData(r.ultima) || '—'}</b></div>
            </div>
          </button>;
        })}</div>
      ) : (
        <div className="card tabela-wrap fade"><table className="tabela">
          <thead><tr><th>Paciente</th><th>Telefone</th><th>CPF</th><th>Etiquetas</th><th>Próxima consulta</th><th>Última visita</th></tr></thead>
          <tbody>{filtrados.map((p) => { const r = resumo[p.id] ?? {}; return (
            <tr key={p.id} onClick={() => s.abrirPaciente(p.id)}>
              <td><span className="td-nome"><Avatar nome={p.nome} foto={p.foto_url} tam={32} />{p.nome}{p.usa_aparelho && ' 🦷'}</span></td>
              <td>{fmtTelefone(p.telefone_whatsapp)}</td><td className="muted">{cpfMascarado(p.cpf)}</td>
              <td><Pills ids={(p.paciente_etiquetas ?? []).map((x) => x.etiqueta_id)} small max={3} /></td>
              <td className={cls(p.usa_aparelho && !r.proxima && 'vermelho-txt')}>{r.proxima ? `${fmtData(r.proxima.data)} ${fmtHora(r.proxima.hora_inicio)}` : '—'}</td>
              <td>{fmtData(r.ultima) || '—'}</td>
            </tr>); })}</tbody>
        </table></div>
      )}
    </div>
  );
}
