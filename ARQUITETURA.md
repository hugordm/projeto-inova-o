# Arquitetura do "Antes que Perguntem"

Guia de estudo escrito a partir do código atual (não do plano). Quando este guia e o código
discordarem, vale o código. Os nomes entre crases são arquivos e funções reais.

---

## 1. Árvore de pastas

```
.
├── .env.example            Modelo das variáveis (chave e modelo), sem valores; vai para o Git.
├── .env.local              Suas variáveis de verdade (a chave). Ignorado pelo Git; nunca é lido pelos testes.
├── .gitignore              Diz ao Git o que não versionar (node_modules, .next, .env*, exceto .env.example).
├── ARQUITETURA.md          Este guia.
├── README.md               Como rodar, configurar a IA e os limites de uso.
├── next.config.ts          Configuração do Next; está vazia de propósito (o padrão basta).
├── next-env.d.ts           Tipos que o Next gera sozinho; não se edita.
├── package.json            Dependências e comandos (dev, build, start, teste).
├── package-lock.json       Versões exatas instaladas; gerado pelo npm.
├── tsconfig.json           Regras do TypeScript (modo estrito, atalho "@/" para "src/").
├── scripts/
│   ├── teste.ts            Todos os testes offline (40), sem biblioteca: imprime PASSOU/FALHOU e nunca chama a API real.
│   └── teste-real.ts       Teste opcional com a IA real (npm run teste:real): 9 chamadas, teto de 12; gasta créditos.
└── src/
    ├── app/                Parte que o Next transforma em páginas e rotas.
    │   ├── layout.tsx      Moldura HTML comum (idioma pt-BR, título) e importa o CSS.
    │   ├── globals.css     Todos os estilos da tela.
    │   ├── page.tsx        A tela inteira: formulário, resultado, decisões humanas e prévia da versão revisada.
    │   └── api/
    │       ├── revisar/
    │       │   └── route.ts      Rota /api/revisar: POST analisa o texto; GET diz se a IA está configurada.
    │       └── reescrever/
    │           └── route.ts      Rota /api/reescrever: POST pede a versão revisada do texto.
    └── lib/                Regras do sistema, sem nada de tela.
        ├── tipos.ts        Tipos compartilhados (Tipo, Status, Resposta, ItemChecklist) e a lista TIPOS.
        ├── checklist.ts    As 8 perguntas do comprador, com fonte, palavras-chave e frase-modelo; itensPara(tipo).
        ├── exemplos.ts     Três descrições fictícias com lacunas de propósito.
        ├── analisar.ts     analisarSemIA: análise por palavras-chave, frase a frase.
        ├── verificar.ts    normalizar e verificar: confere se cada citação existe mesmo no texto.
        ├── prompt.ts       As instruções fixas da IA: SYSTEM_PROMPT (análise) e SYSTEM_PROMPT_REESCRITA.
        ├── analisarComIA.ts  Conversa com a IA: chamada real ao SDK, mensagem, leitura e validação do JSON.
        ├── limite.ts       Freio de uso em memória: 10 pedidos/minuto por IP (contador único das duas rotas) e 300 pedidos com IA por dia.
        ├── revisar.ts      Lógica completa de POST /api/revisar (limite, validação, modo, verificação).
        ├── reescrever.ts   Lógica completa de POST /api/reescrever (validação Zod, IA e as 4 regras de conferência).
        └── revisaoHumana.ts  Funções puras da tela: colchetes, inserir frase, contar respondidos.
```

`.next/` (build) e `node_modules/` (pacotes) são gerados e não fazem parte do código.

---

## 2. Quem importa quem

Tirado dos `import` reais de cada arquivo. "(tipo)" = importa só tipos, que somem no JavaScript final.

