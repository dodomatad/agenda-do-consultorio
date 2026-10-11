import { createClient } from '@supabase/supabase-js';

const url = (
  import.meta.env.VITE_SUPABASE_URL ||
  (import.meta.env as any).NEXT_PUBLIC_ARMAZENAMENTO_SUPABASE_URL ||
  (import.meta.env as any).NEXT_PUBLIC_SUPABASE_URL ||
  (import.meta.env as any).ARMAZENAMENTO_SUPABASE_URL ||
  ''
) as string;

const key = (
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  (import.meta.env as any).NEXT_PUBLIC_ARMAZENAMENTO_SUPABASE_PUBLISHABLE_KEY ||
  (import.meta.env as any).ARMAZENAMENTO_SUPABASE_ANON_KEY ||
  (import.meta.env as any).NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  (import.meta.env as any).SUPABASE_ANON_KEY ||
  ''
) as string;

export const configurado = !!url && !!key && !url.includes('SEU-PROJETO');
export const supabase = createClient(url || 'http://localhost', key || 'anon');


/** Chama uma Edge Function com o JWT do usuário logado. */
export async function chamarFuncao<T = any>(nome: string, body: any): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nome, { body });
  if (error) throw new Error(error.message);
  return data as T;
}
