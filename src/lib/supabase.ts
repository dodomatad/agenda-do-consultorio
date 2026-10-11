import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://ivyiegmumnbeiczxtilz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_aafjx0MC0hXX6atupLgYxA_pUjzl-tQ';

export const configurado = true;
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);


/** Chama uma Edge Function com o JWT do usuário logado. */
export async function chamarFuncao<T = any>(nome: string, body: any): Promise<T> {
  const { data, error } = await supabase.functions.invoke(nome, { body });
  if (error) throw new Error(error.message);
  return data as T;
}
