import type { Config } from './types';

export const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const DIAS_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const PALETA = ['#127A6C', '#5B3FC4', '#C43D3D', '#2B8FD6', '#E08A1E', '#D4A017', '#3BA776', '#E26BA5', '#8C4A2F', '#0E9AA7', '#6B7C85', '#14303A'];

/** Datas são manipuladas como 'aaaa-mm-dd' (sem fuso). */
export const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fromISO = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const hojeISO = () => toISO(new Date());
export const addDias = (s: string, n: number) => { const d = fromISO(s); d.setDate(d.getDate() + n); return toISO(d); };
export const addMeses = (s: string, n: number) => {
  const d = fromISO(s); const dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
  const ult = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(dia, ult)); return toISO(d);
};
export const diffDias = (a: string, b: string) => Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 86400000);
export const fmtData = (s?: string | null) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '');
export const fmtHora = (s?: string | null) => (s ? s.slice(0, 5) : '');
export const diaSemana = (s: string) => DIAS_SEMANA[fromISO(s).getDay()];
/** Segunda-feira da semana da data. */
export const inicioSemana = (s: string) => { const d = fromISO(s); const dw = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dw); return toISO(d); };
export const minutos = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function proximoDiaUtil(s: string, cfg: Pick<Config, 'dias_atendimento'> | null) {
  const dias = cfg?.dias_atendimento?.length ? cfg.dias_atendimento : [1, 2, 3, 4, 5, 6];
  let d = s;
  for (let i = 0; i < 7 && !dias.includes(fromISO(d).getDay()); i++) d = addDias(d, 1);
  return d;
}

export const primeiroNome = (n: string) => (n || '').trim().split(/\s+/)[0] || '';
export const iniciais = (n: string) => (n || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export function fmtTelefone(t?: string | null) {
  const d = (t || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t || '';
}
export const telefoneWa = (t?: string | null) => { let d = (t || '').replace(/\D/g, ''); if (d.length <= 11) d = '55' + d; return d; };

/** Detecta se o usuário está acessando pelo celular ou tablet */
export const ehDispositivoMovel = () => {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
};

/** Gera o link ideal: no celular abre direto o app oficial (whatsapp:// ou api.whatsapp.com), no PC abre o Web */
export const linkWaMe = (tel: string | null | undefined, texto: string) => {
  const numero = telefoneWa(tel);
  const msg = encodeURIComponent(texto);
  if (ehDispositivoMovel()) {
    return `https://api.whatsapp.com/send?phone=${numero}&text=${msg}`;
  }
  return `https://web.whatsapp.com/send?phone=${numero}&text=${msg}`;
};

/** Abre o WhatsApp de forma inteligente: no mobile abre o app, no PC abre painel lateral dedicado */
export function abrirJanelaWhatsApp(tel?: string | null, texto = '') {
  const url = linkWaMe(tel, texto);
  if (ehDispositivoMovel()) {
    window.open(url, '_blank');
    return null;
  }
  const largura = 520;
  const altura = window.screen.availHeight || 780;
  const esquerda = (window.screen.availWidth || 1280) - largura;
  const janela = window.open(
    url,
    'WhatsAppWebPopup',
    `width=${largura},height=${altura},left=${esquerda},top=0,resizable=yes,scrollbars=yes,status=no,menubar=no,toolbar=no`
  );
  if (janela) janela.focus();
  return janela;
}

/** CPF mascarado para listas (LGPD): ***.456.789-** */
export function cpfMascarado(c?: string | null) {
  const d = (c || '').replace(/\D/g, '');
  if (d.length !== 11) return c ? '•••' : '';
  return `•••.${d.slice(3, 6)}.${d.slice(6, 9)}-••`;
}
export function fmtCpf(c: string) {
  const d = c.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export const VARIAVEIS = ['nome', 'data', 'hora', 'dia_semana', 'procedimento', 'profissional', 'clinica', 'endereco'];
export function preencherModelo(texto: string, v: Partial<Record<'nome' | 'data' | 'hora' | 'procedimento' | 'profissional' | 'clinica' | 'endereco', string | null | undefined>>) {
  const map: Record<string, string> = {
    nome: primeiroNome(v.nome || ''), data: v.data ? fmtData(v.data) : '', hora: fmtHora(v.hora),
    dia_semana: v.data ? diaSemana(v.data) : '', procedimento: v.procedimento || '', profissional: v.profissional || '',
    clinica: v.clinica || '', endereco: v.endereco || '',
  };
  return texto.replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
}

export function tempoRelativo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

export const STATUS_INFO: Record<string, { label: string; icone: string; cor: string }> = {
  agendado: { label: 'Aguardando', icone: '⏳', cor: '#D4A017' },
  confirmado: { label: 'Confirmado', icone: '✓', cor: '#127A6C' },
  'em atendimento': { label: 'Em atendimento', icone: '🦷', cor: '#2B8FD6' },
  atendido: { label: 'Atendido', icone: '✔', cor: '#3BA776' },
  faltou: { label: 'Faltou', icone: '✗', cor: '#C43D3D' },
  desmarcou: { label: 'Desmarcou', icone: '⊘', cor: '#6B7C85' },
};

export const cls = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export const fmtMoeda = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

/**
 * Sanitiza texto de busca digitado pelo usuário antes de montar filtros PostgREST (.or() / .ilike()).
 * Remove vírgulas, parênteses e caracteres curingas (% e _) para evitar injeção de sintaxe no .or().
 */
export function sanitizarTermoBusca(termo: string): string {
  return termo.replace(/[,()\\%_]/g, ' ').replace(/\s+/g, ' ').trim();
}

