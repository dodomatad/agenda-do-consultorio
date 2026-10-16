/**
 * Helper unificado para geração e exportação de CSV compatível com Excel brasileiro.
 * - Delimitador ponto-e-vírgula (;)
 * - UTF-8 com BOM (\uFEFF)
 * - Escape de aspas duplas, quebras de linha
 * - Sanitização contra CSV Injection (prefixo ') restrita a campos de texto livre
 * - Valores numéricos (mesmo negativos como -150,00) e telefones permanecem inalterados
 */

export type TipoColunaCsv = 'texto' | 'numero' | 'telefone' | 'data';

export interface ColunaConfig {
  label: string;
  tipo?: TipoColunaCsv;
}

export function escaparCampoCsv(valor: unknown, tipo: TipoColunaCsv = 'texto'): string {
  if (valor === null || valor === undefined) return '';
  let str = String(valor).trim();

  // Verifica se é número ou telefone
  const ehNumero = tipo === 'numero' || typeof valor === 'number' || /^-?\d+([.,]\d+)?$/.test(str);
  const ehTelefone = tipo === 'telefone' || (tipo !== 'texto' && /^\+?[\d\s().-]+$/.test(str));

  // Proteção contra CSV Injection APENAS para colunas de texto livre
  if (!ehNumero && !ehTelefone && tipo === 'texto') {
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
  }

  // Se contiver ponto-e-vírgula, aspas, quebra de linha ou começou com apóstrofo de proteção
  if (str.includes(';') || str.includes('"') || str.includes('\n') || str.includes('\r') || str.startsWith("'")) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export function baixarCsv(
  nomeArquivo: string,
  cabecalho: (string | ColunaConfig)[],
  linhas: (string | number | null | undefined)[][]
): void {
  const configs: ColunaConfig[] = cabecalho.map((col) =>
    typeof col === 'string' ? { label: col, tipo: 'texto' } : col
  );

  const cabecalhoEscapado = configs.map((c) => escaparCampoCsv(c.label, 'texto')).join(';');
  const linhasEscapadas = linhas.map((linha) =>
    linha.map((valor, idx) => escaparCampoCsv(valor, configs[idx]?.tipo ?? 'texto')).join(';')
  );
  const conteudo = '\uFEFF' + [cabecalhoEscapado, ...linhasEscapadas].join('\r\n');

  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo.endsWith('.csv') ? nomeArquivo : `${nomeArquivo}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Exemplos de validação de sanitização:
 * - "=SOMA(A1)" -> "'=SOMA(A1)'" (protegido contra CSV injection)
 * - "-150,00" -> "-150,00" (preservado como número, mesmo negativo)
 * - "+55 11 99999-9999" -> "+55 11 99999-9999" (preservado como telefone)
 */
export function validarSanitizacaoCsv() {
  return {
    formulaTexto: escaparCampoCsv('=SOMA(A1)', 'texto'), // retorna "\"'=SOMA(A1)'\""
    numeroNegativo: escaparCampoCsv('-150,00', 'numero'), // retorna "-150,00"
    numeroNegativoAuto: escaparCampoCsv('-150,00'), // retorna "-150,00"
    telefone: escaparCampoCsv('+55 11 99999-9999', 'telefone'), // retorna "+55 11 99999-9999"
  };
}