```
src/app/page.tsx              → react, lib/exemplos, lib/tipos (tipo), lib/revisaoHumana
src/app/layout.tsx            → next (tipo), ./globals.css
src/app/api/revisar/route.ts  → lib/revisar, lib/analisarComIA
src/app/api/reescrever/route.ts → lib/reescrever

src/lib/revisar.ts      → lib/checklist, lib/analisar, lib/analisarComIA, lib/verificar, lib/limite, lib/tipos
src/lib/reescrever.ts   → zod, lib/checklist, lib/analisar, lib/verificar, lib/analisarComIA,
                          lib/prompt, lib/limite, lib/tipos
src/lib/analisarComIA.ts → @anthropic-ai/sdk, zod, lib/prompt, lib/tipos (tipo)
src/lib/analisar.ts     → lib/tipos (tipo), lib/verificar
src/lib/verificar.ts    → lib/tipos (tipo)
src/lib/revisaoHumana.ts → lib/checklist, lib/tipos (tipo)
src/lib/checklist.ts    → lib/tipos (tipo)
src/lib/exemplos.ts     → lib/tipos (tipo)
src/lib/limite.ts       → (nada)
src/lib/prompt.ts       → (nada)
src/lib/tipos.ts        → (nada)

scripts/teste.ts → lib/checklist, lib/revisaoHumana, lib/analisar, lib/verificar, lib/exemplos,
                   app/api/revisar/route, lib/revisar, lib/analisarComIA, lib/reescrever,
                   lib/prompt, lib/limite
```

Duas coisas para notar:

- **A tela (`page.tsx`) nunca importa `analisarComIA.ts`.** Por isso o SDK da Anthropic e a
  leitura da chave não entram no JavaScript do navegador. A tela só fala com o servidor por `fetch`.
- **Não há ciclos.** `tipos.ts`, `prompt.ts` e `limite.ts` são folhas (não importam nada do projeto).

---

## 3. O caminho de um clique

### 3.1 Clique em "Revisar"

| # | Onde | O que acontece |
|---|---|---|
| 1 | `page.tsx` → `revisar()` | Envia `POST /api/revisar` com `{ tipo, texto, simularInvencao, modo }`. `modo` é `"ia"` ou `"sem-ia"` conforme o checkbox "Usar IA". O botão fica desabilitado se `camposDeModeloAbertos(texto)` achar colchete de frase-modelo. |
| 2 | `api/revisar/route.ts` → `POST` | Só repassa para `processarRevisao(req)`. |
| 3 | `limite.ts` → `ipDoPedido`, `registrarPedido` | Lê o IP do cabeçalho `x-forwarded-for`. Mais de 10 pedidos no último minuto → **429**. |
| 4 | `revisar.ts` → `processarRevisao` | Lê o JSON e valida `tipo` (precisa estar em `TIPOS`) e `texto` (20 a 3000 caracteres) → **400** se falhar. |
| 5 | `checklist.ts` → `itensPara(tipo)` | Escolhe as perguntas que valem para o tipo (6, 5 ou 6 itens). |
| 6 | `revisar.ts` + `analisarComIA.ts` → `iaConfigurada()` | Decide o caminho: IA só se há chave **e** modelo **e** `modo !== "sem-ia"`. |
| 7a | `limite.ts` → `registrarUsoIA` | (Caminho IA) Conta um pedido com IA no dia, antes de chamar a IA. Teto de 300 pedidos → **429**. |
| 7b | `analisarComIA.ts` → `analisarComIA` | Monta a mensagem (`montarMensagem` + `protegerDelimitador`), chama `chamarAnthropic` com `SYSTEM_PROMPT` (`prompt.ts`), lê a resposta (`extrairJSON`, `interpretar` com Zod). JSON inválido → tenta **uma** vez de novo, dentro de 20 s no total. Descarta ids desconhecidos; item omitido vira `nao_confirmado`. |
| 7c | `revisar.ts` (catch) → `analisarSemIA` | Se a IA falhar de qualquer jeito: registra só o tipo do erro no log, usa as palavras-chave e responde `modo: "fallback-sem-ia"` com aviso. |
| 8 | `analisar.ts` → `analisarSemIA` | (Caminho sem IA) Divide em frases e testa as regex `palavrasFortes` (respondido) e `palavrasFracas` (ambíguo) sobre o texto normalizado (`normalizar`, de `verificar.ts`). |
| 9 | `revisar.ts` | Se `simularInvencao` for `true`, troca o primeiro item "ausente" por uma citação falsa. |
| 10 | `verificar.ts` → `verificar` | **Sempre**, em qualquer modo: toda evidência que não existe no texto (comparando normalizado) vira `nao_confirmado`. |
| 11 | `revisar.ts` | Junta cada resposta com os dados do item (título, pergunta, fonte, modelo) e devolve `{ resultado, modo, aviso? }`. |
| 12 | `page.tsx` → `revisar()` e renderização | Guarda resultado, modo e aviso; zera decisões humanas e prévia antiga. Mostra o selo do modo, o resumo (`contarRespondidos`), cada item com seu selo, a citação (riscada se `nao_confirmado`), a frase-modelo (ausente/ambíguo) e os botões de decisão (`pedeDecisao`: ambíguo/não confirmado). |

