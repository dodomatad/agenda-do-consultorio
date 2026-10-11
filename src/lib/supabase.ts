import { createClient } from '@supabase/supabase-js';

const defaultUrl = 'https://lvyiegmumnbeiczxtilz.supabase.co';
const defaultKey = 'sb_publishable_aafjx0MC0hXX6atupLgYxA_pUjzl-tQ';

const url = (
  import.meta.env.VITE_SUPABASE_URL ||
  (import.meta.env as any).NEXT_PUBLIC_ARMAZENAMENTO_SUPABASE_URL ||
  (import.meta.env as any).NEXT_PUBLIC_SUPABASE_URL ||
  (import.meta.env as any).ARMAZENAMENTO_SUPABASE_URL ||
  defaultUrl
) as string;

const key = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  (import.meta.env as any).NEXT_PUBLIC_ARMAZENAMENTO_SUPABASE_PUBLISHABLE_KEY ||
  (import.meta.env as any).ARMAZENAMENTO_SUPABASE_ANON_KEY ||
  (import.meta.env as any).NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  (import.meta.env as any).SUPABASE_ANON_KEY ||
  defaultKey
) as string;

export const configurado = !!url && !!key && !url.includes('SEU-PROJETO');
export const supabase = createClient(url || defaultUrl, key || defaultKey);


/** Chama uma Edge Function com o JWT do usuário logado. */
export async function chamarFuncao<T = any>(nome: string, body: any): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nome, { body });
  if (error) throw new Error(error.message);
  return data as T;
}
