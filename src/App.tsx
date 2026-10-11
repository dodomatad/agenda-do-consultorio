import { useEffect, useState } from 'react';
import { supabase, configurado } from './lib/supabase';
import { StoreProvider, useStore, Pagina } from './lib/store';
import { Icon, Avatar, Modal } from './components/ui';
import { abrirJanelaWhatsApp } from './lib/utils';
import Login from './pages/Login';
import Agenda from './pages/Agenda';
import Pacientes from './pages/Pacientes';
import Notificacoes from './pages/Notificacoes';
import WhatsApp from './pages/WhatsApp';
import FilaLembretes from './pages/FilaLembretes';
import Etiquetas from './pages/Etiquetas';

import Configuracoes from './pages/Configuracoes';
import { ConsultaForm } from './components/ConsultaForm';
import { ConsultaCard } from './components/ConsultaCard';
import { EnviarWhatsApp } from './components/EnviarWhatsApp';
import { PacienteFicha, PacienteForm } from './components/Paciente';

export default function App() {
  const [sessaoUser, setSessaoUser] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessaoUser(data.session?.user.id ?? null);
      setCarregando(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessaoUser(session?.user.id ?? null);
      setCarregando(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  if (!configurado) {
    return (
      <div className="login-screen">
        <div className="login-card card">
          <div className="login-brand">
            <div className="login-logo">⚠️</div>
            <h1>Configuração do Supabase</h1>
            <p className="muted">As variáveis de ambiente do Supabase precisam ser configuradas.</p>
          </div>
          <div className="banner amarelo" style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
            Copie o arquivo <code>.env.example</code> para <code>.env</code> e preencha:
            <br />
            <b>VITE_SUPABASE_URL</b> e <b>VITE_SUPABASE_ANON_KEY</b>.
          </div>
        </div>
      </div>
    );
  }

  if (carregando) {
    return (
      <div className="splash">
        <div className="splash-logo">🦷</div>
        <p className="font-display">Carregando Agenda do Consultório…</p>
      </div>
    );
  }

  if (!sessaoUser) {
    return <Login onConectado={(id) => setSessaoUser(id)} />;
  }

  return (
    <StoreProvider userId={sessaoUser}>
      <AppShell />
    </StoreProvider>
  );
}

function AppShell() {
  const {
    pagina,
    navegar,
    perfil,
    cfg,
    naoLidas,
    toasts,
    confirmState,
    consultaForm,
    consultaCard,
    whatsapp,
    pacienteFicha,
    pacienteForm,
  } = useStore();

  const [temaEscuro, setTemaEscuro] = useState(() => {
    return localStorage.getItem('tema') === 'escuro';
  });

  useEffect(() => {
    if (temaEscuro) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('tema', 'escuro');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('tema', 'claro');
    }
  }, [temaEscuro]);

  async function sair() {
    await supabase.auth.signOut();
  }

  const itensMenu: { id: Pagina; label: string; icone: string; badge?: number }[] = [
    { id: 'agenda', label: 'Agenda', icone: 'agenda' },
    { id: 'fila', label: 'Fila de lembretes', icone: 'fila' },
    { id: 'pacientes', label: 'Pacientes', icone: 'pacientes' },
    { id: 'notificacoes', label: 'Notificações', icone: 'sino', badge: naoLidas },
    { id: 'whatsapp', label: 'WhatsApp', icone: 'whatsapp' },
    { id: 'etiquetas', label: 'Etiquetas', icone: 'etiqueta' },
    { id: 'configuracoes', label: 'Configurações', icone: 'config' },
  ];


  return (
    <div className="layout-root">
      {/* Sidebar Desktop */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/logo-odontoclin.jpg" alt="Odontoclin" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', boxShadow: '0 2px 8px rgba(0, 168, 204, 0.3)' }} />
          <div className="brand-info">
            <h2 className="brand-title">{cfg?.nome_clinica && cfg.nome_clinica !== 'Clínica Sorriso' ? cfg.nome_clinica : 'Odontoclin'}</h2>
            <span className="brand-sub">Dentistas e Exames</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {itensMenu.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${pagina === item.id ? 'ativo' : ''}`}
              onClick={() => navegar(item.id)}
            >
              <Icon n={item.icone} s={20} />
              <span>{item.label}</span>
              {!!item.badge && item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <Avatar nome={perfil?.nome || 'Usuário'} tam={36} />
            <div className="user-details">
              <span className="user-name">{perfil?.nome || 'Carregando…'}</span>
              <span className="user-role">{perfil?.papel === 'admin' ? 'Administrador' : 'Atendente'}</span>
            </div>
          </div>
          <div className="sidebar-actions">
            <button
              className="icon-btn"
              onClick={() => abrirJanelaWhatsApp()}
              title="Abrir WhatsApp Web ao lado da agenda"
              style={{ color: '#25D366' }}
            >
              <Icon n="whatsapp" s={18} />
            </button>
            <button
              className="icon-btn"
              onClick={() => setTemaEscuro(!temaEscuro)}
              title={temaEscuro ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
            >
              <Icon n={temaEscuro ? 'sol' : 'lua'} s={18} />
            </button>
            <button className="icon-btn danger" onClick={sair} title="Sair do sistema">
              <Icon n="sair" s={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <main className="content-area">
        {pagina === 'agenda' && <Agenda />}
        {pagina === 'fila' && <FilaLembretes />}
        {pagina === 'pacientes' && <Pacientes />}
        {pagina === 'notificacoes' && <Notificacoes />}
        {pagina === 'whatsapp' && <WhatsApp />}
        {pagina === 'etiquetas' && <Etiquetas />}
        {pagina === 'configuracoes' && <Configuracoes />}
      </main>


      {/* Barra Inferior Mobile */}
      <nav className="mobile-bar">
        {itensMenu.slice(0, 5).map((item) => (
          <button
            key={item.id}
            className={`mobile-bar-btn ${pagina === item.id ? 'ativo' : ''}`}
            onClick={() => navegar(item.id)}
          >
            <div className="mobile-icon-wrap">
              <Icon n={item.icone} s={22} />
              {!!item.badge && item.badge > 0 && <span className="mobile-badge">{item.badge}</span>}
            </div>
            <span>{item.label}</span>
          </button>
        ))}
        <button
          className={`mobile-bar-btn ${pagina === 'configuracoes' ? 'ativo' : ''}`}
          onClick={() => navegar('configuracoes')}
        >
          <div className="mobile-icon-wrap">
            <Icon n="config" s={22} />
          </div>
          <span>Ajustes</span>
        </button>
      </nav>

      {/* Modais Globais */}
      {consultaForm && <ConsultaForm />}
      {consultaCard && <ConsultaCard />}
      {whatsapp && <EnviarWhatsApp />}
      {pacienteFicha && <PacienteFicha />}
      {pacienteForm && <PacienteForm />}

      {/* Dialog de Confirmação */}
      {confirmState && (
        <Modal
          titulo="Confirmação"
          onClose={() => confirmState.resolve(false)}
          largura={420}
          rodape={
            <>
              <button className="btn ghost" onClick={() => confirmState.resolve(false)}>
                Cancelar
              </button>
              <button
                className={`btn ${confirmState.perigo ? 'danger' : 'primary'}`}
                onClick={() => confirmState.resolve(true)}
              >
                {confirmState.ok}
              </button>
            </>
          }
        >
          <p style={{ margin: '8px 0 16px', lineHeight: 1.5 }}>{confirmState.texto}</p>
        </Modal>
      )}

      {/* Toasts */}
      <div className="toasts-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tipo} fade`}>
            <span>{t.texto}</span>
            {t.acao && (
              <button className="toast-action" onClick={t.acao.fn}>
                {t.acao.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