### 3.2 Clique em "Sugerir versão revisada"

| # | Onde | O que acontece |
|---|---|---|
| 1 | `page.tsx` → cálculo de `faltantes` | Ids dos itens ausentes ou ambíguos, tirando os que a pessoa marcou como respondidos. O botão só aparece se a lista não estiver vazia. |
| 2 | `page.tsx` → `sugerirVersao(itemIds)` | Guarda uma cópia do texto atual (`original`) e envia `POST /api/reescrever` com `{ tipo, texto, itemIds }`. |
| 3 | `api/reescrever/route.ts` → `POST` | Só repassa para `processarReescrita(req)`. |
| 4 | `limite.ts` → `registrarPedido` | Mesmo contador por IP de `/api/revisar` (um contador único para as duas rotas) → **429**. |
| 5 | `reescrever.ts` → `Entrada` (Zod) | Valida `tipo`, `texto` (20 a 3000) e `itemIds` (opcional, até 20) → **400**. |
| 6 | `reescrever.ts` → `escolherFaltantes` | Com `itemIds`: só aceita ids de `itensPara(tipo)` (id estranho → **400**). Sem `itemIds`: usa `analisarSemIA` + `verificar`. Lista vazia → **400**. |
| 7 | `analisarComIA.ts` → `iaConfigurada` | Sem chave ou modelo → `{ aviso }` e nada muda. |
| 8 | `limite.ts` → `registrarUsoIA` | Teto diário → **429**. |
| 9 | `reescrever.ts` → `montarMensagemReescrita` + `chamarAnthropic` | Envia `SYSTEM_PROMPT_REESCRITA`, a lista de itens com as frases-modelo e o texto entre `<texto_produto>` (com `protegerDelimitador`). Uma chamada só, 25 s. Lê `{ "texto": ... }` com `extrairObjeto` + Zod. Erro → `{ aviso }`. |
| 10 | `reescrever.ts` → `validarReescrita` | As 4 regras: tamanho (≤ 3000 e ≥ 50% do original); todo número do original presente; nenhum número novo fora de colchetes (`normalizarNumero`, `semCampos`, `numerosDe`); frase-modelo de cada faltante presente (`espacos`). Falhou → `{ aviso: "Versão rejeitada: ..." }`. |
| 11 | `reescrever.ts` | Passou → `{ texto, itens }`. |
| 12 | `page.tsx` | `{ texto }` → prévia lado a lado (original × sugerido). "Usar esta versão" faz `setTexto(sugerido)`; "Descartar" fecha. Sem `texto` → mostra o aviso. Depois de usar, os colchetes das frases-modelo bloqueiam "Revisar" até serem preenchidos. |

---

## 4. "Usar IA" e "Modo demonstração: simular erro da IA"

Na tela, as duas opções são **mutuamente exclusivas**: marcar a demonstração desmarca e desabilita
"Usar IA"; marcar "Usar IA" desmarca a demonstração. A restrição é só de `page.tsx`: a API
(`revisar.ts`) continua aceitando as duas juntas.

### "Usar IA"

1. Ao abrir a página, `page.tsx` (`useEffect`) faz `GET /api/revisar`.
2. `api/revisar/route.ts` → `GET` responde `{ iaDisponivel: iaConfigurada() }`. `iaConfigurada`
   (`analisarComIA.ts`) só olha se `ANTHROPIC_API_KEY` e `ANTHROPIC_MODEL` têm valor; nunca devolve os valores.
3. A tela marca o checkbox se houver IA, ou o desabilita com "(indisponível...)". Ele também fica
   desabilitado enquanto o modo demonstração estiver ligado.
4. No clique em Revisar, `revisar()` manda `modo: usarIA && !simular ? "ia" : "sem-ia"`: com a
   demonstração ligada, o pedido é sempre sem IA.
