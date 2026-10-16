import { supabase } from './supabase';
import type { Consulta, Status } from './types';
import { addDias, hojeISO, primeiroNome, proximoDiaUtil } from './utils';
import type { useStore } from './store';

type S = ReturnType<typeof useStore>;

/** Muda o status e aplica a regra automática do aparelho. */
export async function mudarStatus(c: Consulta, status: Status, s: S) {
  const extra: Record<string, unknown> = { status };
  const { error } = await supabase.from('consultas').update(extra).eq('id', c.id);
  if (error) return s.toast('Não foi possível mudar o status', 'erro');
  s.toast(`Status: ${status}`);
  s.bump();

  const proc = s.procedimentos.find((p) => p.id === c.procedimento_id);
  if (status === 'atendido' && proc?.eh_manutencao_aparelho) await sugerirProximaManutencao(c, s);
  if (status === 'faltou') {
    const pac = c.pacientes;
    if (pac?.aceita_whatsapp) s.toast(`${primeiroNome(pac.nome)} faltou. Oferecer remarcação?`, 'info', {
      label: 'Enviar WhatsApp', fn: () => s.abrirWhatsApp({ paciente: pac, consulta: c, gatilho: 'falta' }),
    });
  }
}

export async function sugerirProximaManutencao(c: Consulta, s: S) {
  const hoje = hojeISO();
  const { count } = await supabase.from('consultas').select('id', { count: 'exact', head: true })
    .eq('paciente_id', c.paciente_id).gt('data', hoje).in('status', ['agendado', 'confirmado']);
  if (count) return;
  const { data: pac } = await supabase.from('pacientes').select('nome,intervalo_manutencao_dias').eq('id', c.paciente_id).single();
  const intervalo = pac?.intervalo_manutencao_dias ?? 30;
  const data = proximoDiaUtil(addDias(hoje, intervalo), s.cfg);
  s.abrirConsultaForm({
    titulo: 'Marcar a próxima manutenção', paciente_id: c.paciente_id, data, hora_inicio: c.hora_inicio,
    profissional_id: c.profissional_id, procedimento_id: c.procedimento_id, duracao_minutos: c.duracao_minutos,
    aviso: `${primeiroNome(pac?.nome ?? '')} usa aparelho. Sugerimos a próxima volta em ${intervalo} dias.`, sugerirWhatsApp: true,
  });
}
