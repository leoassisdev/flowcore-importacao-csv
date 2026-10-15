// csv-importacao.ts · Criado por FlowCore Soluções LTDA · flowcoresolucoes.com.br/codigos · licença MIT
// Importação de planilha CSV (exportada do Excel, ERP ou CRM) com
// validação linha a linha: parser RFC 4180 (aspas, quebra de linha dentro do
// campo, CRLF, BOM), detecta ";" ou "," sozinho, mapeia colunas pelo nome
// (sem ligar pra acento/maiúscula) e valida número BR "1.234,56", data
// dd/mm/aaaa, e-mail, CPF/CNPJ. Devolve { validas, erros: [{linha, coluna, mensagem}] }
// pronto pra mostrar ao usuário.
// Roda em Node 18+, Cloudflare Workers, Deno, Bun e no navegador.
// Zero dependências.
//
// Referência: RFC 4180 (Common Format and MIME Type for CSV Files).

export const CRIADO_POR = "Criado por FlowCore Soluções LTDA";

export type RegistroCsv = { linha: number; campos: string[] };

/** Detecta o delimitador pela primeira linha (fora de aspas): ";", "," ou tab. */
export function detectarDelimitador(texto: string): string {
  const contagem: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let dentro = false;
  for (const c of texto.replace(/^\uFEFF/, "")) {
    if (c === '"') dentro = !dentro;
    else if (!dentro && (c === "\n" || c === "\r")) break;
    else if (!dentro && c in contagem) contagem[c]++;
  }
  const [melhor] = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
  return melhor[1] > 0 ? melhor[0] : ",";
}

/** Parser RFC 4180. Cada registro informa a linha física onde começa (1-based). */
export function parseCsv(texto: string, opcoes: { delimitador?: string } = {}): RegistroCsv[] {
  const s = texto.replace(/^\uFEFF/, "");
  const d = opcoes.delimitador ?? detectarDelimitador(s);
  if (d.length !== 1 || d === '"' || d === "\n" || d === "\r") throw new Error("Delimitador inválido");

  const registros: RegistroCsv[] = [];
  let campos: string[] = [];
  let campo = "";
  let linhaAtual = 1;
  let inicioRegistro = 1;
  let entreAspas = false;
  let campoComAspas = false;
  let linhaAspas = 0;

  const fecharCampo = () => {
    campos.push(campo);
    campo = "";
    campoComAspas = false;
  };
  const fecharRegistro = () => {
    fecharCampo();
    if (!(campos.length === 1 && campos[0] === "")) registros.push({ linha: inicioRegistro, campos });
    campos = [];
  };

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (entreAspas) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          campo += '"';
          i++;
        } else entreAspas = false;
      } else {
        if (c === "\n") linhaAtual++;
        else if (c === "\r" && s[i + 1] !== "\n") linhaAtual++;
        campo += c;
      }
      continue;
    }
    if (c === '"' && campo === "" && !campoComAspas) {
      entreAspas = true;
      campoComAspas = true;
      linhaAspas = linhaAtual;
    } else if (c === d) {
      fecharCampo();
    } else if (c === "\r" || c === "\n") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      fecharRegistro();
      linhaAtual++;
      inicioRegistro = linhaAtual;
    } else {
      campo += c;
    }
  }
  if (entreAspas) throw new Error(`Aspas não fechadas a partir da linha ${linhaAspas}`);
  if (campo !== "" || campos.length > 0 || campoComAspas) fecharRegistro();
  return registros;
}

// ---------- validação ----------

export type TipoCampo = "texto" | "numero" | "inteiro" | "data" | "email" | "cpf" | "cnpj" | "cpfCnpj" | "booleano";

export type RegraCampo = {
  tipo: TipoCampo;
  /** Nome da coluna no CSV (padrão: a chave do schema). Comparação ignora acento, caixa e espaços. */
  coluna?: string;
  obrigatorio?: boolean;
  /** Mínimo/máximo: valor (número) ou tamanho (texto). */
  min?: number;
  max?: number;
  /** Lista de valores aceitos (comparação sem diferenciar maiúsculas). */
  valores?: string[];
};

export type Schema = Record<string, RegraCampo>;

export type ErroLinha = { linha: number; coluna: string; mensagem: string };

export type ResultadoImportacao<T = Record<string, unknown>> = {
  validas: Array<T & { _linha: number }>;
  erros: ErroLinha[];
  totalLinhas: number;
};

const normalizarNome = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Número brasileiro: "1.234,56", "-10,5", "R$ 99,90", "1234.56" (sem milhar). */
export function lerNumeroBR(valor: string): number | null {
  const s = valor.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  return null;
}

