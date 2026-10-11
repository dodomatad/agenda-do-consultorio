export type Status = 'agendado' | 'confirmado' | 'em atendimento' | 'atendido' | 'faltou' | 'desmarcou';

export interface Etiqueta { id: string; nome: string; cor: string; icone: string | null; tipo: 'paciente' | 'consulta'; }
export interface Profissional { id: string; nome: string; cor: string; ativo: boolean; }
export interface Procedimento { id: string; nome: string; cor: string; duracao_padrao: number; eh_manutencao_aparelho: boolean; }

export interface Paciente {
  id: string; nome: string; telefone_whatsapp: string | null; data_nascimento: string | null;
  cpf: string | null; email: string | null; usa_aparelho: boolean; intervalo_manutencao_dias: number;
  aceita_whatsapp: boolean; observacoes: string | null; foto_url: string | null; ativo: boolean; criado_em: string;
  paciente_etiquetas?: { etiqueta_id: string }[];
}

export interface Consulta {
  id: string; paciente_id: string; profissional_id: string | null; data: string; hora_inicio: string;
  duracao_minutos: number; procedimento_id: string | null; status: Status; observacoes: string | null;
  lembrete_enviado: boolean; confirmado_via_whatsapp: boolean; criado_por: string | null; criado_em: string;
  pacientes?: Pick<Paciente, 'id' | 'nome' | 'telefone_whatsapp' | 'usa_aparelho' | 'foto_url' | 'intervalo_manutencao_dias' | 'aceita_whatsapp'> & { paciente_etiquetas?: { etiqueta_id: string }[] };
  consulta_etiquetas?: { etiqueta_id: string }[];
}

export interface Notificacao {
  id: string; tipo: string; paciente_id: string | null; consulta_id: string | null; titulo: string;
  mensagem: string | null; prioridade: 'alta' | 'media' | 'baixa'; lida: boolean; resolvida: boolean;
  data_referencia: string | null; criado_em: string; pacientes?: { nome: string } | null;
}

export interface Modelo {
  id: string; nome: string; gatilho: string; texto: string; ativo: boolean; antecedencia: number; antecedencia_unidade: 'dias' | 'horas';
}

export interface Mensagem {
  id: string; paciente_id: string | null; consulta_id: string | null; texto: string; direcao: 'enviada' | 'recebida';
  status: string; erro: string | null; enviado_por: string; criado_em: string; pacientes?: { nome: string } | null;
}

export interface Config {
  nome_clinica: string; endereco: string; horario_abertura: string; horario_fechamento: string;
  almoco_inicio: string | null; almoco_fim: string | null; dias_atendimento: number[];
  provedor_whatsapp: string; whatsapp_status: string; whatsapp_status_em: string | null; intervalo_envio_segundos: number;
  notif_aparelho: boolean; notif_confirmacao: boolean; notif_falta: boolean; notif_whatsapp: boolean;
  notif_aniversario: boolean; notif_sumido: boolean; antecedencia_manutencao_dias: number; meses_paciente_sumido: number;
  // Fila de lembretes
  fila_ativa: boolean; fila_intervalo_minutos: number; fila_janela_inicio_dias: number; fila_janela_fim_dias: number;
  fila_incluir_faltas: boolean; fila_ultimo_envio_em: string | null; fila_erros_consecutivos: number;
}

export type StatusFila = 'na fila' | 'enviado' | 'entregue' | 'lido' | 'respondido' | 'erro' | 'cancelado' | 'pulado';
export type TipoFila = 'lembrete_consulta' | 'manutencao_aparelho' | 'remarcar_falta';

export interface FilaItem {
  id: string; consulta_id: string | null; paciente_id: string; tipo: TipoFila;
  texto_final: string; enviar_a_partir_de: string; enviar_ate: string; prioridade: number;
  status: StatusFila; motivo: string | null; resposta_paciente: string | null;
  enviado_em: string | null; criado_em: string;
  pacientes?: { id: string; nome: string; telefone_whatsapp: string | null; aceita_whatsapp: boolean };
  consultas?: { id: string; data: string; hora_inicio: string; status: Status; procedimento_id: string | null };
}

export interface Perfil { id: string; nome: string; email: string; papel: 'admin' | 'atendente'; ativo: boolean; }

