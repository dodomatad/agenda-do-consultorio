import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/ui';

export default function Login({ onConectado }: { onConectado: (id: string) => void }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [modo, setModo] = useState<'login' | 'cadastro'>('login');
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      if (modo === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        if (data.user) onConectado(data.user.id);
      } else {
        if (!nome.trim()) throw new Error('Informe seu nome');
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { data: { nome } },
        });
        if (error) throw error;
        if (data.user) onConectado(data.user.id);
      }
    } catch (err: any) {
      const msg = err.message || 'Erro ao entrar';
      if (msg.includes('Invalid login credentials')) {
        setErro('E-mail ou senha incorretos.');
      } else {
        setErro(msg);
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card card fade">
        <div className="login-brand">
          <div className="login-logo">🦷</div>
          <h1>Agenda do Consultório</h1>
          <p className="muted">Recepção odontológica simples, rápida e acolhedora</p>
        </div>

        {erro && <div className="banner vermelho" style={{ marginBottom: 16 }}>⚠️ {erro}</div>}

        <form onSubmit={submeter}>
          {modo === 'cadastro' && (
            <label className="field">
              <span>Seu nome completo</span>
              <input
                autoFocus
                type="text"
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Mariana Souza"
              />
            </label>
          )}

          <label className="field">
            <span>E-mail</span>
            <input
              type="email"
              required
              autoFocus={modo === 'login'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="atendente@clinica.com.br"
            />
          </label>

          <label className="field">
            <span>Senha</span>
            <input
              type="password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
            />
          </label>

          <button type="submit" className="btn primary login-submit" disabled={carregando}>
            {carregando ? 'Acessando…' : modo === 'login' ? 'Entrar no sistema' : 'Criar minha conta'}
          </button>
        </form>

        <div className="login-alternar">
          {modo === 'login' ? (
            <p className="muted">
              Primeiro acesso da clínica?{' '}
              <button type="button" className="link-btn" onClick={() => { setModo('cadastro'); setErro(null); }}>
                Criar conta de administrador
              </button>
            </p>
          ) : (
            <p className="muted">
              Já possui conta?{' '}
              <button type="button" className="link-btn" onClick={() => { setModo('login'); setErro(null); }}>
                Voltar para o login
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
