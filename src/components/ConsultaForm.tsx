import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import type { Consulta, Paciente } from '../lib/types';
import { addMeses, diaSemana, fmtData, fmtTelefone, hhmm, minutos, proximoDiaUtil, hojeISO, sanitizarTermoBusca } from '../lib/utils';
import { Avatar, Icon, Modal, TagPicker } from './ui';

export function ConsultaForm() {
  const { consultaForm: pre, abrirConsultaForm, procedimentos, profissionais, cfg, toast, bump, abrirPacienteForm, abrirWhatsApp } = useStore();
  const editando = !!pre?.id;
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<Paciente[]>([]);
  const [f, setF] = useState({
    profissional_id: pre?.profissional_id ?? profissionais.find((p) => p.ativo)?.id ?? '',
    procedimento_id: pre?.procedimento_id ?? '',
    data: pre?.data ?? hojeISO(), hora_inicio: pre?.hora_inicio?.slice(0, 5) ?? '09:00',
    duracao_minutos: pre?.duracao_minutos ?? 30, observacoes: '', status: 'agendado',
  });
  const [tags, setTags] = useState<string[]>([]);
  const [repetir, setRepetir] = useState(0);
  const [enviarWa, setEnviarWa] = useState(!!pre?.sugerirWhatsApp);
  const [conflitos, setConflitos] = useState<Consulta[]>([]);
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof f, v: any) => setF((x) => ({ ...x, [k]: v }));

  function aplicarPaciente(p: Paciente | null) {
    setPaciente(p);
    if (p && !editando && !f.procedimento_id && p.usa_aparelho) {
      const procOrto = procedimentos.find((x) => x.eh_manutencao_aparelho);
      if (procOrto) {
        setF((x) => ({ ...x, procedimento_id: procOrto.id, duracao_minutos: procOrto.duracao_padrao }));
      }
    }
  }

  // Carrega dados iniciais
  useEffect(() => {
    (async () => {
      if (pre?.id) {
        const { data } = await supabase.from('consultas').select('*, consulta_etiquetas(etiqueta_id), pacientes(*)').eq('id', pre.id).single();
        if (data) {
          setPaciente(data.pacientes);
          setF({ profissional_id: data.profissional_id ?? '', procedimento_id: data.procedimento_id ?? '', data: pre.data ?? data.data,
            hora_inicio: (pre.hora_inicio ?? data.hora_inicio).slice(0, 5), duracao_minutos: data.duracao_minutos, observacoes: data.observacoes ?? '', status: data.status });
          setTags(data.consulta_etiquetas.map((x: any) => x.etiqueta_id));
        }
      } else if (pre?.paciente_id) {
        const { data } = await supabase.from('pacientes').select('*').eq('id', pre.paciente_id).single();
        aplicarPaciente(data);
      }
    })();
  }, [pre]); // eslint-disable-line

  // Busca de pacientes
  useEffect(() => {
    const q = sanitizarTermoBusca(busca);
    if (!q) return setResultados([]);
    const t = setTimeout(async () => {
      const dig = q.replace(/\D/g, '');
      let req = supabase.from('pacientes').select('*').eq('ativo', true).limit(20);
      req = dig.length >= 3 ? req.or(`nome.ilike.%${q}%,telefone_whatsapp.ilike.%${dig}%,cpf.ilike.%${dig}%`) : req.ilike('nome', `%${q}%`);
      const { data } = await req; setResultados(data ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  // Conflitos de horário (aviso sem bloquear)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('consultas').select('*, pacientes(nome)').eq('data', f.data).not('status', 'in', '(desmarcou,faltou)');
      const ini = minutos(f.hora_inicio), fim = ini + Number(f.duracao_minutos);
      setConflitos((data ?? []).filter((c: Consulta) => c.id !== pre?.id
        && (!f.profissional_id || !c.profissional_id || c.profissional_id === f.profissional_id)
        && minutos(c.hora_inicio) < fim && minutos(c.hora_inicio) + c.duracao_minutos > ini));
    })();
  }, [f.data, f.hora_inicio, f.duracao_minutos, f.profissional_id, pre?.id]);

  const avisos = useMemo(() => {
    const a: string[] = [];
    if (!cfg) return a;
    const ini = minutos(f.hora_inicio), fim = ini + Number(f.duracao_minutos);
    if (!cfg.dias_atendimento.includes(new Date(f.data + 'T12:00').getDay())) a.push(`A clínica não atende ${diaSemana(f.data)}.`);
    if (ini < minutos(cfg.horario_abertura) || fim > minutos(cfg.horario_fechamento)) a.push(`Fora do horário de funcionamento (${cfg.horario_abertura.slice(0, 5)}–${cfg.horario_fechamento.slice(0, 5)}).`);
    if (cfg.almoco_inicio && cfg.almoco_fim && ini < minutos(cfg.almoco_fim) && fim > minutos(cfg.almoco_inicio)) a.push('Esse horário pega o intervalo de almoço.');
    return a;
  }, [cfg, f.data, f.hora_inicio, f.duracao_minutos]);

  const datasRepeticao = useMemo(() => Array.from({ length: repetir }, (_, i) => proximoDiaUtil(addMeses(f.data, i + 1), cfg)), [repetir, f.data, cfg]);

  async function salvar() {
    if (!paciente) return toast('Escolha o paciente', 'erro');
    setSalvando(true);
    const base = {
      paciente_id: paciente.id, profissional_id: f.profissional_id || null, procedimento_id: f.procedimento_id || null,
      hora_inicio: f.hora_inicio, duracao_minutos: Number(f.duracao_minutos), observacoes: f.observacoes || null,
    };
    let principal: Consulta | null = null;
    if (editando) {
      const { data, error } = await supabase.from('consultas').update({ ...base, data: f.data }).eq('id', pre!.id!).select().single();
      if (error) { setSalvando(false); return toast('Erro ao salvar: ' + error.message, 'erro'); }
      principal = data;
      await supabase.from('consulta_etiquetas').delete().eq('consulta_id', pre!.id!);
    } else {
      const linhas = [f.data, ...datasRepeticao].map((d) => ({ ...base, data: d, status: 'agendado' }));
      const { data, error } = await supabase.from('consultas').insert(linhas).select();
      if (error) { setSalvando(false); return toast('Erro ao marcar: ' + error.message, 'erro'); }
      principal = data[0];
      if (tags.length) await supabase.from('consulta_etiquetas').insert(data.flatMap((c: Consulta) => tags.map((t) => ({ consulta_id: c.id, etiqueta_id: t }))));
    }
    if (editando && tags.length) await supabase.from('consulta_etiquetas').insert(tags.map((t) => ({ consulta_id: principal!.id, etiqueta_id: t })));
    setSalvando(false);
    toast(editando ? 'Consulta atualizada' : repetir ? `${repetir + 1} consultas marcadas` : 'Consulta marcada');
    bump(); abrirConsultaForm(null);
    if (enviarWa && principal) abrirWhatsApp({ paciente, consulta: principal, gatilho: 'confirmacao' });
  }

  const procSel = procedimentos.find((p) => p.id === f.procedimento_id);
  return (
    <Modal titulo={pre?.titulo ?? (editando ? 'Editar consulta' : 'Marcar consulta')} onClose={() => abrirConsultaForm(null)} largura={620}
      rodape={<>
        <button className="btn ghost" onClick={() => abrirConsultaForm(null)}>Cancelar</button>
        <button className="btn primary" disabled={salvando || !paciente} onClick={salvar}>
          <Icon n="check" s={18} /> {salvando ? 'Salvando…' : enviarWa ? 'Marcar e enviar confirmação' : editando ? 'Salvar' : 'Marcar consulta'}
        </button></>}>
      {pre?.aviso && <div className="banner roxo">🦷 {pre.aviso}</div>}

      <label className="field"><span>Paciente</span>
        {paciente ? (
          <div className="paciente-sel">
            <Avatar nome={paciente.nome} foto={paciente.foto_url} tam={36} />
            <div><b>{paciente.nome}</b><small className="muted">{fmtTelefone(paciente.telefone_whatsapp)}</small></div>
            {!editando && <button className="btn ghost sm" onClick={() => setPaciente(null)}>Trocar</button>}
          </div>
        ) : (
          <div className="autocomplete">
            <div className="input-icon"><Icon n="busca" s={18} /><input autoFocus placeholder="Digite nome, telefone ou CPF…" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
            {(resultados.length > 0 || busca.trim()) && <div className="dropdown">
              {resultados.map((p) => <button key={p.id} onClick={() => { aplicarPaciente(p); setBusca(''); }}>
                <Avatar nome={p.nome} foto={p.foto_url} tam={28} /><span><b>{p.nome}</b> <small className="muted">{fmtTelefone(p.telefone_whatsapp)}</small></span></button>)}
              <button className="criar" onClick={() => abrirPacienteForm({ nome: busca, onSalvo: (p) => { aplicarPaciente(p); setBusca(''); } })}>
                <Icon n="mais" s={16} /> Cadastrar novo paciente{busca && ` “${busca}”`}</button>
            </div>}
          </div>
        )}
      </label>

      <div className="grid2">
        <label className="field"><span>Procedimento</span>
          <select value={f.procedimento_id} onChange={(e) => { const p = procedimentos.find((x) => x.id === e.target.value); setF((x) => ({ ...x, procedimento_id: e.target.value, duracao_minutos: p?.duracao_padrao ?? x.duracao_minutos })); }}>
            <option value="">Selecione…</option>
            {procedimentos.map((p) => <option key={p.id} value={p.id}>{p.eh_manutencao_aparelho ? '🦷 ' : ''}{p.nome}</option>)}
          </select>
        </label>
        {profissionais.filter((p) => p.ativo).length > 0 && <label className="field"><span>Profissional</span>
          <select value={f.profissional_id} onChange={(e) => set('profissional_id', e.target.value)}>
            <option value="">—</option>{profissionais.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select></label>}
      </div>

      <div className="grid3">
        <label className="field"><span>Data</span><input type="date" value={f.data} onChange={(e) => set('data', e.target.value)} />
          <small className="muted">{diaSemana(f.data)}</small></label>
        <label className="field"><span>Horário</span><input type="time" step={300} value={f.hora_inicio} onChange={(e) => set('hora_inicio', e.target.value)} />
          <small className="muted">até {hhmm(minutos(f.hora_inicio) + Number(f.duracao_minutos))}</small></label>
        <label className="field"><span>Duração</span>
          <select value={f.duracao_minutos} onChange={(e) => set('duracao_minutos', Number(e.target.value))}>
            {[15, 20, 30, 40, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h${m % 60 ? ' 30' : ''}`}</option>)}
          </select></label>
      </div>

      {(conflitos.length > 0 || avisos.length > 0) && <div className="banner amarelo">
        {conflitos.map((c) => <div key={c.id}>⚠️ Já existe consulta de <b>{(c as any).pacientes?.nome}</b> às {c.hora_inicio.slice(0, 5)} nesse horário.</div>)}
        {avisos.map((a) => <div key={a}>⚠️ {a}</div>)}
        <small>Você pode marcar mesmo assim.</small>
      </div>}

      <label className="field"><span>Etiquetas da consulta</span><TagPicker tipo="consulta" value={tags} onChange={setTags} /></label>
      <label className="field"><span>Observações</span><textarea rows={2} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} placeholder="Ex.: trazer exames" /></label>

      {!editando && <label className="field"><span>Repetir todo mês</span>
        <div className="chips">{[0, 2, 5, 11].map((n) => <button key={n} type="button" className={n === repetir ? 'chip on' : 'chip'} onClick={() => setRepetir(n)}>{n === 0 ? 'Não repetir' : `+${n} meses`}</button>)}</div>
        {repetir > 0 && <small className="muted">Também em: {datasRepeticao.map(fmtData).join(', ')}</small>}
      </label>}

      {paciente && <label className={`check-wa ${!paciente.aceita_whatsapp ? 'disabled' : ''}`}>
        <input type="checkbox" checked={enviarWa} disabled={!paciente.aceita_whatsapp} onChange={(e) => setEnviarWa(e.target.checked)} />
        <span>💬 Enviar confirmação pelo WhatsApp agora {!paciente.aceita_whatsapp && <small>(paciente não aceita WhatsApp)</small>}</span>
      </label>}
      {procSel?.eh_manutencao_aparelho && <small className="muted roxo-txt">🦷 Manutenção do aparelho</small>}
    </Modal>
  );
}