5. Em `revisar.ts`, `querIA = modo !== "sem-ia"`. A IA roda só se `querIA` **e** `iaDisponivel`.
   Se a pessoa quis IA mas ela não está configurada, a resposta vem com `modo: "sem-ia"` e um aviso.

O checkbox não tem efeito no "Sugerir versão revisada": essa rota sempre tenta a IA.

### "Modo demonstração: simular erro da IA"

1. O checkbox liga `simular` em `page.tsx` (e desliga `usarIA`), enviado como `simularInvencao: true`
   junto com `modo: "sem-ia"`. Embaixo dele, um texto pequeno explica que não é um erro real e não usa a IA.
2. Em `revisar.ts`, **depois** da análise (com ou sem IA) e **antes** da verificação, o código
   troca o primeiro item "ausente" por `status: "respondido"` com a frase `CITACAO_INVENTADA`, que
   não existe em nenhum exemplo.
3. `verificar` (`verificar.ts`) não acha essa frase no texto e muda o status para `nao_confirmado`.
4. A tela mostra a citação **riscada** (classe `riscada` em `globals.css`).

Serve para demonstrar que a verificação pega uma "alucinação", sem gastar crédito: pela tela, a
demonstração sempre usa a análise por palavras-chave. Chamando a API direto, `simularInvencao` também
funciona com a IA (teste (g)). Se não houver nenhum item "ausente", nada é simulado e a tela não avisa.

---

## 5. Por que a estrutura é assim

| Decisão | Motivo |
|---|---|
| `revisar.ts` e `reescrever.ts` separados dos `route.ts` | O Next só deixa um `route.ts` exportar `GET`, `POST` e configurações (`maxDuration`, `dynamic`). Com a lógica num arquivo comum, os testes chamam `processarRevisao`/`processarReescrita` passando uma IA falsa. |
| Função de chamada à IA injetável (`ChamarIA`) | Os testes entregam uma função falsa que devolve o texto que quiserem (JSON bom, quebrado, inventado, erro). Assim testam retry, fallback e validação sem rede e sem custo. O padrão é `chamarAnthropic`. `teste.ts` ainda apaga as variáveis da chave antes de rodar. |
| Checklist no código, não na IA | `itensPara(tipo)` decide as perguntas. A IA não pode inventar item (ids desconhecidos são descartados) nem "esquecer" um (vira `nao_confirmado`). |
| Mesmo formato (`Resposta[]`) com e sem IA | `analisarSemIA` e `analisarComIA` devolvem o mesmo tipo. Por isso a verificação, a rota e a tela não mudam conforme o modo, e o fallback é só trocar uma função. |
| Verificação sempre por último | `verificar` roda depois de tudo, inclusive da simulação: nenhuma etapa anterior consegue "furar" a checagem de citações. |
| Análise sem IA mantida como plano B | Se a IA falhar ou não estiver configurada, o produto continua funcionando, e a tela diz qual modo foi usado. |
| Limite em memória (`limite.ts`) | Simples e sem banco de dados, bom para um protótipo. Segura cliques repetidos. Não é proteção real em serverless (veja a seção 6); a proteção real é o limite de gasto no Console da Anthropic. |
| `maxRetries: 0` e prazo próprio | O SDK repetiria sozinho e poderia passar do `maxDuration = 30`. O código controla: 20 s no total na análise (com uma nova tentativa) e 25 s numa chamada na reescrita. |
| Sem `temperature` | O SDK 1.14 usa a versão `2026-10-21` da API, que rejeita `temperature` com erro 400. A consistência vem do prompt, do Zod e das verificações. |
| `<texto_produto>` + `protegerDelimitador` | Separa dado de instrução e impede que o texto feche a tag e finja ser ordem. |
| `revisaoHumana.ts` sem React | As regras de colchetes, inserir frase e contar respondidos são funções puras, testáveis sem abrir a tela. |
| Decisão humana só na tela | Não altera a API nem a verificação: deixa claro o que foi da máquina e o que foi da pessoa (dois selos). |
| `dynamic = "force-dynamic"` nas rotas | O `GET` lê o ambiente a cada pedido, em vez de congelar a resposta no momento do build. |

---

## 6. Limites do projeto (o que NÃO é garantido)

**A verificação de citações (`verificar.ts`)**
- Só confere se o trecho **existe** no texto, não se ele **responde** à pergunta. Uma citação
  verdadeira mas fora do assunto passa.