/** "dd/mm/aaaa" (ou ISO "aaaa-mm-dd") → "aaaa-mm-dd", conferindo se a data existe. */
export function lerDataBR(valor: string): string | null {
  const s = valor.trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  let dia: number, mes: number, ano: number;
  if (m) [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function cpfOk(v: string): boolean {
  const d = v.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    return ((s * 10) % 11) % 10;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

function cnpjOk(v: string): boolean {
  const c = v.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (b: string) => {
    let s = 0;
    let p = 2;
    for (let i = b.length - 1; i >= 0; i--) {
      s += (b.charCodeAt(i) - 48) * p;
      p = p === 9 ? 2 : p + 1;
    }
    return s % 11 < 2 ? 0 : 11 - (s % 11);
  };
  const d1 = dv(c.slice(0, 12));
  return `${d1}${dv(c.slice(0, 12) + d1)}` === c.slice(12);
}

function converter(bruto: string, r: RegraCampo): { ok: true; valor: unknown } | { ok: false; mensagem: string } {
  const v = bruto.trim();
  const faixa = (n: number, rotulo: string) => {
    if (r.min !== undefined && n < r.min) return `${rotulo} mínimo é ${r.min}`;
    if (r.max !== undefined && n > r.max) return `${rotulo} máximo é ${r.max}`;
    return null;
  };
  switch (r.tipo) {
    case "texto": {
      const e = faixa(v.length, "Tamanho");
      if (e) return { ok: false, mensagem: e };
      if (r.valores && !r.valores.some((x) => x.toLowerCase() === v.toLowerCase()))
        return { ok: false, mensagem: `Valor "${v}" não permitido. Use: ${r.valores.join(", ")}` };
      return { ok: true, valor: v };
    }
    case "numero":
    case "inteiro": {
      const n = lerNumeroBR(v);
      if (n === null) return { ok: false, mensagem: `"${v}" não é um número válido (use 1.234,56)` };
      if (r.tipo === "inteiro" && !Number.isInteger(n)) return { ok: false, mensagem: `"${v}" precisa ser inteiro` };
      const e = faixa(n, "Valor");
      return e ? { ok: false, mensagem: e } : { ok: true, valor: n };
    }
    case "data": {
      const d = lerDataBR(v);
      return d ? { ok: true, valor: d } : { ok: false, mensagem: `"${v}" não é uma data válida (use dd/mm/aaaa)` };
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
        ? { ok: true, valor: v.toLowerCase() }
        : { ok: false, mensagem: `"${v}" não é um e-mail válido` };
    case "cpf":
      return cpfOk(v) ? { ok: true, valor: v.replace(/\D/g, "") } : { ok: false, mensagem: "CPF inválido" };
    case "cnpj":
      return cnpjOk(v) ? { ok: true, valor: v.toUpperCase().replace(/[^0-9A-Z]/g, "") } : { ok: false, mensagem: "CNPJ inválido" };
    case "cpfCnpj":
      if (cpfOk(v)) return { ok: true, valor: v.replace(/\D/g, "") };
      if (cnpjOk(v)) return { ok: true, valor: v.toUpperCase().replace(/[^0-9A-Z]/g, "") };
      return { ok: false, mensagem: "CPF/CNPJ inválido" };
    case "booleano": {
      const b = normalizarNome(v);
      if (["sim", "s", "true", "1", "x", "yes"].includes(b)) return { ok: true, valor: true };
      if (["nao", "n", "false", "0", "no"].includes(b)) return { ok: true, valor: false };
      return { ok: false, mensagem: `"${v}" não é sim/não` };
    }
  }
}

/**
 * Lê o CSV (primeira linha = cabeçalho) e valida cada linha contra o schema.
 * Linhas com qualquer erro vão pra `erros` e ficam fora de `validas`.
 */
export function importarCsv<T = Record<string, unknown>>(
  texto: string,
  schema: Schema,
  opcoes: { delimitador?: string; maxLinhas?: number } = {},
): ResultadoImportacao<T> {
  const registros = parseCsv(texto, opcoes);
  const erros: ErroLinha[] = [];
  if (registros.length === 0) return { validas: [], erros: [{ linha: 1, coluna: "", mensagem: "Arquivo vazio" }], totalLinhas: 0 };

  const [cab, ...linhas] = registros;
  const max = opcoes.maxLinhas ?? 50_000;
  if (linhas.length > max) throw new Error(`Arquivo tem ${linhas.length} linhas; o máximo é ${max}`);

  const indice = new Map(cab.campos.map((n, i) => [normalizarNome(n), i]));
  const mapa: Array<[string, RegraCampo, number, string]> = [];
  for (const [chave, regra] of Object.entries(schema)) {
    const nomeColuna = regra.coluna ?? chave;
    const i = indice.get(normalizarNome(nomeColuna));
    if (i === undefined) {
      if (regra.obrigatorio) erros.push({ linha: cab.linha, coluna: nomeColuna, mensagem: `Coluna obrigatória "${nomeColuna}" não encontrada` });
      continue;
    }
    mapa.push([chave, regra, i, nomeColuna]);
  }
  if (erros.length) return { validas: [], erros, totalLinhas: linhas.length };

  const validas: Array<T & { _linha: number }> = [];
  for (const reg of linhas) {
    const obj: Record<string, unknown> = { _linha: reg.linha };
    let ok = true;
    for (const [chave, regra, i, nomeColuna] of mapa) {
      const bruto = reg.campos[i] ?? "";
      if (bruto.trim() === "") {
        if (regra.obrigatorio) {
          erros.push({ linha: reg.linha, coluna: nomeColuna, mensagem: "Campo obrigatório vazio" });
          ok = false;
        } else obj[chave] = null;
        continue;
      }
      const r = converter(bruto, regra);
      if ("valor" in r) obj[chave] = r.valor;
      else {
        erros.push({ linha: reg.linha, coluna: nomeColuna, mensagem: r.mensagem });
        ok = false;
      }
    }
    if (ok) validas.push(obj as T & { _linha: number });
  }
  return { validas, erros, totalLinhas: linhas.length };
}
