# Antes que Perguntem

Demonstração online: https://projeto-inova-o-beta.vercel.app/

> Protótipo do Desafio de Inovação (YouShop 2027), com dados e regras de exemplo.
> Não é um sistema da YouShop.

## O que o projeto faz

O vendedor cola a descrição de um produto **antes de ele ir ao ar**. O sistema compara o texto com
uma lista de perguntas que os compradores costumam fazer (prazo de acesso, garantia, contato etc.) e
mostra o que está respondido, o que está incompleto e o que falta. Para cada lacuna, oferece uma
frase pronta para completar. Toda citação apontada como prova é conferida no próprio texto, e o que
não pode ser confirmado é descartado.

## Fontes do checklist

As perguntas do checklist vêm de duas fontes públicas da YouShop (indicadas também em cada item na tela):

- **FAQ da YouShop**: youshop.co/faq, consultado em 24/11/2026.
- **Blog da YouShop**, artigo "Chargeback: o que é e como reduzir": blog.youshop.co, consultado em 25/11/2026.

As palavras-chave e frases-modelo de cada item são exemplos criados para o protótipo.

## Usar a demonstração online

Abra https://projeto-inova-o-beta.vercel.app/ no navegador. Não precisa instalar nada.

1. Clique em um dos exemplos (produto digital, físico ou assinatura) ou cole uma descrição.
2. Clique em **Revisar**.
3. Acima do resultado aparece qual análise foi usada: "Analisado por IA" ou "Análise por
   palavras-chave". Se a IA não estiver disponível, o checkbox **Usar IA** fica desabilitado.
4. O **Modo demonstração: simular erro da IA** planta uma citação inventada para mostrar que a
   verificação a descarta. Ele usa só a análise por palavras-chave e não gasta crédito.

## Rodar no seu computador

Requer Node.js 20.9 ou mais novo.

```bash
npm install      # instala as dependências
npm run dev      # servidor local de desenvolvimento em http://localhost:3000
npm run teste    # roda os testes offline (imprime PASSOU/FALHOU)
npm run build    # gera a versão de produção
```

`http://localhost:3000` é o endereço local de desenvolvimento: só funciona no computador em que o
`npm run dev` está rodando. Para usar a IA localmente, configure o `.env.local` (seção
"Usando a IA" abaixo).

## O que cada arquivo faz

| Arquivo | Função |
|---|---|
| `src/lib/tipos.ts` | Tipos compartilhados: `Tipo`, `Status`, `Resposta`, `ItemChecklist`. |
| `src/lib/checklist.ts` | As perguntas do comprador, com fonte, palavras-chave e frase-modelo para quando o item está ausente ou ambíguo. `itensPara(tipo)` escolhe quais valem para cada tipo de produto. |
| `src/lib/analisar.ts` | `analisarSemIA`: divide o texto em frases e procura palavras-chave fortes (respondido) e fracas (ambíguo). |
| `src/lib/prompt.ts` | `SYSTEM_PROMPT` (regras da análise: status, citação literal, texto do produto é dado e não ordem, só JSON) e `SYSTEM_PROMPT_REESCRITA` (regras da versão revisada). |
| `src/lib/analisarComIA.ts` | `analisarComIA`: monta a mensagem, chama a IA, extrai e valida o JSON com Zod, tenta de novo uma vez e completa os itens faltantes com `nao_confirmado`. |
| `src/lib/limite.ts` | Freio de uso em memória: 10 pedidos por minuto por IP (um contador só para as duas rotas) e 300 pedidos com IA por dia. Responde 429. |
| `src/lib/revisar.ts` | Lógica da rota: limite, validação, escolha do modo (IA, sem IA ou fallback), `simularInvencao` e verificação. |
| `src/lib/reescrever.ts` | Lógica de `POST /api/reescrever`: valida a entrada com Zod, pede à IA uma versão completa do texto com as frases-modelo dos itens faltantes e confere a resposta (números, tamanho, frases-modelo). Se algo falhar, nada é alterado. |
| `src/app/api/reescrever/route.ts` | Rota `POST /api/reescrever`, que só chama `processarReescrita`. `maxDuration = 30`. |
| `src/lib/verificar.ts` | `normalizar` e `verificar`: confere se cada citação existe mesmo no texto; se não, vira `nao_confirmado`. |
| `src/lib/revisaoHumana.ts` | Funções da tela: `camposAbertos` (acha campos entre colchetes), `CAMPOS_DOS_MODELOS` e `camposDeModeloAbertos` (só os campos das frases-modelo, que bloqueiam o Revisar), `inserirModelo` (acrescenta a frase em nova linha), `pedeDecisao` e `contarRespondidos` (decisão humana e resumo). |
| `src/lib/exemplos.ts` | Três descrições fictícias (digital, físico, assinatura). |
| `src/app/api/revisar/route.ts` | `POST /api/revisar` chama `processarRevisao`; `GET /api/revisar` diz se a IA está disponível. `maxDuration = 30`. |
| `src/app/page.tsx` | A tela (formulário e resultado). |
| `src/app/layout.tsx` / `globals.css` | Moldura HTML e estilos. |
| `scripts/teste.ts` | Testes automáticos, 100% offline (IA falsa). |
| `scripts/teste-real.ts` | Teste opcional com a IA real (`npm run teste:real`); gasta créditos. |

