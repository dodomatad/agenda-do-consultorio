import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { Config, Consulta, Etiqueta, FormaPagamento, Modelo, Notificacao, Paciente, Perfil, Procedimento, Profissional, StatusTransacao, TipoTransacao } from './types';

export type Pagina = 'agenda' | 'pacientes' | 'financeiro' | 'notificacoes' | 'whatsapp' | 'fila' | 'etiquetas' | 'configuracoes';

export interface ConsultaPrefill {
  id?: string; paciente_id?: string; data?: string; hora_inicio?: string; profissional_id?: string | null;
  procedimento_id?: string | null; duracao_minutos?: number; titulo?: string; aviso?: string; sugerirWhatsApp?: boolean;
}
export interface WhatsAppAlvo { paciente: Pick<Paciente, 'id' | 'nome' | 'telefone_whatsapp' | 'aceita_whatsapp'>; consulta?: Consulta | null; gatilho?: string; }
export interface TransacaoPrefill {
  id?: string; tipo?: TipoTransacao; categoria?: string; descricao?: string; valor?: number;
  forma_pagamento?: FormaPagamento | null; status?: StatusTransacao; data_competencia?: string;
  data_pagamento?: string | null; paciente_id?: string | null; consulta_id?: string | null;
  profissional_id?: string | null; onSalvo?: () => void;
}
interface Toast { id: number; texto: string; tipo: 'ok' | 'erro' | 'info'; acao?: { label: string; fn: () => void } }

interface Store {
  perfil: Perfil | null; isAdmin: boolean;
  cfg: Config | null; procedimentos: Procedimento[]; profissionais: Profissional[]; etiquetas: Etiqueta[]; modelos: Modelo[];
  recarregar: () => Promise<void>;
  versao: number; bump: () => void;
  pagina: Pagina; navegar: (p: Pagina) => void;
  naoLidas: number; setNaoLidas: (n: number) => void;
  toasts: Toast[]; toast: (texto: string, tipo?: Toast['tipo'], acao?: Toast['acao']) => void;
  confirmar: (texto: string, opts?: { ok?: string; perigo?: boolean }) => Promise<boolean>;
  confirmState: { texto: string; ok: string; perigo: boolean; resolve: (v: boolean) => void } | null;
  // Janelas
  consultaForm: ConsultaPrefill | null; abrirConsultaForm: (p: ConsultaPrefill | null) => void;
  consultaCard: string | null; abrirConsultaCard: (id: string | null) => void;
  whatsapp: WhatsAppAlvo | null; abrirWhatsApp: (a: WhatsAppAlvo | null) => void;
  pacienteFicha: string | null; abrirPaciente: (id: string | null) => void;
  pacienteForm: { id?: string; nome?: string; onSalvo?: (p: Paciente) => void } | null; abrirPacienteForm: (v: Store['pacienteForm']) => void;
  transacaoForm: TransacaoPrefill | null; abrirTransacaoForm: (t: TransacaoPrefill | null) => void;
}

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore deve ser usado dentro de StoreProvider');
  return c;
};

