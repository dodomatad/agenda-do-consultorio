import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useStore } from '../lib/store';
import { Modal } from './ui';

export const LISTA_LOTE2_PACIENTES = `Micheles Maria de Souza Leite   81996498193    31/10/1969 ULTIMA CONSULTA 08/09/2026
Paulo Andre Santana de Araújo 81987453057   26/08/1996  ULTIMA CONSULTA 01/09/2026
Yago Alexandre Luna Oliveira de Melo   81985699383   14/07/2009  ULTIMA CONSULTA 01/09/2026
Elaina dos Santos Silva 81988173240   26/08/1983   ULTIMA CONSULTA 19/05/2026
Edmar Ailton da Silva Junior 81988094363   20/01/2009  ULTIMA CONSULTA 04/11/2025
Ellen Eduarda dos Santos  81987760993   22/06/2001      ULTIMA CONSULTA 30/09/2023
Eduardo  Vitor Dos Santos Souza    8198770993  22/05/1998  ULTIMA CONSULTA 30/09/2023
Esdras Gomes Cadete   81987995216     25/08/1997
Eric Cauã Borba C. da Costa   81986699445 83069118    05/06/2003  ULTIMA CONSULTA 01/07/2025
Ewerton Diego Gomes da Silva 81986251893  06/12/2012  ULTIMA CONSULTA  NÃO TEVE
Fabio Jose Patricio  8198875418   11/10/1983     ULTIMA CONSUTLTA  18/111/2024
Guilherme dos Santos Silva  81988173240   08/02/2011  ULTIMA CONSULTA 28/07/2026
Gilka Maria da S. Coelho   81988975667 31/05/1975      ULTIMA CONSULTA 29/10/2025
Gabriella Camily Cipriano Santos  81986765736   08/10/2002 ULTIMA CONSULTA 16/12/2023
Guilherme Leonardo da S. de Oliveira 81983315473  02/08/2010  ULTIMA CONSULTA 04/09/2024
Giovanna Beatriz Paes Barreto da Silva 81985939985   08/10/2007     ULTIMA CONSULTA 28/07/2025
Geisiane Maria de Araújo e Silva 81987179200     22/07/2022  ULTIMA CONSULTA 10/03/2026
Italo Herinque da Silva Machado 81995094130          18/12/2002  ULTIMA CONSULTA 17/03/2026
Igor Gabriel Silva de Lima 81985140126     17/11/2006       ULTIMA CONSULTA 01/07/2025
José Luciano Pedro dos Santos 81984812162    25/07/1986     ULTIMA CONSULTA 20/16/2025
Joao Vitor Moura 81988290780   15/09/2001 ULTIMA CONSULTA 04/12/2023
Jose Luciano dos Santos Silva 81985341843   01/09/1994   ULTIMA CONSULTA 16/12/2023
Josefa Patricia Da Conceição   19/01/1984 ULTIMA CONSULTA 28/09/2020
Laila Jasmine G. C. da Silva 81988912821  30/04/2008   ULTIMA CONSULTA 23/10/2025
Lenilson Antônio da Silva Junior  81991234370  12/10/2007  ULTIMA CONSULTA NÃO TEVE
Luciano Jose Cicero da Silva  81983380555 04/07/2002 ULTIMA CONSULTA  16/01/2023
Leticia Vitoria M. G. dos Santos 81198875667 05/04/2011  ULTIMA CONSULTA 28/07/2026
Lindraci Maria da Conceição da Silva 81994545395 22/09/1989 ULTIMA CONSULTA 18/08/2026
Whallyson Oliveira Silva 81985970272  12/09/1992   ULTIMA CONSULTA 30/08/2021
Adriana Silva da F. B. da Silva 81985630244    16/05/1976 ULTIMA CONSULTA 02/07/2024
Alexsandra Araújo Dos Santos 81988875418  13/12/1978  ULTIMA CONSULTA 16/01/2023
Ana Paula das Neves Da Paz 81985347715   03/05/1984  ULTIMA CONSULTA não tem
Ana Rita de K. P. P.da Silva 81985650782  29/09/1998 ULTIMA CONSULTA 18/04/2023
Alef Cauã da Silva Tomo Md  8198556901  21/05/2010 ULTIMA CONSULTA 23/01/2025
Demétrius De Moura Silva Oliveira 81987356537   03/03/2004  ULTIMA CONSULTA 29/04/2024
Dafilly Arielly da Silva Santos 81985360829   17/12/2006 ULTIMA CONSULTA 22/04/2024
Laila Jenifer Rodrigues Farias 81995706637 24/05/2001 ULTIMA CONSULTA 12/04/2024
Jaciara Bezerra Ferreira    8197683986 04/02/1991 ULTIMA CONSULTA NÃO TEM
Julia Stefanny Berros   81984891839  29/03/2006 ULTIMA CONSULTA 04/09/2023
Jesus Emanuell Soares Das Chagas 81997228812  21/07/2009 ULTIMA CONSULTA 04/12/2023
Emerson Paulino Silva da Costa 81988099444   10/12/2004 ULTIMA CONSULTA 13/10/2026
Daniel Williamis Pyrroho de Lima 81934551509     13/10/2003 ULTIMA CONSULTA 13/10/2026
Nicollas Henrique S. Jose da Silva  81988889251   05/06/2013   ULTIMA CONSULTA 28/07/2026
Adrielly Monique dos Santos Silva 81986987910 28/06/2005 ULTIMA CONSULTA 11/10/2026
Raphael Jonatan da Silva Souza 81998689536   16/12/1998 ULTIMA CONSULTA NÃO TEM
Thiago Wilians G. da Silva 81987616174 06/08/2003   ULTIMA CONSULTA  12/03/2024
Thielly Eloize Valenca 81991610018  08/05/2005 ULTIMA CONSULTA 20/09/2021
Talita Marirtins Barreto 81988428973  03/03/2003 ULTIMA consulta 16/01/2024
Renata Gonçalves de Santana 81992300294 29/10/2020 ULTIMA CONSULTA 19/01/2025`;