## Caminho do dado

**Revisar** (`POST /api/revisar`, `src/lib/revisar.ts`):

```
texto → limite por IP (429?) → validação (400?) → itensPara(tipo)
      → IA disponível e pedida?
          sim → teto diário (429?) → analisarComIA (20 s) ──falhou──┐
          não → analisarSemIA  ←────────────────────────────────────┘ (modo fallback-sem-ia)
      → simularInvencao (opcional) → verificar → tela { resultado, modo, aviso? }
```

A resposta tem `modo`: `"ia"`, `"sem-ia"` ou `"fallback-sem-ia"`, e um `aviso` curto quando a IA
não foi usada mesmo tendo sido pedida.

**Sugerir versão revisada** (`POST /api/reescrever`, `src/lib/reescrever.ts`):

```
{ tipo, texto, itemIds } → limite por IP (429?) → validação Zod (400?)
      → itens faltantes (ids da tela, ou análise por palavras-chave)
      → IA configurada?  não → { aviso }, texto não muda
      → teto diário (429?) → IA (25 s) ──falhou──→ { aviso }, texto não muda
      → validarReescrita ──reprovou──→ { aviso: "Versão rejeitada: ..." }, texto não muda
      → { texto } → prévia lado a lado → "Usar esta versão" substitui a caixa de texto
```

O limite por IP é **um contador único** para as duas rotas: 10 pedidos por minuto somando
revisões e versões revisadas.

## Usando a IA (Passo 2)

### 1. Criar o `.env.local`

```bash
cp .env.example .env.local
```

Abra o `.env.local` e preencha:

- `ANTHROPIC_API_KEY`: crie a chave no Console da Anthropic (platform.claude.com, em **API Keys**).
- `ANTHROPIC_MODEL`: copie o nome exato de um modelo da tabela em
  <https://platform.claude.com/docs/en/about-claude/models/overview> (coluna com o ID do modelo).
  O código não tem nome de modelo fixo: ele só usa o que estiver aqui.

Se a chave ou o modelo faltarem, o sistema usa a análise por palavras-chave e avisa na tela.

### 2. Testar com a chave real

```bash
npm run dev
```

Abra o endereço local de desenvolvimento, <http://localhost:3000>. Se a IA estiver configurada, o
checkbox **Usar IA** aparece marcado.
Clique em um exemplo e em **Revisar**: acima do resultado deve aparecer "Analisado por IA".
Se aparecer o aviso de fallback, veja o terminal: o log mostra só o tipo do erro
(ex.: `AuthenticationError` = chave errada; `NotFoundError` = nome de modelo errado;
`APIConnectionTimeoutError` = passou do prazo: 20 s em `/api/revisar`, 25 s em `/api/reescrever`).

`npm run teste` **nunca** chama a API real: os testes usam uma IA falsa e apagam as variáveis antes de rodar.

### Teste com a IA real (opcional, gasta créditos)

```bash
npm run teste:real
```

`scripts/teste-real.ts` carrega o `.env.local` sozinho (sem mostrar o conteúdo), confere se a chave
e o modelo existem e faz **9 chamadas** à IA, com teto duro de 12. Ele roda 5 cenários: os 3
exemplos, injeção na análise, repetibilidade (3 rodadas), versão revisada e injeção na versão
revisada. No fim, mostra quantas verificações passaram e quantas chamadas foram feitas.
**Custo:** cada chamada usa poucos milhares de tokens, então uma rodada custa de **centavos de
dólar a menos de US$ 1**, conforme o modelo escolhido (veja os preços na documentação da Anthropic).
O `npm run teste` continua 100% offline e não roda este script.

