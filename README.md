# Antes que Perguntem

Protótipo para o Desafio de Inovação (estágio de Desenvolvimento, YouShop).
Revisa a descrição de um produto **antes de ele ir ao ar** e mostra quais informações
faltam para o comprador (prazo de acesso, garantia, contato etc.).

> Protótipo de demonstração: dados e regras de exemplo. Não é um sistema da YouShop.

## Como rodar

Requer Node.js 20.9 ou mais novo.

```bash
npm install      # instala as dependências
npm run dev      # abre em http://localhost:3000
npm run teste    # roda os testes (imprime PASSOU/FALHOU)
npm run build    # gera a versão de produção
```

## O que cada arquivo faz

| Arquivo | Função |
|---|---|
| `src/lib/tipos.ts` | Tipos compartilhados: `Tipo`, `Status`, `Resposta`, `ItemChecklist`. |
| `src/lib/checklist.ts` | As perguntas do comprador, com fonte, palavras-chave e frase-modelo para quando o item está ausente. `itensPara(tipo)` escolhe quais valem para cada tipo de produto. |
| `src/lib/analisar.ts` | `analisarSemIA`: divide o texto em frases e procura palavras-chave fortes (respondido) e fracas (ambíguo). |
| `src/lib/prompt.ts` | `SYSTEM_PROMPT`: as regras fixas que a IA recebe (status, citação literal, texto do produto é dado e não ordem, só JSON). |
| `src/lib/analisarComIA.ts` | `analisarComIA`: monta a mensagem, chama a IA, extrai e valida o JSON com Zod, tenta de novo uma vez e completa os itens faltantes com `nao_confirmado`. |
| `src/lib/limite.ts` | Freio de uso em memória: 10 pedidos por minuto por IP e 300 chamadas à IA por dia. Responde 429. |
| `src/lib/revisar.ts` | Lógica da rota: limite, validação, escolha do modo (IA, sem IA ou fallback), `simularInvencao` e verificação. |
| `src/lib/verificar.ts` | `normalizar` e `verificar`: confere se cada citação existe mesmo no texto; se não, vira `nao_confirmado`. |
| `src/lib/revisaoHumana.ts` | Funções da tela: `camposAbertos` (acha campos entre colchetes), `inserirModelo` (acrescenta a frase-modelo em nova linha) e `contarRespondidos` (resumo considerando a decisão humana). |
| `src/lib/exemplos.ts` | Três descrições fictícias (digital, físico, assinatura). |
| `src/app/api/revisar/route.ts` | `POST /api/revisar` chama `processarRevisao`; `GET /api/revisar` diz se a IA está disponível. `maxDuration = 30`. |
| `src/app/page.tsx` | A tela (formulário e resultado). |
| `src/app/layout.tsx` / `globals.css` | Moldura HTML e estilos. |
| `scripts/teste.ts` | Testes automáticos. |

## Caminho do dado

```
texto → limite (429?) → validação → itensPara(tipo)
      → IA disponível e pedida?  sim → analisarComIA ──falhou──┐
                                 não → analisarSemIA  ←────────┘ (modo fallback-sem-ia)
      → simularInvencao (opcional) → verificar → tela { resultado, modo, aviso? }
```

A resposta tem `modo`: `"ia"`, `"sem-ia"` ou `"fallback-sem-ia"`, e um `aviso` curto quando a IA
não foi usada mesmo tendo sido pedida.

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

Abra <http://localhost:3000>. Se a IA estiver configurada, o checkbox **Usar IA** aparece marcado.
Clique em um exemplo e em **Revisar**: acima do resultado deve aparecer "Analisado por IA".
Se aparecer o aviso de fallback, veja o terminal: o log mostra só o tipo do erro
(ex.: `AuthenticationError` = chave errada; `NotFoundError` = nome de modelo errado;
`APIConnectionTimeoutError` = passou de 20 s).

`npm run teste` **nunca** chama a API real: os testes usam uma IA falsa e apagam as variáveis antes de rodar.

### 3. Nunca commitar a chave

- O `.env.local` já está no `.gitignore` (regra `.env*`). Só o `.env.example`, sem valores, vai para o Git.
- A chave só é lida no servidor (`src/lib/analisarComIA.ts`). Nunca use `NEXT_PUBLIC_` nela:
  esse prefixo copia o valor para o JavaScript que vai ao navegador.
- O log não registra a chave nem o texto do produto.
- Se a chave vazar (commit, print, chat), apague-a no Console e crie outra.

### Detalhes da chamada

- O texto do produto vai entre `<texto_produto>...</texto_produto>`, e o prompt manda tratá-lo como
  dado. Se o texto tentar fechar a tag, ela é trocada por `[texto_produto]` antes do envio.
- Prazo total de 20 s, incluindo a nova tentativa (o SDK não repete por conta própria: `maxRetries: 0`).
- **Sem `temperature`:** o SDK instalado (`@anthropic-ai/sdk` 1.14) usa a versão `2026-10-21` da API,
  em que `temperature`, `top_p` e `top_k` foram removidos e dão erro 400 em qualquer modelo.
  A consistência vem do prompt rígido, da validação com Zod e da verificação das citações.

## Limite de uso e custo

`src/lib/limite.ts` guarda os contadores **na memória do servidor**. Em ambiente serverless
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
3. **Refinamento:** sugestões de texto para os itens que faltam e ajustes de interface.