export const LISTA_LOTE1_PACIENTES = `Lais Milena Barbosa / celular: 81983103495 / data de nascimento: 05/10/2004 / ultima consulta 22/09/2026 / ortodontia
Alessandra Borba de Araújo / celular: 81986699445 / data de nascimento: 12/03/1987 / ultima consulta 22/09/2026 / ortodontia
Whallyson Oliveira da Silva / celular: 81996959758 / data de nascimento: 12/09/1992 / ultima consulta 22/09/2026 / ortodontia
Aline Maria Alves da Silva / celular: 81996701439 / data de nascimento: 26/05/2003 / ultima consulta 08/09/2026 / ortodontia
Anderson Alves da Silva / celular: 81996701439 / data de nascimento: 25/06/1999 / ultima consulta 08/09/2026 / ortodontia
Apolo Henrique Pereira Ferreira da / celular: 819962994836/ data de nascimento: 21/12/2002 / ultima consulta 22/09/2026 / consultar pasta 
Alayn Galdino da Silva / celular: 81986988737 / data de nascimento: 08/05/1998 / ultima consulta 22/09/2026 / remoção do aparelho falta rever profilaxia
Ana Carolayne R. de Oliveira / celular: 81999073267 / data de nascimento: 07/03/2001 / ultima consulta 01/07/2025 / ortodontia
Allison de Barros da Silva / celular: 81987732549 / data de nascimento: 25/11/1986 / ultima consulta 02/09/2025 / consultar pasta 
Agatha Gabriella Ribeiro Bezerra / celular: 81988224527/ data de nascimento: 21/04/2008 / ultima consulta 12/08/2025 / remoção do aparelho falta rever profilaxia
Douglas Andre da S. Maciel / celular: 81984179044 / data de nascimento: 08/02/2005 / ultima consulta 12/08/2025 / remoção do aparelho falta rever profilaxia
Catarina Cibelle da Silva de Oliveira / celular: 81983315473 / data de nascimento: 12/06/1985 / ultima consulta 12/08/2025 / cirurgia rever profilaxia
Anne Beatriz da Silva Costa / celular: 81988158689 / data de nascimento: 24/10/2008 / ultima consulta 18/03/2024 / remoção do aparelho falta rever profilaxia
Adriana Demétrio Cunha / celular: 81987893781/ data de nascimento: 29/11/1978 / ultima consulta 20/05/2024 / remoção do aparelho, falta rever profilaxia
Anna Yasmim de F. Silva / celular: 81987631577/ data de nascimento: 16/02/2004 / ultima consulta 04/02/2025 / consultar pasta, falta rever profilaxia
Bruna dos Santos Lucas / celular: 81995956142/ data de nascimento: 15/02/1995 / ultima consulta 29/07/2025 / consultar pasta, falta rever profilaxia
Davi Andrade Batista de Souza / celular: 81991198246/ data de nascimento: 02/02/2012 / ultima consulta 18/04/2026 / ortodontia, falta rever profilaxia
Davi Lucas Ferreira dos Santos / celular: 81988135183/ data de nascimento: 10/06/2008 / ultima consulta 18/04/2025 / ortodontia, falta rever profilaxia
Danilo Williams Pyrrho de Lima / celular: 81984639938/ data de nascimento: 13/10/2003 / ultima consulta 18/04/2025 / ortodontia, falta rever profilaxia
Celson Oliveira de Freitas  / celular: 81983172225/ data de nascimento: 11/07/1981 / ultima consulta 17/04/2026 /ortodontia
Beatrix Brayner de Souza  / celular: 81983676176/ data de nascimento: 18/04/2001 / ultima consulta 30/09/2025 / ortodontia, falta rever profilaxia
Bianca Manuella S. das Chagas Silva / celular: 81997228812/ data de nascimento: 18/09/2004 / ultima consulta 30/09/2025 / ortodontia, falta rever profilaxia já fez a remoção
Williane Eloar Aroujo de Lima / celular: 81987179200/ data de nascimento: 15/08/2002 / ultima consulta 28/07/2026 / ortodontia, falta rever profilaxia já fez a remoção
Valdeclere Maria da Silva / celular: 81983637117/ data de nascimento: 20/02/1981 / ultima consulta 24/06/2023 / ortodontia, falta rever profilaxia já fez a remoção ?
Wilma Valeria da Silva / celular: 81999763892/ data de nascimento: 16/01/1995 / ultima consulta 08/05/2025 / ortodontia, falta rever profilaxia já fez a remoção ?
Walesca Cristina Barros de Oliveira / celular: 81985834481/ data de nascimento: 31/07/2005 / ultima consulta 14/05/2024' / ortodontia, falta rever profilaxia já fez a remoção ?
Mayara Tavares da Silva / celular: 819872224985/ data de nascimento: 10/12/2000 / ultima consulta 28/04/2023 / ortodontia, falta rever profilaxia já fez a remoção ?
Micael de Souza Brito / celular: 81984123491/ data de nascimento: 03/03/2009 / ultima consulta 19/03/2024 / ortodontia,rever profilaxia já fez a remoção
Marlos Luan da Silva Soares / celular: 81986916653/ data de nascimento: 15/08/1998 / ultima consulta 18/11/2025 / ortodontia, rever profilaxia já fez a remoção
Nicolle Cauane Silva da Silva / celular: 81985569901/ data de nascimento: 06/11/2014 / ultima consulta 28/07/2026 / ortodontia, falta rever profilaxia já fez a remoção ?
Paulo Vinycios B. Pereira da Silva / celular: 81999433452/ data de nascimento: 17/08/2006 / ultima consulta 17/02/2025 / ortodontia, falta rever profilaxia já fez a remoção ?
Pedro Henrique Borba de Araujo / celular: 81993301649/ data de nascimento: 23/09/2005 / ultima consulta 28/07/2026 / ortodontia, falta rever profilaxia 
Priscila Valeria Santana da Silva / celular: 81999938692/ data de nascimento: 09/04/2003 / ultima consulta 14/07/2026 / ortodontia, falta rever profilaxia já fez a remoção ?
Paulo Victor da Silva / celular: 81996853030/ data de nascimento: 01/12/1994 / ultima consulta 28/07/2026 / ortodontia, falta rever profilaxia já fez a remoção ?
Raissa Ketily de S. Silva / celular: 81995485979/ data de nascimento: 14/03/2009 / ultima consulta 29/01/2024 / ortodontia, falta rever profilaxia já fez a remoção ?
Rute Albuquerque de Souza / celular: 81996692156/ data de nascimento: 01/07/1995 / ultima consulta 04/11/2025 / ortodontia, falta rever profilaxia já fez a remoção ?
Renata Patricia da Silva / celular: 81988158689/ data de nascimento: 25/07/1989 / ultima consulta não veio  / ortodontia, falta rever profilaxia já fez a remoção
Ryvson Ivan Napoleão de Lima/ celular: 81984640401/ data de nascimento: 19/03/2008 / ultima consulta 16/09/2026 / ortodontia, falta rever profilaxia já fez a remoção ?
Stephane Maria da Silva / celular: 81987179200/ data de nascimento: 15/08/2002 / ultima consulta 28/07/2026 / ortodontia, falta rever profilaxia já fez a remoção ?
Saulo Henrique Paes Barreto da Silva / celular: 81985939985/ data de nascimento: 08/10/2004 / ultima consulta 28/07/2025 / ortodontia, falta rever profilaxia já fez a remoção ?
Stephane Wngrid da S. Gomes / celular: 81983251893/ data de nascimento: 08/01/2009 / ultima consulta 27/08/2025 / ortodontia, falta rever profilaxia já fez a remoção ?
Sergio André dos Santos Silva Filho / celular: 81994711700/ data de nascimento: 29/11/1999 / ultima consulta 28/07/2026 / ortodontia, falta rever profilaxia já fez a remoção ?
Samyra Amancio Luna de Lima / celular: 81985699383/ data de nascimento: 01/01/2003 / ultima consulta 02/06/2026 / ortodontia, falta rever profilaxia já fez a remoção ?
Stephany Vitoria da Silva Vital / celular: 81998145142/ data de nascimento: 01/03/2007 / ultima consulta 29/07/2025 / ortodontia, feita a remoção fazer a profilaxia
Thaylla Silva de Melo / celular: 81981508008/ data de nascimento: 04/08/2016 / ultima consulta 25/08/2026 / ortodontia, faltau esse mes 
Thalia Poema de A. Aguiar / celular: 81983208204/ data de nascimento: 02/08/1997 / ultima consulta 21/12/2022 / ortodontia, falta rever profilaxia já fez a remoção?
Thiago Pinto Ferreira / celular: 81986227827/ data de nascimento: 09/040/1993 / ultima consulta 28/07/2026 / ortodontia, falta rever profilaxia já fez a remoção
Vanessa Dantas Vera Crus / celular: 81983217957/ data de nascimento: 07/11/1990 / ultima consulta 16/19/2025 / ortodontia, falta rever profilaxia já fez a remoção ?
Thaiz Cristina de Oliveira / celular: 81988639534/ data de nascimento: 03/04/1986 / ultima consulta 20/01/2025 / ortodontia, falta rever profilaxia já fez a remoção ?
Thiago Ferreira da Silva / celular: 81987456467/ data de nascimento: 05/09/1990 / ultima consulta 07/07/2026 / ortodontia, falta vim ?
Luiz Cassiono Gomes Junior / celular: 81986362588/ data de nascimento: 11/01/1981 / ultima consulta 28/07/2026 / ortodontia, falta rever profilaxia já fez a remoção ? paciente sem historico
Klebson Aureliano de A e Silva / celular: 81988783985/ data de nascimento: 24/09/1983 / ultima consulta 28/07/2026 / ortodontia, falta rever profilaxia já fez a remoção ? paciente sem historico
Janaina Maria da Silva / celular: 81985248903/ data de nascimento: 02/11/1979 / ultima consulta 12/09/2023 / ortodontia, falta rever profilaxia já fez a remoção do aparelho (sim)
Larissa Vitoria de S.Souza / celular: 819988201234/ data de nascimento: 28/09/2004 / ultima consulta 22/02/2025 / ortodontia, falta rever profilaxia já fez a remoção do aparelho (sim)
Lucas Lima da Silva / celular: 819996074690/ data de nascimento: 08/08/2004 / ultima consulta 08/07/2024 / ortodontia, falta rever profilaxia já fez a remoção do aparelho (sim) 
Leilane Bezerra Santos / celular: 8197345238/ data de nascimento: 03/09/1996 / ultima consulta 26/02/2024 / ortodontia, falta rever profilaxia já fez a remoção do aparelho (sim)
Maria Vitoria Silva / celular: 81998753871/ data de nascimento: 07/02/2006 / ultima consulta 05/08/2024 / ortodontia, falta rever profilaxia já fez a remoção do aparelho (sim)
Maria Jose da Silva Mendes / celular: 81987672810/ data de nascimento: 11/12/1972 / ultima consulta não veio / sem historico 
Maria Andrea Correia de Lima / celular: 81985649090/ data de nascimento: 19/09/1986 / ultima consulta 13/08/2024 / ortodontia, falta rever profilaxia já fez a remoção do aparelho (sim)
Maria Lais Braz dos Santos / celular: 81996955746/ data de nascimento: 04/11/2001 / ultima consulta não veio / sem historico 
Marcelly Moura do Nascimento / celular: 81983411817/ data de nascimento: 23/05/2008 / ultima consulta 22/04/2025 / ortodontia, falta rever profilaxia já fez a remoção do aparelho ?
Ricassia Maria de Oliveira Farias / celular: 81985313709/ data de nascimento: 09/08/1989 / ultima consulta 15/10/2024 / mandar novamente mensagem para profilaxia
Ruth Gomes Pereira da Silva / celular: 81984395746/ data de nascimento: 24/11/2007 / ultima consulta 21/01/2025 / ortodontia, falta rever profilaxia já fez a remoção do aparelho ?
Rubens Renan Correia Monteiro / celular: 81984375927/ data de nascimento: 22/01/2002 / ultima consulta 17/12/2024 / ortodontia, falta rever profilaxia já fez a remoção do aparelho (sim)
Raphael Jonatan da  / celular: 81985649090/ data de nascimento: 19/09/1986 / ultima consulta 13/08/2024 / ortodontia, falta rever profilaxia já fez a remoção do aparelho (sim)`;

