import { useEffect, useState } from 'react';
import { mudarStatus } from '../lib/acoes';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import type { Consulta, Status, TransacaoFinanceira } from '../lib/types';
import { diaSemana, fmtData, fmtHora, fmtMoeda, fmtTelefone, hhmm, hojeISO, minutos, STATUS_INFO } from '../lib/utils';
import { Avatar, Icon, Modal, Pills } from './ui';

export function ConsultaCard() {
  const s = useStore();
  const { consultaCard: id, abrirConsultaCard, procedimentos, profissionais, versao } = s;
  const [c, setC] = useState<Consulta | null>(null);
  const [hist, setHist] = useState<Consulta[]>([]);
  const [transacao, setTransacao] = useState<TransacaoFinanceira | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [consRes, transRes] = await Promise.all([
        supabase.from('consultas').select('*, consulta_etiquetas(etiqueta_id), pacientes(*, paciente_etiquetas(etiqueta_id))').eq('id', id).single(),
        supabase.from('transacoes_financeiras').select('*').eq('consulta_id', id).neq('status', 'cancelado').maybeSingle(),
      ]);
      setC(consRes.data);
      setTransacao(transRes.data);
      if (consRes.data) {
        const { data: h } = await supabase.from('consultas').select('*').eq('paciente_id', consRes.data.paciente_id).neq('id', id).order('data', { ascending: false }).limit(4);
        setHist(h ?? []);
      }
    })();
  }, [id, versao]);

  if (!c) return null;
  const proc = procedimentos.find((p) => p.id === c.procedimento_id);
  const prof = profissionais.find((p) => p.id === c.profissional_id);
  const pac = c.pacientes!;
  const fechar = () => abrirConsultaCard(null);

  async function desmarcar() {
    if (!(await s.confirmar(`Desmarcar a consulta de ${pac.nome} em ${fmtData(c!.data)} às ${fmtHora(c!.hora_inicio)}?`, { ok: 'Desmarcar', perigo: true }))) return;
    await mudarStatus(c!, 'desmarcou', s); fechar();
  }

  return (
    <Modal largura={520} onClose={fechar}
      titulo={<span className="card-title"><i style={{ background: proc?.cor ?? '#6B7C85' }} />{proc?.nome ?? 'Consulta'}</span>}
      subtitulo={<>{diaSemana(c.data)}, {fmtData(c.data)} · <b className="font-display">{fmtHora(c.hora_inicio)} – {hhmm(minutos(c.hora_inicio) + c.duracao_minutos)}</b>{prof && <> · {prof.nome}</>}</>}
      rodape={<div className="acoes-card">
        {c.status === 'atendido' && !transacao && (
          <button
            type="button"
            className="btn success"
            onClick={() => {
              fechar();
              s.abrirTransacaoForm({
                tipo: 'receita',
                categoria: proc?.eh_manutencao_aparelho ? 'Manutenção de aparelho' : 'Consulta',
                descricao: `${proc?.nome ?? 'Consulta'} - ${pac.nome}`,
                valor: proc?.preco ? Number(proc.preco) : undefined,
                paciente_id: pac.id,
                profissional_id: c.profissional_id,
                consulta_id: c.id,
                data_competencia: hojeISO(),
                data_pagamento: hojeISO(),
                status: 'pago',
              });
            }}
          >
            <Icon n="cifrao" s={18} /> Receber {proc?.preco ? `(${fmtMoeda(Number(proc.preco))})` : ''}
          </button>
        )}
        <button type="button" className="btn wa" disabled={!pac.aceita_whatsapp || !pac.telefone_whatsapp} onClick={() => s.abrirWhatsApp({ paciente: pac, consulta: c, gatilho: c.status === 'faltou' ? 'falta' : 'confirmacao' })}><Icon n="whatsapp" s={18} /> Enviar WhatsApp</button>
        <button type="button" className="btn ghost" onClick={() => { fechar(); s.abrirConsultaForm({ id: c.id, titulo: 'Remarcar consulta' }); }}>Remarcar</button>
        <button type="button" className="btn ghost" onClick={() => { fechar(); s.abrirConsultaForm({ id: c.id }); }}><Icon n="lapis" s={16} /> Editar</button>
        <button type="button" className="btn ghost danger" onClick={desmarcar}>Desmarcar</button>
      </div>}>
      <div className="pac-head" onClick={() => { fechar(); s.abrirPaciente(pac.id); }} role="button">
        <Avatar nome={pac.nome} foto={pac.foto_url} tam={52} />
        <div>
          <h3>{pac.nome} {pac.usa_aparelho && <span className="tag-aparelho">🦷 aparelho</span>}</h3>
          <p className="muted">{fmtTelefone(pac.telefone_whatsapp) || 'Sem telefone'} {!pac.aceita_whatsapp && '· não aceita WhatsApp'}</p>
          <Pills ids={(pac.paciente_etiquetas ?? []).map((x) => x.etiqueta_id)} small />
        </div>
        <Icon n="dir" className="muted" />
      </div>
      {(c.consulta_etiquetas?.length ?? 0) > 0 && <Pills ids={c.consulta_etiquetas!.map((x) => x.etiqueta_id)} />}

      {transacao && (
        <div style={{ margin: '10px 0', padding: '10px 14px', borderRadius: 8, background: transacao.status === 'pago' ? '#DEF7EC' : '#FDF6B2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: `1px solid ${transacao.status === 'pago' ? '#BCF0DA' : '#FCE96A'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.2rem' }}>{transacao.status === 'pago' ? '✓' : '⏳'}</span>
            <div>
              <b style={{ color: transacao.status === 'pago' ? '#03543F' : '#723B10' }}>
                {transacao.status === 'pago' ? 'Consulta Paga' : 'Pagamento Pendente'}: {fmtMoeda(Number(transacao.valor))}
              </b>
              <small style={{ display: 'block', color: 'var(--muted)' }}>
                {transacao.forma_pagamento ? transacao.forma_pagamento.toUpperCase() : ''} · {transacao.descricao}
              </small>
            </div>
          </div>
          <button type="button" className="btn ghost sm" onClick={() => { fechar(); s.abrirTransacaoForm({ id: transacao.id }); }}>
            Ver Pagamento
          </button>
        </div>
      )}

      {c.observacoes && <p className="obs">📝 {c.observacoes}</p>}

      <div className="field"><span>Status</span>
        <div className="status-grid">
          {(Object.keys(STATUS_INFO) as Status[]).map((st) => (
            <button type="button" key={st} className={c.status === st ? 'status-btn on' : 'status-btn'} style={{ ['--c' as any]: STATUS_INFO[st].cor }}
              onClick={() => mudarStatus(c, st, s)}>{STATUS_INFO[st].icone} {STATUS_INFO[st].label}</button>
          ))}
        </div>
        {c.confirmado_via_whatsapp && <small className="wa-txt">💬 Confirmado pelo WhatsApp</small>}
      </div>

      {hist.length > 0 && <div className="field"><span>Histórico rápido</span>
        <ul className="hist">{hist.map((h) => { const p = procedimentos.find((x) => x.id === h.procedimento_id); return (
          <li key={h.id}><i style={{ background: p?.cor }} />{fmtData(h.data)} · {p?.nome ?? 'Consulta'}<span style={{ color: STATUS_INFO[h.status].cor }}>{STATUS_INFO[h.status].icone} {STATUS_INFO[h.status].label}</span></li>); })}</ul>
      </div>}
    </Modal>
  );
}
