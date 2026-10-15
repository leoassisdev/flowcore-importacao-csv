# Importação de CSV

> Lê planilha CSV do Excel ou ERP (aspas, ; ou ,, BOM, CRLF) e valida cada linha com schema simples: número BR, data, e-mail, CPF e CNPJ. Mostra ao usuário a linha e a coluna exata de cada erro.

**Ver ao vivo, com preview e manual:** https://flowcoresolucoes.com.br/codigos/importacao-csv

Criado por **FlowCore Soluções LTDA**.

## Arquivos

- [`src/csv-importacao.ts`](src/csv-importacao.ts)
- [`src/csv-importacao.test.ts`](src/csv-importacao.test.ts)

## Como instalar

1. **Funciona onde você já roda** Node 18+, Cloudflare Workers, Deno, Bun, Vercel e Netlify Functions. Zero dependência: só fetch e Web Crypto, que já vêm no runtime.
2. **Crie src/lib/csv-importacao.ts** Copie o conteúdo de `src/csv-importacao.ts` e `src/csv-importacao.test.ts` deste repositório.
3. **Use**

   ```bash
   const { validas, erros } = importarCsv(textoDoArquivo, {
     nome: { tipo: "texto", obrigatorio: true },
     email: { tipo: "email", coluna: "E-mail", obrigatorio: true },
     valor: { tipo: "numero", min: 0 },
   });
   if (erros.length) return Response.json({ erros }, { status: 422 });
   ```

4. **Rode o teste junto** O arquivo de teste (`src/csv-importacao.test.ts`) cobre 8 cenários. Copie para src/lib/ ao lado e rode:

   ```bash
   npm install -D vitest
   npx vitest run src/lib
   ```


## Testes

`src/csv-importacao.test.ts` cobre 8 cenários.

```bash
npm install
npm test
```

## Licença

MIT. Pode usar em projeto pessoal ou comercial, de graça. A única condição é manter a linha **“Criado por FlowCore Soluções LTDA”** (ou o crédito de adaptação) onde ela está.

---

Precisa disso integrado no seu sistema? A [FlowCore](https://flowcoresolucoes.com.br) desenvolve sob medida.