### 3. Nunca commitar a chave

- O `.env.local` já está no `.gitignore` (regra `.env*`). Só o `.env.example`, sem valores, vai para o Git.
- A chave só é lida no servidor (`src/lib/analisarComIA.ts`). Nunca use `NEXT_PUBLIC_` nela:
  esse prefixo copia o valor para o JavaScript que vai ao navegador.
- O log não registra a chave nem o texto do produto.
- Se a chave vazar (commit, print, chat), apague-a no Console e crie outra.

### Detalhes da chamada

- O texto do produto vai entre `<texto_produto>...</texto_produto>`, e o prompt manda tratá-lo como
  dado. Se o texto tentar fechar a tag, ela é trocada por `[texto_produto]` antes do envio.
- Prazos (o SDK não repete por conta própria: `maxRetries: 0`):
  - `/api/revisar`: 20 s no total, incluindo a única nova tentativa se o JSON vier inválido;
  - `/api/reescrever`: 25 s numa chamada só, sem nova tentativa.
  Os dois ficam abaixo do `maxDuration = 30` das rotas.
- **Sem `temperature`:** o SDK instalado (`@anthropic-ai/sdk` 1.14) usa a versão `2026-10-21` da API,
  em que `temperature`, `top_p` e `top_k` foram removidos e dão erro 400 em qualquer modelo.
  A consistência vem do prompt rígido, da validação com Zod e da verificação das citações.

## Sugerir versão revisada

Abaixo do resultado, quando há itens "ausente" ou "ambíguo" (menos os que a pessoa marcou como
respondidos), o botão **Sugerir versão revisada** chama `POST /api/reescrever` com
`{ tipo, texto, itemIds }`. O servidor só aceita ids do checklist daquele tipo; sem `itemIds`,
ele usa os ausentes/ambíguos da análise por palavras-chave.

A IA devolve o texto completo, e o código só aceita se:

1. todo número do original continuar no texto novo (comparados já normalizados:
   "R$ 297" e "R$ 297,00" são o mesmo número);
2. não houver número novo fora dos colchetes;
3. o texto tiver no máximo 3000 caracteres e pelo menos metade do tamanho original;
4. a frase-modelo de cada item faltante aparecer inteira, com os colchetes.

Se algo falhar, ou faltar a chave, a tela mostra um aviso e o texto não muda. Se passar,
aparece a prévia lado a lado (original e sugerido) com **Usar esta versão** (substitui a caixa
de texto) e **Descartar**. Os colchetes das frases-modelo continuam bloqueando o botão Revisar.
A rota usa o mesmo contador por IP (somado ao de `/api/revisar`) e o mesmo teto diário.

## Limite de uso e custo

`src/lib/limite.ts` tem dois freios:

- **10 pedidos por minuto por IP**, num contador único para `/api/revisar` e `/api/reescrever`;
- **300 pedidos com IA por dia**, somando todos. O teto conta pedidos, não chamadas: uma revisão
  com nova tentativa faz 2 chamadas, então 300 pedidos podem chegar a **600 chamadas à IA**.

Os contadores ficam **na memória do servidor**. Em ambiente serverless
(Vercel e similares) cada instância tem a própria memória, que é apagada quando ela desliga,
e várias instâncias podem rodar ao mesmo tempo. Ou seja, o limite é **só um freio parcial**:
segura cliques repetidos e abusos simples, mas não garante um teto. O IP vem do cabeçalho
`x-forwarded-for`, que pode ser forjado fora de uma plataforma que o sobrescreva.

**A proteção real contra gasto é o limite de gasto (spend limit) configurado no Console da Anthropic**,
na área de limites e cobrança da organização. Configure um valor baixo antes de publicar.

## Plano em 3 passos

1. **Sem IA:** análise por palavras-chave + verificação de citações.
2. **Com IA (atual):** `analisarComIA` devolve o mesmo formato (`Resposta[]`). O checklist e a
   verificação continuam no código; a análise sem IA vira o plano B.
3. **Refinamento (feito):** frase-modelo para itens ausentes e ambíguos, decisão humana,
   bloqueio por colchetes e "Sugerir versão revisada".
