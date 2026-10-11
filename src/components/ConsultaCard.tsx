import { useEffect, useState } from 'react';
import { mudarStatus } from '../lib/acoes';
import { useStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import type { Consulta, Status } from '../lib/types';
import { diaSemana, fmtData, fmtHora, fmtTelefone, hhmm, minutos, STATUS_INFO } from '../lib/utils';
import { Avatar, Icon, Modal, Pills } from './ui';

export function ConsultaCard() {
  const s = useStore();
  const { consultaCard: id, abrirConsultaCard, procedimentos, profissionais, versao } = s;
  const [c, setC] = useState<Consulta | null>(null);
  const [hist, setHist] = useState<Consulta[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.from('consultas').select('*, consulta_etiquetas(etiqueta_id), pacientes(*, paciente_etiquetas(etiqueta_id))').eq('id', id).single();
      setC(data);
      if (data) {
        const { data: h } = await supabase.from('consultas').select('*').eq('paciente_id', data.paciente_id).neq('id', id).order('data', { ascending: false }).limit(4);
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
        <button className="btn wa" disabled={!pac.aceita_whatsapp} onClick={() => s.abrirWhatsApp({ paciente: pac, consulta: c, gatilho: c.status === 'faltou' ? 'falta' : 'confirmacao' })}><Icon n="whatsapp" s={18} /> Enviar WhatsApp</button>
        <button className="btn ghost" onClick={() => { fechar(); s.abrirConsultaForm({ id: c.id, titulo: 'Remarcar consulta' }); }}>Remarcar</button>
        <button className="btn ghost" onClick={() => { fechar(); s.abrirConsultaForm({ id: c.id }); }}><Icon n="lapis" s={16} /> Editar</button>
        <button className="btn ghost danger" onClick={desmarcar}>Desmarcar</button>
      </div>}>
      <div className="pac-head" onClick={() => { fechar(); s.abrirPaciente(pac.id); }} role="button">
        <Avatar nome={pac.nome} foto={pac.foto_url} tam={52} />
        <div>
          <h3>{pac.nome} {pac.usa_aparelho && <span className="tag-aparelho">🦷 aparelho</span>}</h3>
          <p className="muted">{fmtTelefone(pac.telefone_whatsapp)} {!pac.aceita_whatsapp && '· não aceita WhatsApp'}</p>
          <Pills ids={(pac.paciente_etiquetas ?? []).map((x) => x.etiqueta_id)} small />
        </div>
        <Icon n="dir" className="muted" />
      </div>
      {(c.consulta_etiquetas?.length ?? 0) > 0 && <Pills ids={c.consulta_etiquetas!.map((x) => x.etiqueta_id)} />}
      {c.observacoes && <p className="obs">📝 {c.observacoes}</p>}

      <div className="field"><span>Status</span>
        <div className="status-grid">
          {(Object.keys(STATUS_INFO) as Status[]).map((st) => (
            <button key={st} className={c.status === st ? 'status-btn on' : 'status-btn'} style={{ ['--c' as any]: STATUS_INFO[st].cor }}
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
