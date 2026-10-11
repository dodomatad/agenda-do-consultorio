// Envios automáticos — chamado pelo pg_cron de hora em hora.
// Só roda dentro do horário comercial. Nunca envia a mesma mensagem duas vezes (chave_unica).
import { admin, autenticar, cors, enviarMensagem, json, preencherModelo } from '../_shared/whatsapp.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LIMITE_MS = 120_000; // respeita o tempo máximo da Edge Function; o restante vai na próxima hora

function agoraBR() {
  const d = new Date(Date.now() - 3 * 3600_000); // America/Sao_Paulo (UTC-3)
  return { data: d.toISOString().slice(0, 10), hora: d.toISOString().slice(11, 16), dow: d.getUTCDay(), ano: d.getUTCFullYear() };
}
const addDias = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const user = await autenticar(req);
  if (user !== 'service' && (user === null || user.papel !== 'admin')) return json({ erro: 'Não autorizado' }, 401);

  const inicio = Date.now();
  const sb = admin();
  const { data: cfg } = await sb.from('configuracoes').select('*').eq('id', 1).single();
  const now = agoraBR();

  if (!cfg.dias_atendimento.includes(now.dow) || now.hora < cfg.horario_abertura.slice(0, 5) || now.hora >= cfg.horario_fechamento.slice(0, 5))
    return json({ ok: true, ignorado: 'fora do horário comercial' });
  if (cfg.whatsapp_status !== 'conectado') return json({ ok: false, erro: 'WhatsApp desconectado' });

  const { data: modelos } = await sb.from('modelos_mensagem').select('*').eq('ativo', true).neq('gatilho', 'manual');
  type Envio = { paciente_id: string; consulta_id?: string; modelo_id: string; texto: string; chave: string; marcarLembrete?: boolean };
  const fila: Envio[] = [];
  const base = { clinica: cfg.nome_clinica, endereco: cfg.endereco };
  const selConsulta = 'id,data,hora_inicio,status,paciente_id,pacientes!inner(nome,aceita_whatsapp,telefone_whatsapp),procedimentos(nome),profissionais(nome)';

  for (const m of modelos ?? []) {
    if (m.gatilho === 'confirmacao') {
      const alvo = addDias(now.data, m.antecedencia || 1);
      const { data } = await sb.from('consultas').select(selConsulta).eq('data', alvo).eq('status', 'agendado');
      for (const c of data ?? []) fila.push(envioConsulta(c, m, `confirmacao:${c.id}`, true));
    }
    if (m.gatilho === 'lembrete_dia') {
      const horas = m.antecedencia || 2;
      const [h, mi] = now.hora.split(':').map(Number);
      const limite = `${String(Math.min(23, h + horas)).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
      const { data } = await sb.from('consultas').select(selConsulta).eq('data', now.data)
        .in('status', ['agendado', 'confirmado']).gt('hora_inicio', now.hora).lte('hora_inicio', limite);
      for (const c of data ?? []) fila.push(envioConsulta(c, m, `lembrete_dia:${c.id}`));
    }
    if (m.gatilho === 'falta') {
      const { data } = await sb.from('consultas').select(selConsulta).eq('status', 'faltou').gte('data', addDias(now.data, -1));
      for (const c of data ?? []) fila.push(envioConsulta(c, m, `falta:${c.id}`));
    }
    if (m.gatilho === 'aniversario') {
      const { data } = await sb.from('pacientes').select('id,nome,data_nascimento').eq('ativo', true).eq('aceita_whatsapp', true).not('data_nascimento', 'is', null);
      for (const p of data ?? []) if (p.data_nascimento.slice(5) === now.data.slice(5))
        fila.push({ paciente_id: p.id, modelo_id: m.id, chave: `aniversario:${p.id}:${now.ano}`, texto: preencherModelo(m.texto, { ...base, nome: p.nome }) });
    }
    if (m.gatilho === 'manutencao') {
      const { data: pacs } = await sb.from('pacientes').select('id,nome,intervalo_manutencao_dias').eq('ativo', true).eq('usa_aparelho', true).eq('aceita_whatsapp', true);
      for (const p of pacs ?? []) {
        const { count: futuras } = await sb.from('consultas').select('id', { count: 'exact', head: true })
          .eq('paciente_id', p.id).gte('data', now.data).in('status', ['agendado', 'confirmado']);
        if (futuras) continue;
        const { data: ult } = await sb.from('consultas').select('data,procedimentos!inner(eh_manutencao_aparelho)')
          .eq('paciente_id', p.id).eq('status', 'atendido').eq('procedimentos.eh_manutencao_aparelho', true)
          .order('data', { ascending: false }).limit(1).maybeSingle();
        if (!ult) continue;
        const venc = addDias(ult.data, p.intervalo_manutencao_dias);
        if (venc <= addDias(now.data, m.antecedencia || 5))
          fila.push({ paciente_id: p.id, modelo_id: m.id, chave: `manutencao:${p.id}:${venc}`, texto: preencherModelo(m.texto, { ...base, nome: p.nome }) });
      }
    }
  }

  // Ignora os que já foram enviados (consulta barata antes de enviar)
  const chaves = fila.map((f) => f.chave);
  const { data: jaEnviadas } = chaves.length
    ? await sb.from('mensagens_whatsapp').select('chave_unica').in('chave_unica', chaves)
    : { data: [] };
  const enviadas = new Set((jaEnviadas ?? []).map((x) => x.chave_unica));
  const pendentes = fila.filter((f) => !enviadas.has(f.chave));

  let ok = 0, erros = 0;
  for (const [i, f] of pendentes.entries()) {
    if (Date.now() - inicio > LIMITE_MS) break;
    if (i > 0) await sleep((cfg.intervalo_envio_segundos ?? 8) * 1000 + Math.random() * 3000);
    const r = await enviarMensagem(sb, {
      paciente_id: f.paciente_id, consulta_id: f.consulta_id, modelo_id: f.modelo_id,
      texto: f.texto, enviado_por: 'automatico', chave_unica: f.chave,
    });
    if (r.ok) { ok++; if (f.marcarLembrete) await sb.from('consultas').update({ lembrete_enviado: true }).eq('id', f.consulta_id); }
    else if (!r.duplicada) erros++;
  }
  return json({ ok: true, enviadas: ok, erros, restantes: pendentes.length - ok - erros });

  // deno-lint-ignore no-explicit-any
  function envioConsulta(c: any, m: any, chave: string, marcarLembrete = false): Envio {
    return {
      paciente_id: c.paciente_id, consulta_id: c.id, modelo_id: m.id, chave, marcarLembrete,
      texto: preencherModelo(m.texto, {
        ...base, nome: c.pacientes.nome, data: c.data, hora: c.hora_inicio,
        procedimento: c.procedimentos?.nome, profissional: c.profissionais?.nome,
      }),
    };
  }
});