- Um trecho muito curto (uma palavra) passa, porque existe no texto.
- O julgamento "respondido × ambíguo" é da IA (ou das regex) e não é conferido.
- Itens "ausente" não são verificados: se a IA disser "ausente" quando o texto responde, ninguém corrige.

**A IA**
- Pode errar o status, mesmo com o prompt e a temperatura padrão. Não há como fixar `temperature`.
- O prompt e o delimitador reduzem a chance de *prompt injection*, mas não a eliminam. O que
  protege de verdade são as checagens no código depois da resposta.

**A análise por palavras-chave (`analisar.ts`)**
- Regex podem errar para os dois lados: frase que bate mas não responde, ou resposta escrita de
  um jeito que nenhuma regex prevê.

**A versão revisada (`reescrever.ts`)**
- Confere números e frases-modelo, mas **não** percebe fato apagado ou inventado só com palavras
  ("por e-mail" sumir, "o melhor curso" aparecer sem número).
- Números por extenso ("sete dias") não são comparados.
- Colchetes novos que não são de frase-modelo não são proibidos e não bloqueiam o "Revisar".

**Limites de uso (`limite.ts`)**
- Em memória: em serverless cada instância conta separado e zera ao reiniciar.
- O IP vem de `x-forwarded-for`, que pode ser forjado fora de uma plataforma que o reescreva.
- O teto diário conta **pedidos** que usam IA, não chamadas: 300 pedidos podem chegar a 600 chamadas,
  porque uma revisão com nova tentativa faz 2. A proteção real de custo é o limite de gasto no Console da Anthropic.
- O contador por IP é único para as duas rotas (10 por minuto somando revisar e reescrever).

**A tela**
- Decisões humanas e prévias não são salvas: somem ao recarregar.
- Depois de "Usar esta versão" ou de trocar o tipo no seletor, o resultado antigo continua na tela
  até a próxima revisão.
- Não há login: qualquer pessoa com o endereço pode usar.

---

## 7. Dez perguntas que uma banca poderia fazer

1. **Como vocês impedem a IA de inventar uma citação?**
   Toda evidência passa por `verificar` (`verificar.ts`), que normaliza (minúsculas, sem acento,
   espaços únicos) e exige que o trecho exista no texto. Se não existir, vira `nao_confirmado`.
   O "Modo demonstração: simular erro da IA" e o teste (g) provam isso.

2. **E se a IA devolver algo que não é JSON?**
   `analisarComIA` tenta extrair o JSON (aceita cercas de código), valida com Zod e, se falhar,
   tenta uma vez de novo. Na segunda falha lança erro, e `revisar.ts` cai na análise sem IA
   (`fallback-sem-ia`) com aviso.

3. **Quem decide quais perguntas são feitas, a IA ou o código?**
   O código: `itensPara(tipo)` em `checklist.ts`. Ids que a IA inventar são ignorados, e item que
   ela omitir vira `nao_confirmado`.

4. **Onde fica a chave da API? Ela pode vazar pelo navegador?**
   Só no ambiente do servidor (`.env.local`, ignorado pelo Git), lida em `analisarComIA.ts`. A tela
   não importa esse arquivo e o nome não usa `NEXT_PUBLIC_`; o build foi conferido sem nenhuma
   referência à chave no JavaScript do cliente. O log registra só o tipo do erro.

5. **E se alguém escrever "ignore as regras" dentro da descrição?**
   O texto vai entre `<texto_produto>`, o prompt manda tratá-lo como dado e `protegerDelimitador`
   impede que ele feche a tag. Mesmo que a IA obedeça, as checagens do código descartam o resultado
   (testes (j) e (v)).

6. **Por que não usaram `temperature: 0`?**
   O SDK instalado usa a versão `2026-10-21` da API, que removeu `temperature`; enviar dá erro 400.
   A estabilidade vem do prompt rígido, do Zod e das verificações.

7. **Como testam sem gastar com a API?**
   A função de chamada (`ChamarIA`) é injetável: os testes passam funções falsas. `teste.ts` apaga
   as variáveis da chave antes de rodar, então mesmo por engano não há chamada real.

