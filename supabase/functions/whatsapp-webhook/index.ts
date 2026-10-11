// Webhook de mensagens recebidas e status (Z-API e Meta Cloud API).
// URL: https://SEU-PROJETO.supabase.co/functions/v1/whatsapp-webhook?token=WEBHOOK_SECRET
// Publique com --no-verify-jwt (o provedor não envia JWT do Supabase).
import { admin, json, normalizarTelefone } from '../_shared/whatsapp.ts';

const MAPA_STATUS: Record<string, string> = {
  SENT: 'enviada', RECEIVED: 'entregue', DELIVERED: 'entregue', READ: 'lida', PLAYED: 'lida',
  sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'erro',
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // Verificação do webhook da Meta
  if (req.method === 'GET') {
    if (url.searchParams.get('hub.verify_token') === Deno.env.get('WEBHOOK_SECRET'))
      return new Response(url.searchParams.get('hub.challenge') ?? '');
    return new Response('forbidden', { status: 403 });
  }
  if (url.searchParams.get('token') !== Deno.env.get('WEBHOOK_SECRET')) return json({ erro: 'forbidden' }, 403);

  const b = await req.json().catch(() => ({}));
  const sb = admin();
  const eventos: { tipo: 'msg' | 'status'; telefone?: string; texto?: string; ids?: string[]; status?: string }[] = [];

  // Z-API
  if (b.type === 'ReceivedCallback' && !b.fromMe && !b.isGroup) {
    eventos.push({ tipo: 'msg', telefone: b.phone, texto: b.text?.message ?? b.buttonsResponseMessage?.message ?? '' });
  } else if (b.type === 'MessageStatusCallback') {
    eventos.push({ tipo: 'status', ids: b.ids ?? [b.id], status: b.status });
  }
  // Meta
  for (const e of b.entry ?? []) for (const c of e.changes ?? []) {
    for (const m of c.value?.messages ?? []) eventos.push({ tipo: 'msg', telefone: m.from, texto: m.text?.body ?? m.button?.text ?? '' });
    for (const s of c.value?.statuses ?? []) eventos.push({ tipo: 'status', ids: [s.id], status: s.status });
  }

  for (const ev of eventos) {
    if (ev.tipo === 'status') {
      const st = MAPA_STATUS[ev.status ?? ''];
      if (st) {
        await sb.from('mensagens_whatsapp').update({ status: st }).in('provider_message_id', ev.ids ?? []);
        // Atualiza status na fila_lembretes se for o caso
        await sb.from('fila_lembretes').update({ status: st }).in('provider_message_id', ev.ids ?? []).eq('status', 'enviado');
      }
      continue;
    }
    await processarMensagem(sb, normalizarTelefone(ev.telefone ?? ''), (ev.texto ?? '').trim());
  }
  return json({ ok: true });
});


async function processarMensagem(sb: ReturnType<typeof admin>, telefone: string, texto: string) {
  // Encontra o paciente pelos últimos 8 dígitos (tolerante ao 9º dígito)
  const fim = telefone.slice(-8);
  const { data: candidatos } = await sb.from('pacientes').select('id,nome,telefone_whatsapp').ilike('telefone_whatsapp', `%${fim.slice(0, 4)}%${fim.slice(4)}%`);
  const pac = (candidatos ?? []).find((p) => normalizarTelefone(p.telefone_whatsapp).endsWith(fim));

  await sb.from('mensagens_whatsapp').insert({
    paciente_id: pac?.id ?? null, telefone, texto, direcao: 'recebida', status: 'entregue', enviado_por: 'paciente',
  });

  const { data: cfg } = await sb.from('configuracoes').select('notif_whatsapp').eq('id', 1).single();
  if (!pac) {
    if (cfg?.notif_whatsapp) await sb.from('notificacoes').insert({
      tipo: 'whatsapp_mensagem', titulo: `Nova mensagem de ${telefone}`, mensagem: texto, prioridade: 'media',
    });
    return;
  }

  const norm = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim();
  const sim = ['SIM', '1', 'S', 'CONFIRMO', 'CONFIRMADO', 'OK'].includes(norm);
  const nao = ['NAO', '2', 'N', 'NAO POSSO', 'REMARCAR'].includes(norm);

  // Próxima consulta pendente do paciente
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const { data: consulta } = await sb.from('consultas').select('id,data,hora_inicio')
    .eq('paciente_id', pac.id).gte('data', hoje).in('status', ['agendado', 'confirmado'])
    .order('data').order('hora_inicio').limit(1).maybeSingle();

  if (consulta && sim) {
    await sb.from('consultas').update({ status: 'confirmado', confirmado_via_whatsapp: true }).eq('id', consulta.id);
    await sb.from('fila_lembretes').update({
      status: 'respondido',
      resposta_paciente: texto,
    }).eq('consulta_id', consulta.id).in('status', ['enviado', 'entregue', 'lido']);
    return;
  }
  if (consulta && nao) {
    await sb.from('fila_lembretes').update({
      status: 'respondido',
      resposta_paciente: texto,
    }).eq('consulta_id', consulta.id).in('status', ['enviado', 'entregue', 'lido']);

    await sb.from('notificacoes').insert({
      tipo: 'whatsapp_resposta', paciente_id: pac.id, consulta_id: consulta.id, prioridade: 'alta',
      titulo: `${pac.nome} precisa remarcar (respondeu NÃO) ⚠️`,
      mensagem: `Respondeu "${texto}" ao lembrete da consulta de ${consulta.data.split('-').reverse().join('/')} às ${consulta.hora_inicio.slice(0, 5)}.`,
      data_referencia: consulta.data,
    });
    return;
  }

  // Qualquer outra resposta: grava na fila e gera notificação
  if (consulta) {
    await sb.from('fila_lembretes').update({
      status: 'respondido',
      resposta_paciente: texto,
    }).eq('consulta_id', consulta.id).in('status', ['enviado', 'entregue', 'lido']);
  }

  if (cfg?.notif_whatsapp) await sb.from('notificacoes').insert({
    tipo: 'whatsapp_mensagem', paciente_id: pac.id, prioridade: 'media',
    titulo: `Nova mensagem de ${pac.nome}`, mensagem: texto,
  });

}
