// Edge Function: Processa a fila de lembretes a cada 5 minutos
// Dispara UMA mensagem por vez, respeitando o intervalo configurado (30min, 1h, 1h30, 2h)
// com variação aleatória humanizada (jitter), pausando caso ocorram 3 erros consecutivos.

import { admin, autenticar, cors, enviarMensagem, json } from '../_shared/whatsapp.ts';

function agoraBR() {
  const d = new Date(Date.now() - 3 * 3600_000); // UTC-3
  return {
    data: d.toISOString().slice(0, 10),
    hora: d.toISOString().slice(11, 16),
    dow: d.getUTCDay(),
    iso: d.toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Autenticação: Aceita JWT autenticado do usuário (para "Enviar agora" / "Forçar") ou Service Role
  const auth = await autenticar(req);
  if (!auth) return json({ ok: false, erro: 'Não autorizado' }, 401);

  const sb = admin();
  const body = await req.json().catch(() => ({}));
  const forcarId = body.item_id; // Se forçar o envio de um item específico

  // 1) Sincroniza a fila primeiro (regras, pulados, novos agendamentos)
  await sb.rpc('sincronizar_fila_lembretes');

  // 2) Carrega configurações da clínica
  const { data: cfg } = await sb.from('configuracoes').select('*').eq('id', 1).single();
  if (!cfg) return json({ ok: false, erro: 'Configuração não encontrada' }, 500);

  // Se a fila estiver pausada manualmente e não for um envio manual forçado
  if (!cfg.fila_ativa && !forcarId) {
    return json({ ok: true, status: 'fila pausada' });
  }

  const now = agoraBR();

  // 3) Validação de horário comercial (apenas para disparos automáticos)
  if (!forcarId) {
    if (!cfg.dias_atendimento.includes(now.dow) ||
        now.hora < cfg.horario_abertura.slice(0, 5) ||
        now.hora >= cfg.horario_fechamento.slice(0, 5)) {
      return json({ ok: true, status: 'fora do horário comercial' });
    }

    // Intervalo com variação aleatória de +/- 4 minutos para soar natural
    const intervaloMinutos = cfg.fila_intervalo_minutos || 60;
    const jitterMinutos = Math.floor(Math.random() * 7) - 3; // -3 a +3 min
    const intervaloEfetivoMs = Math.max(10, intervaloMinutos + jitterMinutos) * 60 * 1000;

    if (cfg.fila_ultimo_envio_em) {
      const decorridoMs = Date.now() - new Date(cfg.fila_ultimo_envio_em).getTime();
      if (decorridoMs < intervaloEfetivoMs) {
        return json({
          ok: true,
          status: 'aguardando intervalo',
          proximo_em_minutos: Math.round((intervaloEfetivoMs - decorridoMs) / 60000),
        });
      }
    }
  }

  // 4) Busca o próximo item elegível
  // Prioriza consulta com data/hora mais próxima (enviar_ate mais próximo) e prioridade
  let query = sb.from('fila_lembretes')
    .select('*, pacientes(nome, telefone_whatsapp, aceita_whatsapp), consultas(data, hora_inicio)')
    .eq('status', 'na fila');

  if (forcarId) {
    query = query.eq('id', forcarId);
  } else {
    query = query.lte('enviar_a_partir_de', new Date().toISOString())
                 .gte('enviar_ate', new Date().toISOString())
                 .order('prioridade', { ascending: true })
                 .order('enviar_ate', { ascending: true })
                 .limit(1);
  }

  const { data: itens } = await query;
  const item = itens?.[0];

  if (!item) {
    return json({ ok: true, status: 'nenhum item pronto na fila' });
  }

  // 5) Validações do paciente
  const pac = item.pacientes;
  if (!pac || !pac.telefone_whatsapp || !pac.aceita_whatsapp) {
    await sb.from('fila_lembretes').update({
      status: 'pulado',
      motivo: !pac?.telefone_whatsapp ? 'Sem telefone cadastrado' : 'Paciente não aceita WhatsApp',
    }).eq('id', item.id);
    return json({ ok: true, status: 'item pulado', id: item.id });
  }

  // 6) Verifica status da conexão do WhatsApp
  if (cfg.whatsapp_status !== 'conectado') {
    const erros = (cfg.fila_erros_consecutivos || 0) + 1;
    await sb.from('configuracoes').update({ fila_erros_consecutivos: erros }).eq('id', 1);

    if (erros >= 3) {
      // Pausa a fila e notifica a atendente/admin
      await sb.from('configuracoes').update({ fila_ativa: false }).eq('id', 1);
      await sb.from('notificacoes').insert({
        tipo: 'whatsapp_erro',
        prioridade: 'alta',
        titulo: 'Fila de lembretes pausada automaticamente ⚠️',
        mensagem: 'O WhatsApp da clínica está desconectado. A fila foi pausada para não perder o ritmo. Reconecte o aparelho.',
      });
    }
    return json({ ok: false, erro: 'WhatsApp desconectado' });
  }

  // 7) Executa o envio
  const res = await enviarMensagem(sb, {
    paciente_id: item.paciente_id,
    consulta_id: item.consulta_id,
    texto: item.texto_final,
    enviado_por: 'automatico',
    chave_unica: `fila:${item.id}`,
  });

  if (res.ok) {
    // Sucesso: atualiza item da fila, zera erros e grava timestamp do envio
    await sb.from('fila_lembretes').update({
      status: 'enviado',
      enviado_em: new Date().toISOString(),
      provider_message_id: res.id || null,
    }).eq('id', item.id);

    if (item.consulta_id && item.tipo === 'lembrete_consulta') {
      await sb.from('consultas').update({ lembrete_enviado: true }).eq('id', item.consulta_id);
    }

    await sb.from('configuracoes').update({
      fila_ultimo_envio_em: new Date().toISOString(),
      fila_erros_consecutivos: 0,
    }).eq('id', 1);

    return json({ ok: true, enviado: item.id, paciente: pac.nome });
  } else {
    // Erro ao enviar
    const erros = (cfg.fila_erros_consecutivos || 0) + 1;
    await sb.from('fila_lembretes').update({
      status: 'erro',
      motivo: res.erro || 'Falha no envio',
    }).eq('id', item.id);

    await sb.from('configuracoes').update({ fila_erros_consecutivos: erros }).eq('id', 1);

    if (erros >= 3) {
      await sb.from('configuracoes').update({ fila_ativa: false }).eq('id', 1);
      await sb.from('notificacoes').insert({
        tipo: 'whatsapp_erro',
        prioridade: 'alta',
        titulo: 'Fila de lembretes pausada após 3 falhas seguidas ⚠️',
        mensagem: `Erro recente: ${res.erro}. Verifique o número da clínica na aba WhatsApp.`,
      });
    }

    return json({ ok: false, erro: res.erro, id: item.id });
  }
});
