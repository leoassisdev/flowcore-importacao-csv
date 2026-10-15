// csv-importacao.test.ts · Criado por FlowCore Soluções LTDA · flowcoresolucoes.com.br/codigos · licença MIT
import { describe, expect, it } from "vitest";
import { detectarDelimitador, importarCsv, lerDataBR, lerNumeroBR, parseCsv, type Schema } from "./csv-importacao";

const SCHEMA: Schema = {
  nome: { tipo: "texto", obrigatorio: true, max: 60 },
  email: { tipo: "email", coluna: "E-mail", obrigatorio: true },
  documento: { tipo: "cpfCnpj", coluna: "CPF/CNPJ" },
  valor: { tipo: "numero", min: 0 },
  vencimento: { tipo: "data", coluna: "Vencimento" },
  ativo: { tipo: "booleano" },
};

describe("csv-importacao", () => {
  it("detecta ; e , e ignora delimitador dentro de aspas", () => {
    expect(detectarDelimitador("nome;email;valor\n")).toBe(";");
    expect(detectarDelimitador('"a;b;c",d,e\n')).toBe(",");
    expect(detectarDelimitador("a\tb\tc")).toBe("\t");
    expect(detectarDelimitador("sozinho")).toBe(",");
  });

  it("parser RFC 4180: aspas, aspas escapadas, quebra de linha no campo, CRLF e BOM", () => {
    const csv = '\uFEFFnome,obs\r\n"Silva, Ana","disse ""oi""\r\nna call"\r\nBruno,\r\n';
    expect(parseCsv(csv)).toEqual([
      { linha: 1, campos: ["nome", "obs"] },
      { linha: 2, campos: ["Silva, Ana", 'disse "oi"\r\nna call'] },
      { linha: 4, campos: ["Bruno", ""] },
    ]);
  });

  it("ignora linhas em branco e acusa aspas sem fechar", () => {
    expect(parseCsv("a;b\n\n1;2\n\n")).toEqual([
      { linha: 1, campos: ["a", "b"] },
      { linha: 3, campos: ["1", "2"] },
    ]);
    expect(() => parseCsv('a,b\n"aberto,1\n2,3')).toThrow("Aspas não fechadas a partir da linha 2");
  });

  it("lê número BR e data dd/mm/aaaa", () => {
    expect(lerNumeroBR("1.234,56")).toBe(1234.56);
    expect(lerNumeroBR("R$ 99,90")).toBe(99.9);
    expect(lerNumeroBR("-10,5")).toBe(-10.5);
    expect(lerNumeroBR("1.234")).toBe(1234);
    expect(lerNumeroBR("1234.56")).toBe(1234.56);
    expect(lerNumeroBR("12,34,5")).toBeNull();
    expect(lerDataBR("5/3/2026")).toBe("2026-03-05");
    expect(lerDataBR("2026-10-15")).toBe("2026-10-15");
    expect(lerDataBR("31/02/2026")).toBeNull();
  });

  it("importa planilha do Excel (;) com colunas acentuadas e fora de ordem", () => {
    const csv = [
      "Vencimento;NOME;e-mail;CPF/CNPJ;Valor;Ativo",
      "15/10/2026;Ana Souza;ANA@EMPRESA.COM.BR;529.982.247-25;1.234,56;sim",
      '20/11/2026;"Metalúrgica Alfa; Filial";compras@alfa.ind.br;11.222.333/0001-81;0,00;não',
    ].join("\r\n");
    const r = importarCsv(csv, SCHEMA);
    expect(r.erros).toEqual([]);
    expect(r.totalLinhas).toBe(2);
    expect(r.validas).toEqual([
      { _linha: 2, nome: "Ana Souza", email: "ana@empresa.com.br", documento: "52998224725", valor: 1234.56, vencimento: "2026-10-15", ativo: true },
      { _linha: 3, nome: "Metalúrgica Alfa; Filial", email: "compras@alfa.ind.br", documento: "11222333000181", valor: 0, vencimento: "2026-11-20", ativo: false },
    ]);
  });

  it("reporta erros por linha e coluna e mantém as linhas boas", () => {
    const csv = [
      "nome,e-mail,cpf/cnpj,valor,vencimento,ativo",
      "Ana,ana@x.com,529.982.247-25,10,01/01/2026,sim",
      ",bruno@x,111.111.111-11,-5,30/02/2026,talvez",
      "Carla,carla@x.com,,,,",
    ].join("\n");
    const r = importarCsv(csv, SCHEMA);
    expect(r.validas.map((v) => v._linha)).toEqual([2, 4]);
    expect(r.validas[1]).toMatchObject({ nome: "Carla", documento: null, valor: null });
    expect(r.erros).toEqual([
      { linha: 3, coluna: "nome", mensagem: "Campo obrigatório vazio" },
      { linha: 3, coluna: "E-mail", mensagem: '"bruno@x" não é um e-mail válido' },
      { linha: 3, coluna: "CPF/CNPJ", mensagem: "CPF/CNPJ inválido" },
      { linha: 3, coluna: "valor", mensagem: "Valor mínimo é 0" },
      { linha: 3, coluna: "Vencimento", mensagem: '"30/02/2026" não é uma data válida (use dd/mm/aaaa)' },
      { linha: 3, coluna: "ativo", mensagem: '"talvez" não é sim/não' },
    ]);
  });

  it("acusa coluna obrigatória ausente no cabeçalho", () => {
    const r = importarCsv("nome,telefone\nAna,1199", SCHEMA);
    expect(r.validas).toEqual([]);
    expect(r.erros).toEqual([{ linha: 1, coluna: "E-mail", mensagem: 'Coluna obrigatória "E-mail" não encontrada' }]);
  });

  it("valida inteiro, lista de valores, CNPJ alfanumérico e limites", () => {
    const schema: Schema = {
      qtd: { tipo: "inteiro", max: 100 },
      uf: { tipo: "texto", valores: ["SP", "RJ"] },
      cnpj: { tipo: "cnpj" },
    };
    const r = importarCsv("qtd;uf;cnpj\n10;sp;12.ABC.345/01DE-35\n2,5;MG;12ABC34501DE36\n", schema, { delimitador: ";" });
    expect(r.validas).toEqual([{ _linha: 2, qtd: 10, uf: "sp", cnpj: "12ABC34501DE35" }]);
    expect(r.erros.map((e) => e.coluna)).toEqual(["qtd", "uf", "cnpj"]);
    expect(importarCsv("", schema).erros[0].mensagem).toBe("Arquivo vazio");
    expect(() => importarCsv("qtd\n1\n2\n3", schema, { maxLinhas: 2 })).toThrow("máximo é 2");
  });
});
