import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import type { FormaPagamento, Paciente, StatusTransacao, TipoTransacao } from '../lib/types';
import { fmtCpf, fmtTelefone, hojeISO, sanitizarTermoBusca } from '../lib/utils';
import { Avatar, Icon, Modal } from './ui';

const CATEGORIAS_RECEITA = ['Consulta', 'Procedimento', 'Manutenção de aparelho', 'Outros'];
const CATEGORIAS_DESPESA = ['Material', 'Laboratório', 'Aluguel', 'Contas', 'Salários', 'Outros'];

const FORMAS_PAGAMENTO: { id: FormaPagamento; label: string }[] = [
  { id: 'pix', label: 'PIX' },
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'cartao_credito', label: 'Cartão de Crédito' },
  { id: 'cartao_debito', label: 'Cartão de Débito' },
  { id: 'boleto', label: 'Boleto' },
  { id: 'convenio', label: 'Convênio' },
];

export function TransacaoForm() {
  const { transacaoForm: pre, abrirTransacaoForm, profissionais, toast, bump } = useStore();
  const editando = !!pre?.id;

  const [tipo, setTipo] = useState<TipoTransacao>(pre?.tipo ?? 'receita');
  const [categoria, setCategoria] = useState<string>(
    pre?.categoria ?? (pre?.tipo === 'despesa' ? CATEGORIAS_DESPESA[0] : CATEGORIAS_RECEITA[0])
  );
  const [descricao, setDescricao] = useState<string>(pre?.descricao ?? '');
  const [valorStr, setValorStr] = useState<string>(
    pre?.valor ? (pre.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
  );
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | ''>(pre?.forma_pagamento ?? 'pix');
  const [status, setStatus] = useState<StatusTransacao>(pre?.status ?? 'pago');
  const [dataCompetencia, setDataCompetencia] = useState<string>(pre?.data_competencia ?? hojeISO());
  const [dataPagamento, setDataPagamento] = useState<string>(
    pre?.data_pagamento ?? (pre?.status === 'pendente' ? '' : hojeISO())
  );
  const [profissionalId, setProfissionalId] = useState<string>(pre?.profissional_id ?? '');

  // Paciente
  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [buscaPaciente, setBuscaPaciente] = useState('');
  const [resultadosPacientes, setResultadosPacientes] = useState<Paciente[]>([]);
  const [salvando, setSalvando] = useState(false);

  // Inicialização e pré-preenchimento
  useEffect(() => {
    if (pre?.id) {
      supabase
        .from('transacoes_financeiras')
        .select('*, pacientes(*)')
        .eq('id', pre.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setTipo(data.tipo);
            setCategoria(data.categoria);
            setDescricao(data.descricao);
            setValorStr(Number(data.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            setFormaPagamento(data.forma_pagamento ?? '');
            setStatus(data.status);
            setDataCompetencia(data.data_competencia);
            setDataPagamento(data.data_pagamento ?? '');
            setProfissionalId(data.profissional_id ?? '');
            if (data.pacientes) setPaciente(data.pacientes);
          }
        });
    } else if (pre?.paciente_id) {
      supabase
        .from('pacientes')
        .select('*')
        .eq('id', pre.paciente_id)
        .single()
        .then(({ data }) => {
          if (data) setPaciente(data);
        });
    }
  }, [pre]);

  // Busca reativa de pacientes
  useEffect(() => {
    const q = sanitizarTermoBusca(buscaPaciente);
    if (!q) {
      setResultadosPacientes([]);
      return;
    }
    const timer = setTimeout(async () => {
      const dig = q.replace(/\D/g, '');
      let req = supabase.from('pacientes').select('*').eq('ativo', true).limit(20);
      req = dig.length >= 3
        ? req.or(`nome.ilike.%${q}%,telefone_whatsapp.ilike.%${dig}%,cpf.ilike.%${dig}%`)
        : req.ilike('nome', `%${q}%`);
      const { data } = await req;
      setResultadosPacientes(data ?? []);
    }, 300);
    return () => clearTimeout(timer);
  }, [buscaPaciente]);

  // Se trocar o tipo (receita / despesa), ajusta categoria padrão se necessário
  function trocarTipo(novoTipo: TipoTransacao) {
    setTipo(novoTipo);
    if (novoTipo === 'receita' && !CATEGORIAS_RECEITA.includes(categoria)) {
      setCategoria(CATEGORIAS_RECEITA[0]);
    } else if (novoTipo === 'despesa' && !CATEGORIAS_DESPESA.includes(categoria)) {
      setCategoria(CATEGORIAS_DESPESA[0]);
    }
  }

  // Formatação de valor monetário
  function handleValorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) {
      setValorStr('');
      return;
    }
    const num = Number(raw) / 100;
    setValorStr(num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }

  function parseValor(str: string): number {
    if (!str) return 0;
    const limpo = str.replace(/\./g, '').replace(',', '.');
    return Number(limpo) || 0;
  }

  async function salvar() {
    const val = parseValor(valorStr);
    if (!descricao.trim()) return toast('Informe a descrição do lançamento', 'erro');
    if (val <= 0) return toast('Informe um valor maior que zero', 'erro');

    if (status === 'pago') {
      if (!formaPagamento) return toast('Selecione a forma de pagamento', 'erro');
      if (!dataPagamento) return toast('Informe a data do pagamento', 'erro');
    }

    setSalvando(true);

    const dados = {
      tipo,
      categoria,
      descricao: descricao.trim(),
      valor: val,
      forma_pagamento: formaPagamento ? formaPagamento : null,
      status,
      data_competencia: dataCompetencia || hojeISO(),
      data_pagamento: status === 'pago' ? (dataPagamento || hojeISO()) : null,
      paciente_id: tipo === 'receita' ? (paciente?.id ?? null) : null,
      consulta_id: pre?.consulta_id ?? null,
      profissional_id: profissionalId || null,
    };

    let erroSalvar: string | null = null;
    if (editando) {
      const { error } = await supabase.from('transacoes_financeiras').update(dados).eq('id', pre!.id!);
      if (error) erroSalvar = error.message;
    } else {
      const { error } = await supabase.from('transacoes_financeiras').insert(dados);
      if (error) erroSalvar = error.message;
    }

    setSalvando(false);

    if (erroSalvar) {
      return toast('Erro ao salvar transação: ' + erroSalvar, 'erro');
    }

    toast(editando ? 'Lançamento atualizado' : (tipo === 'receita' ? 'Receita registrada' : 'Despesa registrada'));
    bump();
    pre?.onSalvo?.();
    abrirTransacaoForm(null);
  }

  const categorias = tipo === 'receita' ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA;

  return (
    <Modal
      largura={560}
      titulo={editando ? 'Editar Lançamento' : (tipo === 'receita' ? 'Nova Receita' : 'Nova Despesa')}
      subtitulo={editando ? undefined : 'Preencha os dados financeiros'}
      onClose={() => abrirTransacaoForm(null)}
      rodape={
        <>
          <button className="btn ghost" type="button" onClick={() => abrirTransacaoForm(null)}>
            Cancelar
          </button>
          <button
            className={`btn ${tipo === 'receita' ? 'primary' : 'danger'}`}
            type="button"
            disabled={salvando}
            onClick={salvar}
          >
            <Icon n="check" s={18} /> {salvando ? 'Salvando…' : 'Salvar Lançamento'}
          </button>
        </>
      }
    >
      {/* Alternador Tipo */}
      {!editando && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button
            type="button"
            className={`btn flex1 ${tipo === 'receita' ? 'primary' : 'ghost'}`}
            onClick={() => trocarTipo('receita')}
            style={tipo === 'receita' ? { background: '#0E9F6E', borderColor: '#0E9F6E' } : {}}
          >
            <span style={{ fontSize: '1.1rem' }}>📈</span> Receita (Entrada)
          </button>
          <button
            type="button"
            className={`btn flex1 ${tipo === 'despesa' ? 'danger' : 'ghost'}`}
            onClick={() => trocarTipo('despesa')}
            style={tipo === 'despesa' ? { background: '#E02424', borderColor: '#E02424' } : {}}
          >
            <span style={{ fontSize: '1.1rem' }}>📉</span> Despesa (Saída)
          </button>
        </div>
      )}

      {/* Categoria e Descrição */}
      <div className="grid2">
        <label className="field">
          <span>Categoria *</span>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            {categorias.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Valor (R$) *</span>
          <input
            inputMode="numeric"
            placeholder="0,00"
            value={valorStr}
            onChange={handleValorChange}
            style={{ fontWeight: 700, fontSize: '1.1rem' }}
          />
        </label>
      </div>

      <label className="field">
        <span>Descrição *</span>
        <input
          autoFocus={!editando}
          placeholder={tipo === 'receita' ? 'Ex: Limpeza e clareamento dental' : 'Ex: Compra de luvas e máscaras'}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
        />
      </label>

      {/* Paciente (Apenas para Receita) */}
      {tipo === 'receita' && (
        <div className="field">
          <span>Paciente associado</span>
          {paciente ? (
            <div className="pac-selecionado">
              <Avatar nome={paciente.nome} foto={paciente.foto_url} tam={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{paciente.nome}</b>
                <small className="muted" style={{ display: 'block' }}>
                  {fmtTelefone(paciente.telefone_whatsapp)} {paciente.cpf && `· CPF ${fmtCpf(paciente.cpf)}`}
                </small>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  setPaciente(null);
                  setBuscaPaciente('');
                }}
                title="Trocar paciente"
              >
                <Icon n="x" s={16} />
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input
                placeholder="Buscar paciente por nome, CPF ou WhatsApp…"
                value={buscaPaciente}
                onChange={(e) => setBuscaPaciente(e.target.value)}
              />
              {resultadosPacientes.length > 0 && (
                <ul className="busca-dropdown fade" style={{ zIndex: 100 }}>
                  {resultadosPacientes.map((p) => (
                    <li
                      key={p.id}
                      onClick={() => {
                        setPaciente(p);
                        setBuscaPaciente('');
                        setResultadosPacientes([]);
                      }}
                    >
                      <Avatar nome={p.nome} foto={p.foto_url} tam={32} />
                      <div>
                        <b>{p.nome}</b>
                        <small className="muted">{fmtTelefone(p.telefone_whatsapp)}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Profissional e Forma de Pagamento */}
      <div className="grid2">
        <label className="field">
          <span>Profissional / Dentista</span>
          <select value={profissionalId} onChange={(e) => setProfissionalId(e.target.value)}>
            <option value="">Nenhum (Geral da clínica)</option>
            {profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Forma de Pagamento {status === 'pago' ? '*' : '(opcional)'}</span>
          <select
            value={formaPagamento}
            onChange={(e) => setFormaPagamento(e.target.value as FormaPagamento)}
          >
            <option value="">Selecione...</option>
            {FORMAS_PAGAMENTO.map((fp) => (
              <option key={fp.id} value={fp.id}>
                {fp.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Status, Competência e Data Pagamento */}
      <div className="grid3" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        <label className="field">
          <span>Status</span>
          <select
            value={status}
            onChange={(e) => {
              const novo = e.target.value as StatusTransacao;
              setStatus(novo);
              if (novo === 'pago' && !dataPagamento) setDataPagamento(hojeISO());
            }}
          >
            <option value="pago">✓ Pago</option>
            <option value="pendente">⏳ Pendente</option>
            <option value="cancelado">⊘ Cancelado</option>
          </select>
        </label>

        <label className="field">
          <span>Data de Competência *</span>
          <input
            type="date"
            value={dataCompetencia}
            onChange={(e) => setDataCompetencia(e.target.value)}
          />
        </label>

        {status === 'pago' && (
          <label className="field">
            <span>Data de Pagamento *</span>
            <input
              type="date"
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
            />
          </label>
        )}
      </div>
    </Modal>
  );
}
