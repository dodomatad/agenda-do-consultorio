import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import type { Consulta, Mensagem, Paciente, TransacaoFinanceira } from '../lib/types';
import { addDias, cpfMascarado, diffDias, fmtCpf, fmtData, fmtHora, fmtMoeda, fmtTelefone, hojeISO, STATUS_INFO, tempoRelativo } from '../lib/utils';
import { Avatar, Empty, Icon, Modal, Pills, Segmented, TagPicker, Toggle } from './ui';

// ---------------------------------------------------------------------
// Cadastro / edição
// ---------------------------------------------------------------------
export function PacienteForm() {
  const { pacienteForm: pf, abrirPacienteForm, toast, bump } = useStore();
  const [f, setF] = useState<Partial<Paciente>>({ nome: pf?.nome ?? '', usa_aparelho: false, intervalo_manutencao_dias: 30, aceita_whatsapp: true, ativo: true });
  const [tags, setTags] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof Paciente, v: any) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!pf?.id) return;
    supabase.from('pacientes').select('*, paciente_etiquetas(etiqueta_id)').eq('id', pf.id).single().then(({ data }) => {
      if (data) { const { paciente_etiquetas, ...rest } = data; setF(rest); setTags(paciente_etiquetas.map((x: any) => x.etiqueta_id)); }
    });
  }, [pf?.id]);

  async function salvar() {
    if (!f.nome?.trim()) return toast('Informe o nome', 'erro');
    if (!f.telefone_whatsapp?.trim()) return toast('Informe o telefone/WhatsApp', 'erro');
    setSalvando(true);
    const dados = { ...f, cpf: f.cpf?.replace(/\D/g, '') || null, email: f.email || null, data_nascimento: f.data_nascimento || null };
    delete (dados as any).id; delete (dados as any).criado_em;
    const q = pf?.id ? supabase.from('pacientes').update(dados).eq('id', pf.id) : supabase.from('pacientes').insert(dados);
    const { data, error } = await q.select().single();
    if (error) { setSalvando(false); return toast('Erro: ' + error.message, 'erro'); }
    await supabase.from('paciente_etiquetas').delete().eq('paciente_id', data.id);
    if (tags.length) await supabase.from('paciente_etiquetas').insert(tags.map((t) => ({ paciente_id: data.id, etiqueta_id: t })));
    setSalvando(false); toast(pf?.id ? 'Paciente atualizado' : 'Paciente cadastrado'); bump();
    pf?.onSalvo?.(data); abrirPacienteForm(null);
  }

  return (
    <Modal titulo={pf?.id ? 'Editar paciente' : 'Novo paciente'} onClose={() => abrirPacienteForm(null)} largura={600}
      rodape={<><button className="btn ghost" onClick={() => abrirPacienteForm(null)}>Cancelar</button>
        <button className="btn primary" disabled={salvando} onClick={salvar}><Icon n="check" s={18} /> {salvando ? 'Salvando…' : 'Salvar'}</button></>}>
      <label className="field"><span>Nome completo *</span><input autoFocus value={f.nome ?? ''} onChange={(e) => set('nome', e.target.value)} /></label>
      <div className="grid2">
        <label className="field"><span>Telefone / WhatsApp *</span><input inputMode="tel" placeholder="(11) 98765-4321" value={f.telefone_whatsapp ?? ''} onChange={(e) => set('telefone_whatsapp', e.target.value)} /></label>
        <label className="field"><span>Data de nascimento</span><input type="date" value={f.data_nascimento ?? ''} onChange={(e) => set('data_nascimento', e.target.value)} /></label>
        <label className="field"><span>CPF (opcional)</span><input inputMode="numeric" value={fmtCpf(f.cpf ?? '')} onChange={(e) => set('cpf', e.target.value)} /></label>
        <label className="field"><span>E-mail (opcional)</span><input type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></label>
      </div>
      <label className="field"><span>Etiquetas</span><TagPicker tipo="paciente" value={tags} onChange={setTags} /></label>
      <div className="box-roxo">
        <Toggle on={!!f.usa_aparelho} onChange={(v) => set('usa_aparelho', v)} label={<b>🦷 Usa aparelho ortodôntico</b>} />
        {f.usa_aparelho && <label className="field inline"><span>Manutenção a cada</span>
          <input type="number" min={7} max={120} value={f.intervalo_manutencao_dias ?? 30} onChange={(e) => set('intervalo_manutencao_dias', Number(e.target.value))} /> dias</label>}
      </div>
      <Toggle on={!!f.aceita_whatsapp} onChange={(v) => set('aceita_whatsapp', v)} label="Aceita receber mensagens pelo WhatsApp" />
      <label className="field"><span>Foto (link, opcional)</span><input value={f.foto_url ?? ''} onChange={(e) => set('foto_url', e.target.value)} placeholder="https://…" /></label>
      <label className="field"><span>Observações</span><textarea rows={3} value={f.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} /></label>
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Ficha do paciente
// ---------------------------------------------------------------------
export function PacienteFicha() {
  const s = useStore();
  const { pacienteFicha: id, abrirPaciente, procedimentos, versao, toast, bump, isAdmin } = s;
  const [p, setP] = useState<Paciente | null>(null);
  const [consultas, setConsultas] = useState<Consulta[]>([]);
  const [msgs, setMsgs] = useState<Mensagem[]>([]);
  const [transacoes, setTransacoes] = useState<TransacaoFinanceira[]>([]);
  const [aba, setAba] = useState<'dados' | 'consultas' | 'financeiro' | 'mensagens' | 'obs'>('dados');
  const [obs, setObs] = useState('');
  const [addTag, setAddTag] = useState(false);

  async function carregar() {
    const [a, b, c, d] = await Promise.all([
      supabase.from('pacientes').select('*, paciente_etiquetas(etiqueta_id)').eq('id', id!).single(),
      supabase.from('consultas').select('*').eq('paciente_id', id!).order('data', { ascending: false }).order('hora_inicio', { ascending: false }),
      supabase.from('mensagens_whatsapp').select('*').eq('paciente_id', id!).order('criado_em', { ascending: true }).limit(200),
      supabase.from('transacoes_financeiras').select('*').eq('paciente_id', id!).order('data_competencia', { ascending: false }),
    ]);
    setP(a.data); setObs(a.data?.observacoes ?? ''); setConsultas(b.data ?? []); setMsgs(c.data ?? []); setTransacoes(d.data ?? []);
  }
  useEffect(() => { if (id) carregar(); }, [id, versao]); // eslint-disable-line

  if (!p) return null;
  const fechar = () => abrirPaciente(null);
  const tags = (p.paciente_etiquetas ?? []).map((x) => x.etiqueta_id);
  const hoje = hojeISO();
  const proxima = [...consultas].reverse().find((c) => c.data >= hoje && ['agendado', 'confirmado'].includes(c.status));
  const ultimaManut = consultas.find((c) => c.status === 'atendido' && procedimentos.find((x) => x.id === c.procedimento_id)?.eh_manutencao_aparelho);
  const vencManut = ultimaManut ? addDias(ultimaManut.data, p.intervalo_manutencao_dias) : null;

  const totalPago = transacoes.filter((t) => t.status === 'pago').reduce((acc, t) => acc + Math.round(Number(t.valor) * 100), 0) / 100;
  const totalPendente = transacoes.filter((t) => t.status === 'pendente').reduce((acc, t) => acc + Math.round(Number(t.valor) * 100), 0) / 100;

  async function salvarTags(ids: string[]) {
    await supabase.from('paciente_etiquetas').delete().eq('paciente_id', p!.id);
    if (ids.length) await supabase.from('paciente_etiquetas').insert(ids.map((t) => ({ paciente_id: p!.id, etiqueta_id: t })));
    carregar(); bump();
  }
  async function excluir() {
    if (!(await s.confirmar(`Excluir ${p!.nome} e todo o histórico? Esta ação não pode ser desfeita.`, { ok: 'Excluir', perigo: true }))) return;
    const { error } = await supabase.from('pacientes').delete().eq('id', p!.id);
    if (error) return toast('Não foi possível excluir', 'erro');
    toast('Paciente excluído'); bump(); fechar();
  }

  return (
    <Modal largura={720} onClose={fechar} titulo={<span className="ficha-title"><Avatar nome={p.nome} foto={p.foto_url} tam={48} />
      <span>{p.nome}<small className="muted">{fmtTelefone(p.telefone_whatsapp)}{p.data_nascimento && ` · ${fmtData(p.data_nascimento)}`}</small></span></span>}
      rodape={<div className="acoes-card">
        <button className="btn primary" onClick={() => s.abrirConsultaForm({ paciente_id: p.id })}><Icon n="agenda" s={18} /> Marcar consulta</button>
        <button className="btn wa" disabled={!p.aceita_whatsapp} onClick={() => s.abrirWhatsApp({ paciente: p, consulta: proxima, gatilho: p.usa_aparelho && !proxima ? 'manutencao' : 'confirmacao' })}><Icon n="whatsapp" s={18} /> Enviar WhatsApp</button>
        <button className="btn ghost" onClick={() => setAddTag((v) => !v)}><Icon n="etiqueta" s={16} /> Etiquetas</button>
        <button className="btn ghost" onClick={() => s.abrirPacienteForm({ id: p.id })}><Icon n="lapis" s={16} /> Editar ficha</button>
      </div>}>
      <div className="pills-row">
        <Pills ids={tags} />
        {p.usa_aparelho && <span className="tag-aparelho">🦷 aparelho · a cada {p.intervalo_manutencao_dias} dias</span>}
        {!p.aceita_whatsapp && <span className="pill pill-sm" style={{ ['--c' as any]: '#6B7C85' }}>🔕 sem WhatsApp</span>}
      </div>
      {addTag && <div className="field"><TagPicker tipo="paciente" value={tags} onChange={salvarTags} /></div>}

      {p.usa_aparelho && !proxima && <div className="banner vermelho">
        ⚠️ Paciente de aparelho <b>sem manutenção marcada</b>{vencManut && <> — {diffDias(vencManut, hoje) >= 0 ? `vence em ${fmtData(vencManut)}` : `atrasada há ${-diffDias(vencManut, hoje)} dias`}</>}.
      </div>}

      <Segmented value={aba} onChange={setAba} options={[
        { v: 'dados', l: 'Dados' },
        { v: 'consultas', l: `Consultas (${consultas.length})` },
        { v: 'financeiro', l: `Financeiro (${transacoes.length})` },
        { v: 'mensagens', l: `Mensagens (${msgs.length})` },
        { v: 'obs', l: 'Observações' }
      ]} />

      <div className="aba fade">
        {aba === 'dados' && <dl className="dados">
          <div><dt>Telefone</dt><dd>{fmtTelefone(p.telefone_whatsapp) || '—'}</dd></div>
          <div><dt>Nascimento</dt><dd>{fmtData(p.data_nascimento) || '—'}</dd></div>
          <div><dt>CPF</dt><dd>{p.cpf ? (isAdmin ? fmtCpf(p.cpf) : cpfMascarado(p.cpf)) : '—'}</dd></div>
          <div><dt>E-mail</dt><dd>{p.email || '—'}</dd></div>
          <div><dt>Próxima consulta</dt><dd>{proxima ? `${fmtData(proxima.data)} às ${fmtHora(proxima.hora_inicio)}` : '—'}</dd></div>
          <div><dt>Última visita</dt><dd>{fmtData(consultas.find((c) => c.status === 'atendido')?.data) || '—'}</dd></div>
          <div><dt>Cadastrado em</dt><dd>{fmtData(p.criado_em)}</dd></div>
          <div className="dados-acoes">
            <button className="btn ghost sm" onClick={() => s.abrirPacienteForm({ id: p.id })}><Icon n="lapis" s={14} /> Editar dados</button>
            {isAdmin && <button className="btn ghost sm danger" onClick={excluir}><Icon n="lixo" s={14} /> Excluir paciente</button>}
          </div>
        </dl>}

        {aba === 'consultas' && (consultas.length ? <ul className="timeline">{consultas.map((c) => {
          const pr = procedimentos.find((x) => x.id === c.procedimento_id); const st = STATUS_INFO[c.status];
          return <li key={c.id} onClick={() => { fechar(); s.abrirConsultaCard(c.id); }}>
            <i style={{ background: pr?.cor }} /><b className="font-display">{fmtData(c.data)} {fmtHora(c.hora_inicio)}</b>
            <span>{pr?.nome ?? 'Consulta'}</span><span className="st" style={{ color: st.cor }}>{st.icone} {st.label}</span></li>;
        })}</ul> : <Empty emoji="📅" titulo="Nenhuma consulta ainda" acao={<button className="btn primary" onClick={() => s.abrirConsultaForm({ paciente_id: p.id })}>Marcar consulta</button>} />)}

        {aba === 'financeiro' && (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <div className="card" style={{ flex: 1, minWidth: 140, padding: 12, background: 'var(--c-brand-50, #E8F5F1)', border: '1px solid var(--c-brand-200, #A3D9CE)' }}>
                <span className="muted" style={{ fontSize: '0.78rem' }}>Total Pago</span>
                <b className="font-display" style={{ display: 'block', fontSize: '1.2rem', color: '#0E9F6E' }}>{fmtMoeda(totalPago)}</b>
              </div>
              <div className="card" style={{ flex: 1, minWidth: 140, padding: 12, background: '#FEF08A', border: '1px solid #FDE047' }}>
                <span className="muted" style={{ fontSize: '0.78rem', color: '#854D0E' }}>Pendente a Receber</span>
                <b className="font-display" style={{ display: 'block', fontSize: '1.2rem', color: '#A16207' }}>{fmtMoeda(totalPendente)}</b>
              </div>
              <button
                className="btn primary"
                style={{ alignSelf: 'center', height: 42 }}
                onClick={() => s.abrirTransacaoForm({ paciente_id: p.id, tipo: 'receita', data_competencia: hojeISO(), data_pagamento: hojeISO(), status: 'pago' })}
              >
                <Icon n="mais" s={16} /> Novo Pagamento
              </button>
            </div>

            {transacoes.length ? (
              <ul className="timeline">
                {transacoes.map((t) => {
                  const isPago = t.status === 'pago';
                  const isCanc = t.status === 'cancelado';
                  return (
                    <li key={t.id} onClick={() => s.abrirTransacaoForm({ id: t.id })}>
                      <i style={{ background: isCanc ? '#9B1C1C' : isPago ? '#0E9F6E' : '#D97706' }} />
                      <b className="font-display">{fmtData(t.data_competencia)}</b>
                      <span>{t.descricao} <small className="muted">({t.categoria})</small></span>
                      <span className="st" style={{ color: isCanc ? '#9B1C1C' : isPago ? '#0E9F6E' : '#D97706', fontWeight: 600 }}>
                        {isCanc ? '⊘ Cancelado' : isPago ? '✓ Pago' : '⏳ Pendente'} · {fmtMoeda(Number(t.valor))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty
                emoji="💳"
                titulo="Nenhum pagamento registrado"
                texto="Não há lançamentos financeiros vinculados a este paciente."
                acao={
                  <button
                    className="btn primary"
                    onClick={() => s.abrirTransacaoForm({ paciente_id: p.id, tipo: 'receita', data_competencia: hojeISO(), data_pagamento: hojeISO(), status: 'pago' })}
                  >
                    Registrar Pagamento
                  </button>
                }
              />
            )}
          </div>
        )}

        {aba === 'mensagens' && (msgs.length ? <div className="chat">{msgs.map((m) => (
          <div key={m.id} className={`msg ${m.direcao}`}><p>{m.texto}</p>
            <small>{new Date(m.criado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {m.direcao === 'enviada' ? (m.enviado_por === 'automatico' ? '🤖 automático' : '👤 manual') : 'recebida'}
              {m.direcao === 'enviada' && <> · {m.status === 'erro' ? `❌ ${m.erro}` : m.status === 'lida' ? '✓✓ lida' : m.status === 'entregue' ? '✓✓' : '✓'}</>}</small></div>
        ))}</div> : <Empty emoji="💬" titulo="Nenhuma mensagem trocada" texto={tempoRelativo(p.criado_em) && 'As mensagens enviadas e recebidas aparecem aqui.'} />)}

        {aba === 'obs' && <div>
          <textarea rows={8} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Anotações sobre o paciente…" />
          <button className="btn primary" style={{ marginTop: 12 }} onClick={async () => { await supabase.from('pacientes').update({ observacoes: obs }).eq('id', p.id); toast('Observações salvas'); }}>Salvar observações</button>
        </div>}
      </div>
    </Modal>
  );
}
