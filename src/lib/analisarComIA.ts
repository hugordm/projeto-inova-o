import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { SYSTEM_PROMPT } from "./prompt";
import type { ItemChecklist, Resposta } from "./tipos";

// Tempo total que a análise com IA pode levar, somando a nova tentativa.
// Fica abaixo do maxDuration (30 s) da rota para sobrar tempo ao fallback.
const PRAZO_TOTAL_MS = 20_000;
// Abaixo disso não vale a pena tentar de novo: a chamada não terminaria a tempo.
const MINIMO_PARA_RETRY_MS = 3_000;
// A resposta é curta (um array pequeno), mas modelos novos "pensam" antes,
// e esse raciocínio também conta para o limite. 8000 dá folga sem exagero.
const MAX_TOKENS = 8000;

// Função que conversa com a IA: recebe as instruções e a mensagem, devolve o texto.
// É injetável para os testes rodarem sem a API real.
export type ChamarIA = (
  sistema: string,
  mensagem: string,
  opcoes: { timeoutMs: number },
) => Promise<string>;

// Erro da nossa análise (JSON inválido, recusa etc.). A rota usa o nome para o log.
export class ErroIA extends Error {
  name = "ErroIA";
}

// Formato esperado de cada item devolvido pela IA. Só aceitamos os três status
// que a IA pode dar; "nao_confirmado" é exclusivo da verificação.
const RespostaIA = z.object({
  id: z.string(),
  status: z.enum(["respondido", "ausente", "ambiguo"]),
  evidencia: z.string().nullable(),
});
const ListaIA = z.array(RespostaIA);

// Indica se há chave e modelo configurados. Não expõe os valores.
export function iaConfigurada(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim() && process.env.ANTHROPIC_MODEL?.trim());
}

// Cliente criado só na primeira chamada real (assim os testes nunca o criam).
let cliente: Anthropic | null = null;

// Chamada real ao SDK. A chave é lida do ambiente do servidor e nunca sai daqui.
export const chamarAnthropic: ChamarIA = async (sistema, mensagem, { timeoutMs }) => {
  const modelo = process.env.ANTHROPIC_MODEL?.trim();
  if (!modelo) throw new ErroIA("ANTHROPIC_MODEL não configurado.");

  // maxRetries 0: quem decide as novas tentativas é o nosso código, dentro do prazo.
  cliente ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });

  const resposta = await cliente.messages.create(
    {
      model: modelo,
      max_tokens: MAX_TOKENS,
      system: sistema,
      messages: [{ role: "user", content: mensagem }],
    },
    { timeout: timeoutMs },
  );

  // Recusa por segurança: não há JSON para ler.
  if (resposta.stop_reason === "refusal") throw new ErroIA("A IA recusou o pedido.");

  // A resposta pode ter vários blocos (ex.: raciocínio); só o texto interessa.
  return resposta.content
    .map((bloco) => (bloco.type === "text" ? bloco.text : ""))
    .join("")
    .trim();
};

// Impede que o texto do produto "feche" o delimitador e finja ser instrução.
export function protegerDelimitador(texto: string): string {
  return texto.replace(/<\/?\s*texto_produto\s*>/gi, "[texto_produto]");
}

// Monta a mensagem: itens (id e pergunta) e o texto do produto entre delimitadores.
export function montarMensagem(texto: string, itens: ItemChecklist[]): string {
  const lista = itens.map((it) => `- id: ${it.id} | pergunta: ${it.pergunta}`).join("\n");
  return `Itens a verificar:\n${lista}\n\n<texto_produto>\n${protegerDelimitador(texto)}\n</texto_produto>\n\nDevolva somente o array JSON, com um objeto para cada item.`;
}

// Tira o JSON da resposta: aceita cercas de código (```json ... ```) e texto em volta.
export function extrairJSON(resposta: string): unknown {
  const cerca = resposta.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let bruto = (cerca ? cerca[1] : resposta).trim();
  if (!bruto.startsWith("[")) {
    const ini = bruto.indexOf("[");
    const fim = bruto.lastIndexOf("]");
    if (ini >= 0 && fim > ini) bruto = bruto.slice(ini, fim + 1);
  }
  return JSON.parse(bruto); // lança erro se não for JSON
}

// Lê e valida a resposta. Devolve null se o formato estiver errado.
function interpretar(resposta: string): z.infer<typeof ListaIA> | null {
  try {
    const validado = ListaIA.safeParse(extrairJSON(resposta));
    return validado.success ? validado.data : null;
  } catch {
    return null;
  }
}

export async function analisarComIA(
  texto: string,
  itens: ItemChecklist[],
  chamar: ChamarIA = chamarAnthropic,
): Promise<Resposta[]> {
  const mensagem = montarMensagem(texto, itens);
  const prazo = Date.now() + PRAZO_TOTAL_MS;

  // Primeira tentativa e, se o JSON vier inválido, UMA nova tentativa.
  let lista: z.infer<typeof ListaIA> | null = null;
  for (let tentativa = 1; tentativa <= 2 && !lista; tentativa++) {
    const restante = prazo - Date.now();
    if (tentativa === 2 && restante < MINIMO_PARA_RETRY_MS) break;
    lista = interpretar(await chamar(SYSTEM_PROMPT, mensagem, { timeoutMs: restante }));
  }
  if (!lista) throw new ErroIA("A IA devolveu JSON inválido duas vezes.");

  // Indexa por id, ignorando ids que não pedimos (e repetidos: vale o primeiro).
  const pedidos = new Set(itens.map((it) => it.id));
  const porId = new Map<string, Resposta>();
  for (const r of lista) {
    if (pedidos.has(r.id) && !porId.has(r.id)) porId.set(r.id, r);
  }

  // Mantém a ordem do checklist. Item que a IA não devolveu não é confirmado.
  return itens.map(
    (it) => porId.get(it.id) ?? { id: it.id, status: "nao_confirmado", evidencia: null },
  );
}