export function StoreProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [procedimentos, setProc] = useState<Procedimento[]>([]);
  const [profissionais, setProf] = useState<Profissional[]>([]);
  const [etiquetas, setEtiq] = useState<Etiqueta[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [versao, setVersao] = useState(0);
  const [pagina, setPagina] = useState<Pagina>((location.hash.slice(1) as Pagina) || 'agenda');
  const [naoLidas, setNaoLidas] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<Store['confirmState']>(null);
  const [consultaForm, abrirConsultaForm] = useState<ConsultaPrefill | null>(null);
  const [consultaCard, abrirConsultaCard] = useState<string | null>(null);
  const [whatsapp, abrirWhatsApp] = useState<WhatsAppAlvo | null>(null);
  const [pacienteFicha, abrirPaciente] = useState<string | null>(null);
  const [pacienteForm, abrirPacienteForm] = useState<Store['pacienteForm']>(null);
  const [transacaoForm, abrirTransacaoForm] = useState<Store['transacaoForm']>(null);
  const tid = useRef(0);

  const toast = useCallback((texto: string, tipo: Toast['tipo'] = 'ok', acao?: Toast['acao']) => {
    const id = ++tid.current;
    setToasts((t) => [...t, { id, texto, tipo, acao }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), acao ? 7000 : 3200);
  }, []);

  const recarregar = useCallback(async () => {
    const [p, c, pr, pf, e, m] = await Promise.all([
      supabase.from('perfis').select('*').eq('id', userId).single(),
      supabase.from('configuracoes').select('*').eq('id', 1).single(),
      supabase.from('procedimentos').select('*').order('nome'),
      supabase.from('profissionais').select('*').order('nome'),
      supabase.from('etiquetas').select('*').order('nome'),
      supabase.from('modelos_mensagem').select('*').order('nome'),
    ]);
    let userPerfil = p.data;
    if (!userPerfil) {
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) {
        userPerfil = {
          id: authData.user.id,
          nome: (authData.user.user_metadata?.nome || authData.user.email?.split('@')[0] || 'Usuário'),
          email: authData.user.email || '',
          papel: (authData.user.user_metadata?.papel || 'admin'),
          ativo: true,
        };
      }
    }
    setPerfil(userPerfil); setCfg(c.data); setProc(pr.data ?? []); setProf(pf.data ?? []); setEtiq(e.data ?? []); setModelos(m.data ?? []);
  }, [userId]);


  const contarNaoLidas = useCallback(async () => {
    const { count } = await supabase.from('notificacoes').select('id', { count: 'exact', head: true }).eq('lida', false).eq('resolvida', false);
    setNaoLidas(count ?? 0);
  }, []);

  useEffect(() => { recarregar(); contarNaoLidas(); }, [recarregar, contarNaoLidas]);

  // Realtime: notificações, consultas e status do WhatsApp
  useEffect(() => {
    const ch = supabase.channel('app')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes' }, (p: { new: Notificacao }) => {
        contarNaoLidas();
        toast(`🔔 ${p.new.titulo}`, p.new.prioridade === 'alta' ? 'erro' : 'info', { label: 'Ver', fn: () => navegar('notificacoes') });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notificacoes' }, () => contarNaoLidas())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consultas' }, () => setVersao((v) => v + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fila_lembretes' }, () => setVersao((v) => v + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transacoes_financeiras' }, () => setVersao((v) => v + 1))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensagens_whatsapp' }, () => setVersao((v) => v + 1))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'configuracoes' }, (p: { new: Config }) => setCfg(p.new))

      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [toast, contarNaoLidas]);

  const navegar = (p: Pagina) => { setPagina(p); location.hash = p; window.scrollTo({ top: 0 }); };
  useEffect(() => {
    const f = () => setPagina((location.hash.slice(1) as Pagina) || 'agenda');
    window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f);
  }, []);

  const confirmar = (texto: string, opts?: { ok?: string; perigo?: boolean }) =>
    new Promise<boolean>((resolve) => setConfirmState({ texto, ok: opts?.ok ?? 'Confirmar', perigo: !!opts?.perigo, resolve: (v) => { setConfirmState(null); resolve(v); } }));

  return (
    <Ctx.Provider value={{
      perfil, isAdmin: perfil?.papel === 'admin', cfg, procedimentos, profissionais, etiquetas, modelos, recarregar,
      versao, bump: () => setVersao((v) => v + 1), pagina, navegar, naoLidas, setNaoLidas, toasts, toast, confirmar, confirmState,
      consultaForm, abrirConsultaForm, consultaCard, abrirConsultaCard, whatsapp, abrirWhatsApp, pacienteFicha, abrirPaciente,
      pacienteForm, abrirPacienteForm, transacaoForm, abrirTransacaoForm,
    }}>{children}</Ctx.Provider>
  );
}