export const LISTA_INICIAL_PACIENTES = LISTA_LOTE2_PACIENTES;

interface PacienteImportado {
  nome: string;
  tel: string;
  data_nascimento: string | null;
  ultima_consulta: string | null;
  nao_veio: boolean;
  faltou: boolean;
  usa_aparelho: boolean;
  observacoes: string;
  obsRaw: string;
}

function parseDate(str: string): { iso: string | null; note: string | null; naoVeio?: boolean } {
  if (!str) return { iso: null, note: null };
  let clean = str.replace(/'/g, '').trim();
  if (/não\s*(veio|teve|tem)|sem\s*hist/i.test(clean)) return { iso: null, note: null, naoVeio: true };
  let note: string | null = null;
  if (clean.includes('/040/')) {
    note = `Data original na ficha: ${clean}`;
    clean = clean.replace('/040/', '/04/');
  }
  if (clean.includes('/111/')) {
    note = `Data original na ficha: ${clean}`;
    clean = clean.replace('/111/', '/11/');
  }
  if (clean.includes('/19/')) {
    note = `Data original na ficha: ${clean}`;
    clean = clean.replace('/19/', '/09/');
  }
  if (clean.includes('/16/')) {
    note = `Data original na ficha: ${clean}`;
    clean = clean.replace('/16/', '/06/');
  }
  const m = clean.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return { iso: null, note: `Data inválida: ${str}` };
  return { iso: `${m[3]}-${m[2]}-${m[1]}`, note };
}

export function interpretarListaPacientes(texto: string): PacienteImportado[] {
  const seen = new Set<string>();
  const resultado: PacienteImportado[] = [];

  for (const line of texto.split('\n').map((l) => l.trim()).filter(Boolean)) {
    // Ignora cabeçalhos como "NOME, CELULAR, DATA DE NASCIMENTO, ULTIMA CONSULTA"
    if (/^nome\s*,?\s*celular/i.test(line)) continue;

    // Formato 1: Nome / celular: 819... / data de nascimento: DD/MM/YYYY / ultima consulta ... / obs
    const regexBarra = /^(.+?)\s*\/\s*celular:\s*([0-9]+)\s*\/\s*data de nascimento:\s*(\d{2}\/\d{2,3}\/\d{4})\s*\/\s*ultima consulta\s*(\d{2}\/\d{2,3}\/\d{4}'?|não veio)\s*\/\s*(.+)$/i;
    const mBarra = line.match(regexBarra);

    if (mBarra) {
      const nome = mBarra[1].trim().replace(/\s+/g, ' ');
      const tel = mBarra[2].trim();
      const nascRaw = mBarra[3].trim();
      const ultRaw = mBarra[4].trim();
      const obsRaw = mBarra[5].trim();

      const key = `${nome.toLowerCase()}|${tel}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const nasc = parseDate(nascRaw);
      const ult = parseDate(ultRaw);

      const obsParts = [obsRaw];
      if (ult.naoVeio) obsParts.push('Última consulta: não veio');
      if (nasc.note) obsParts.push(nasc.note);
      if (ult.note) obsParts.push(ult.note);
      const observacoes = obsParts.join(' | ');

      const textoLower = obsRaw.toLowerCase();
      const jaRemoveuConfirmado =
        textoLower.includes('(sim)') ||
        textoLower.includes('feita a remoção') ||
        (textoLower.includes('já fez a remoção') && !textoLower.includes('?'));
      const usaAparelho = textoLower.includes('ortodontia') && !jaRemoveuConfirmado;
      const faltouNaUltima = textoLower.includes('faltau') || textoLower.includes('faltou') || !!ult.naoVeio;

      resultado.push({
        nome,
        tel,
        data_nascimento: nasc.iso,
        ultima_consulta: ult.iso,
        nao_veio: !!ult.naoVeio,
        faltou: faltouNaUltima,
        usa_aparelho: usaAparelho,
        observacoes,
        obsRaw: textoLower,
      });
      continue;
    }

    // Formato 2 (Lote 2): Nome [Telefones opcionais] DD/MM/YYYY [ULTIMA CONSULTA [DD/MM/YYYY | NÃO TEVE | não tem]]
    const regexLivre = /^([A-Za-zÀ-ÿ\s.]+?)\s+(?:([0-9\s]{8,25})\s+)?(\d{2}\/\d{2,3}\/\d{4})(?:\s+ULTIMA\s+CONSUL?T?L?TA\s+(.+))?$/i;
    const mLivre = line.match(regexLivre);
    if (mLivre) {
      const nome = mLivre[1].trim().replace(/\s+/g, ' ');
      const telsRaw = (mLivre[2] || '').trim().split(/\s+/).filter(Boolean);
      const tel = telsRaw[0] || '';
      const telSecundario = telsRaw.slice(1).join(', ');
      const nascRaw = mLivre[3].trim();
      const ultRaw = (mLivre[4] || '').trim();

      const key = `${nome.toLowerCase()}|${tel}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const nasc = parseDate(nascRaw);
      const ult = ultRaw ? parseDate(ultRaw) : { iso: null, note: null, naoVeio: true };

      const obsParts: string[] = [];
      if (!tel) obsParts.push('Sem telefone na ficha');
      if (telSecundario) obsParts.push(`Tel secundário: ${telSecundario}`);
      if (!ultRaw) obsParts.push('Sem registro de última consulta (sem historico)');
      else if (ult.naoVeio) obsParts.push(`Última consulta: ${ultRaw} (sem historico)`);
      if (nasc.note) obsParts.push(nasc.note);
      if (ult.note) obsParts.push(ult.note);

      const observacoes = obsParts.join(' | ');
      const obsLower = observacoes.toLowerCase();

      resultado.push({
        nome,
        tel,
        data_nascimento: nasc.iso,
        ultima_consulta: ult.iso,
        nao_veio: !!ult.naoVeio,
        faltou: false,
        usa_aparelho: false,
        observacoes,
        obsRaw: obsLower,
      });
    }
  }

  return resultado;
}

export function ImportarPacientesModal({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [texto, setTexto] = useState(LISTA_LOTE2_PACIENTES);
  const [salvando, setSalvando] = useState(false);
  const [progresso, setProgresso] = useState('');

  const itens = useMemo(() => interpretarListaPacientes(texto), [texto]);

  async function importarTodos() {
    if (!itens.length || salvando) return;
    setSalvando(true);
    setProgresso('Criando etiquetas clínicas...');

    try {
      // 1. Garante etiquetas clínicas no banco
      const defsEtiquetas = [
        { chave: 'orto', nome: 'Ortodontia', cor: '#5B3FC4', icone: '🦷', tipo: 'paciente' },
        { chave: 'prof', nome: 'Rever Profilaxia', cor: '#2B8FD6', icone: '✨', tipo: 'paciente' },
        { chave: 'remocao', nome: 'Aparelho Removido', cor: '#3BA776', icone: '✅', tipo: 'paciente' },
        { chave: 'duvida', nome: 'Confirmar Remoção?', cor: '#D4A017', icone: '❓', tipo: 'paciente' },
        { chave: 'pasta', nome: 'Consultar Pasta', cor: '#E08A1E', icone: '📁', tipo: 'paciente' },
        { chave: 'sem_hist', nome: 'Sem Histórico', cor: '#C43D3D', icone: '⚠️', tipo: 'paciente' },
      ];

      const mapaTags: Record<string, string> = {};
      for (const d of defsEtiquetas) {
        const { data: ex } = await supabase
          .from('etiquetas')
          .select('id')
          .eq('nome', d.nome)
          .eq('tipo', 'paciente')
          .maybeSingle();
        if (ex?.id) {
          mapaTags[d.chave] = ex.id;
        } else {
          const { data: nova } = await supabase
            .from('etiquetas')
            .insert({ nome: d.nome, cor: d.cor, icone: d.icone, tipo: 'paciente' })
            .select('id')
            .single();
          if (nova?.id) mapaTags[d.chave] = nova.id;
        }
      }

      const procOrto = s.procedimentos.find((p) => p.eh_manutencao_aparelho)?.id ?? null;
      const procProf = s.procedimentos.find((p) => p.nome.toLowerCase().includes('limpeza') || p.nome.toLowerCase().includes('profilaxia'))?.id ?? null;

      let importados = 0;
      for (const p of itens) {
        importados++;
        setProgresso(`Importando ${importados} de ${itens.length}: ${p.nome}...`);

        const { data: existente } = await supabase
          .from('pacientes')
          .select('id')
          .ilike('nome', p.nome)
          .limit(1)
          .maybeSingle();

        let pacId = existente?.id;
        if (!pacId) {
          const { data: criado, error } = await supabase
            .from('pacientes')
            .insert({
              nome: p.nome,
              telefone_whatsapp: p.tel || null,
              data_nascimento: p.data_nascimento,
              usa_aparelho: p.usa_aparelho,
              intervalo_manutencao_dias: 30,
              aceita_whatsapp: Boolean(p.tel),
              observacoes: p.observacoes || null,
            })
            .select('id')
            .single();
          if (error) continue;
          pacId = criado?.id;
        } else {
          await supabase
            .from('pacientes')
            .update({
              telefone_whatsapp: p.tel || undefined,
              data_nascimento: p.data_nascimento || undefined,
              usa_aparelho: p.usa_aparelho,
              observacoes: p.observacoes || undefined,
            })
            .eq('id', pacId);
        }

        if (!pacId) continue;

        // Vincula etiquetas
        const tagsParaVincular: string[] = [];
        if (p.obsRaw.includes('ortodontia') && mapaTags.orto) tagsParaVincular.push(mapaTags.orto);
        if (p.obsRaw.includes('profilaxia') && mapaTags.prof) tagsParaVincular.push(mapaTags.prof);
        if (
          (p.obsRaw.includes('(sim)') || p.obsRaw.includes('feita a remoção') || (p.obsRaw.includes('remoção') && !p.obsRaw.includes('?'))) &&
          mapaTags.remocao
        ) {
          tagsParaVincular.push(mapaTags.remocao);
        }
        if (p.obsRaw.includes('remoção') && p.obsRaw.includes('?') && mapaTags.duvida) {
          tagsParaVincular.push(mapaTags.duvida);
        }
        if (p.obsRaw.includes('consultar pasta') && mapaTags.pasta) tagsParaVincular.push(mapaTags.pasta);
        if (p.obsRaw.includes('sem historico') && mapaTags.sem_hist) tagsParaVincular.push(mapaTags.sem_hist);

        if (tagsParaVincular.length > 0) {
          await supabase.from('paciente_etiquetas').upsert(
            tagsParaVincular.map((etiqueta_id) => ({ paciente_id: pacId, etiqueta_id })),
            { onConflict: 'paciente_id,etiqueta_id' }
          );
        }

        // Registra última consulta para alimentar o histórico e alertas de falta/atraso
        const procId = p.obsRaw.includes('ortodontia') ? procOrto : procProf;
        if (p.ultima_consulta) {
          const { data: jaTem } = await supabase
            .from('consultas')
            .select('id')
            .eq('paciente_id', pacId)
            .eq('data', p.ultima_consulta)
            .limit(1)
            .maybeSingle();
          if (!jaTem) {
            await supabase.from('consultas').insert({
              paciente_id: pacId,
              data: p.ultima_consulta,
              hora_inicio: '09:00',
              duracao_minutos: 30,
              procedimento_id: procId,
              status: p.faltou ? 'faltou' : 'atendido',
              observacoes: p.observacoes || null,
            });
          }
        }
      }

      await s.recarregar();
      s.bump();
      s.toast(`${itens.length} pacientes e históricos importados com sucesso!`, 'ok');
      onClose();
    } catch (e: any) {
      s.toast(`Erro ao importar: ${e?.message || e}`, 'erro');
    } finally {
      setSalvando(false);
      setProgresso('');
    }
  }

  return (
    <Modal
      titulo="📥 Importar Lista de Pacientes"
      subtitulo="Cole uma nova lista abaixo ou escolha um dos lotes salvos."
      onClose={onClose}
      largura={720}
      rodape={
        <>
          <button type="button" className="btn ghost" onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={importarTodos} disabled={salvando || itens.length === 0}>
            {salvando ? progresso || 'Importando…' : `Importar ${itens.length} pacientes agora`}
          </button>
        </>
      }
    >
      <div className="chips" style={{ marginBottom: 4 }}>
        <button
          type="button"
          className={texto === '' ? 'chip on' : 'chip'}
          onClick={() => setTexto('')}
        >
          ➕ Colar nova lista
        </button>
        <button
          type="button"
          className={texto === LISTA_LOTE2_PACIENTES ? 'chip on' : 'chip'}
          onClick={() => setTexto(LISTA_LOTE2_PACIENTES)}
        >
          🆕 Lote 2 (49 novos)
        </button>
        <button
          type="button"
          className={texto === LISTA_LOTE1_PACIENTES ? 'chip on' : 'chip'}
          onClick={() => setTexto(LISTA_LOTE1_PACIENTES)}
        >
          📋 Lote 1 (65 anteriores)
        </button>
        <button
          type="button"
          className={texto.includes('Micheles Maria') && texto.includes('Lais Milena') ? 'chip on' : 'chip'}
          onClick={() => setTexto(`${LISTA_LOTE2_PACIENTES}\n${LISTA_LOTE1_PACIENTES}`)}
        >
          📚 Todos juntos (114)
        </button>
      </div>

      <div className="field">
        <span>Aceita tanto o formato com barras (<code>/</code>) quanto o formato livre (<code>Nome Celular Data ULTIMA CONSULTA Data</code>)</span>
        <textarea
          rows={10}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={salvando}
          style={{ fontFamily: 'monospace', fontSize: 12 }}
        />
      </div>
      <div className="card" style={{ padding: 12, marginTop: 12, background: 'var(--surface-alt)' }}>
        <b>Resumo identificado automaticamente:</b>
        <ul style={{ margin: '8px 0 0 18px', fontSize: 13, lineHeight: 1.6 }}>
          <li><b>{itens.length}</b> pacientes únicos prontos para importar.</li>
          <li><b>{itens.filter((x) => x.ultima_consulta).length}</b> pacientes com data de última consulta registrada no histórico.</li>
          <li><b>{itens.filter((x) => x.obsRaw.includes('sem historico')).length}</b> pacientes marcados com etiqueta <b>⚠️ Sem Histórico</b> (não teve / não tem).</li>
          {itens.some((x) => x.usa_aparelho) && (
            <li><b>{itens.filter((x) => x.usa_aparelho).length}</b> pacientes com aparelho ortodôntico ativo (🦷).</li>
          )}
        </ul>
      </div>
    </Modal>
  );
}