8. **O limite de 10 por minuto funciona em produção?**
   Parcialmente. Ele vive na memória (`limite.ts`); em serverless cada instância tem a sua. A
   proteção real contra gasto é o limite de gasto no Console da Anthropic, como o README orienta.

9. **Como a versão revisada é conferida?**
   `validarReescrita` (`reescrever.ts`): tamanho entre 50% do original e 3000; todo número do
   original presente; nenhum número novo fora de colchetes (comparados por `normalizarNumero`, que
   iguala "297" e "297,00"); frase-modelo de cada faltante presente. Falhou, nada muda.

10. **O que acontece se a IA demorar demais?**
    O SDK não repete sozinho (`maxRetries: 0`). A análise tem 20 s no total e a reescrita 25 s,
    ambos abaixo do `maxDuration = 30` das rotas. Passou do prazo, a análise cai no modo sem IA e a
    reescrita mostra aviso sem alterar o texto.

---

## 8. Como acrescentar uma pergunta nova ao checklist

Exemplo: uma pergunta "Formas de pagamento" para produtos físicos e assinaturas.

1. **Abra `src/lib/checklist.ts`** e acrescente um objeto ao array `CHECKLIST`:

   ```ts
   {
     id: "formas_pagamento",            // único, sem espaço; a IA devolve esse id
     titulo: "Formas de pagamento",
     pergunta: "Quais formas de pagamento posso usar?",
     aplicaA: ["fisico", "assinatura"],  // para quais tipos a pergunta vale
     fonte: `${FAQ}: dúvidas sobre pagamento.`,  // de onde veio a ideia
     modelo: "Formas de pagamento: [Pix / cartão / boleto].",  // com pelo menos um campo entre colchetes
     palavrasFortes: [/\bpix\b/, /cartao/, /boleto/],  // respondido
     palavrasFracas: [/pagamento/],                     // ambíguo
   },
   ```

   As regex enxergam o texto **normalizado** (minúsculas, sem acento): escreva `cartao`, não
   `Cartão`. Não use a flag `g`.

2. **Atualize o teste que conta os itens:** em `scripts/teste.ts`, o teste (m) exige
   `CHECKLIST.length === 8`. Troque para 9.

3. **Confira os testes do exemplo:** os testes (a) e (q) dependem dos itens do exemplo digital.
   Se a pergunta nova valer para "digital", eles podem precisar de ajuste.

4. **Rode `npm run teste` e `npm run build`.**

Não precisa mexer em mais nada:
- a IA recebe o item novo automaticamente (`montarMensagem` lista os itens de `itensPara`);
- os campos da frase-modelo passam a bloquear o "Revisar" sozinhos (`CAMPOS_DOS_MODELOS` é calculado
  a partir do checklist);
- a tela mostra o item novo com selo, frase-modelo e botões, sem alteração.

---

## Onde o código divergiu do README

Na primeira versão deste guia foram encontradas estas divergências. **Todas foram corrigidas** só na
documentação e nos comentários, sem mudar lógica:

1. **Teto diário:** dizia "300 chamadas por dia". Agora README, `limite.ts` e este guia dizem
   300 **pedidos** com IA por dia, que podem chegar a 600 chamadas com a nova tentativa, e que a
   proteção real de custo é o limite de gasto no Console da Anthropic.
2. **Prazo:** o README falava só em 20 s. Agora diz 20 s em `/api/revisar` e 25 s em `/api/reescrever`.
3. **"Caminho do dado":** o diagrama passou a mostrar o teto diário antes da IA e o caminho de
   `/api/reescrever`.
4. **Limite por IP:** README, `limite.ts` e este guia dizem que é um contador único para as duas rotas.
5. **Tabela de arquivos:** a linha de `revisaoHumana.ts` passou a citar todas as funções que a tela usa.
6. **"Plano em 3 passos":** o passo 3 aparece como feito.
7. **Comentário em `tipos.ts`:** agora diz que `nao_confirmado` vem da verificação **e** de
   `analisarComIA` (item omitido pela IA).

Ficaram como estão, de propósito:

- O comentário de `analisar.ts` ("que a IA devolverá no Passo 2") continua no futuro, porque esse
  arquivo não deve ser alterado.
- A faixa da tela, que dizia "Passo 2", foi trocada depois por "Protótipo de demonstração. Dados e
  regras de exemplo; as fontes de cada item estão indicadas."
