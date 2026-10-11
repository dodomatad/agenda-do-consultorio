// Envio manual de WhatsApp a partir do app (atendente ou admin).
import { admin, autenticar, cors, enviarMensagem, json } from '../_shared/whatsapp.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const user = await autenticar(req);
  if (!user) return json({ ok: false, erro: 'Não autorizado' }, 401);

  const body = await req.json();
  if (!body.paciente_id || !body.texto) return json({ ok: false, erro: 'Dados incompletos' }, 400);

  const sb = admin();
  const { data: cfg } = await sb.from('configuracoes').select('whatsapp_status').eq('id', 1).single();
  if (cfg?.whatsapp_status !== 'conectado') return json({ ok: false, erro: 'desconectado' });

  const r = await enviarMensagem(sb, {
    paciente_id: body.paciente_id, consulta_id: body.consulta_id, modelo_id: body.modelo_id,
    texto: body.texto, enviado_por: user === 'service' ? 'automatico' : user.id,
  });
  return json(r);
});
