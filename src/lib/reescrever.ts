import { z } from "zod";
import { itensPara } from "./checklist";
import { analisarSemIA } from "./analisar";
import { verificar } from "./verificar";
import { chamarAnthropic, iaConfigurada, protegerDelimitador, type ChamarIA } from "./analisarComIA";
import { SYSTEM_PROMPT_REESCRITA } from "./prompt";
import { ipDoPedido, registrarPedido, registrarUsoIA } from "./limite";
import { TIPOS, type ItemChecklist, type Tipo } from "./tipos";

// Lógica da rota POST /api/reescrever: pede à IA uma versão completa do texto,
// com as frases-modelo dos itens faltantes, e confere tudo no código.
// Se qualquer regra falhar, nada é alterado: a tela só mostra um aviso.

export const MAX_TEXTO = 3000;
const PRAZO_MS = 25_000; // uma chamada só, dentro do maxDuration de 30 s

// Entrada validada com Zod. itemIds é opcional: a tela manda os itens que ela mostra.
const Entrada = z.object({
  tipo: z.enum(TIPOS as [Tipo, ...Tipo[]]),
  texto: z.string().refine((t) => t.trim().length >= 20 && t.trim().length <= MAX_TEXTO, {
    message: `O texto precisa ter entre 20 e ${MAX_TEXTO} caracteres.`,
  }),
  itemIds: z.array(z.string()).max(20).optional(),
});

const RespostaIA = z.object({ texto: z.string() });

export type DependenciasReescrita = {
  chamarIA?: ChamarIA;
  iaDisponivel?: boolean;
};

// ---------- Números ----------

// Números como "297", "29,90", "1.000" ou "297,00".
const NUMERO = /\d+(?:[.,]\d+)*/g;

// Deixa números comparáveis: "297,00" e "297" viram "297"; "1.000" vira "1000";
// "29.90" e "29,90" viram "29,90"; "07" vira "7".
export function normalizarNumero(bruto: string): string {
  let n = bruto.replace(/[.,](?=\d{3}(?:\D|$))/g, ""); // separador de milhar
  n = n.replace(/[.,]0+$/, ""); // centavos zerados
  n = n.replace(".", ",");
  n = n.replace(/^0+(?=\d)/, "");
  return n;
}

// Tira os campos entre colchetes, para que números lá dentro não contem.
function semCampos(texto: string): string {
  return texto.replace(/\[[^\[\]\n]*\]/g, " ");
}

function numerosDe(texto: string): Set<string> {
  return new Set((texto.match(NUMERO) ?? []).map(normalizarNumero));
}

// Junta espaços repetidos para comparar frases sem ligar para quebra de linha.
function espacos(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

// ---------- Validação ----------

export type ResultadoValidacao = { ok: true } | { ok: false; motivo: string };

// Confere a versão nova sem confiar na IA. O motivo é mostrado na tela,
// então só cita coisas que já estão no texto original ou no checklist.
export function validarReescrita(
  nova: string,
  original: string,
  faltantes: ItemChecklist[],
): ResultadoValidacao {
  const texto = nova.trim();
  const tamanhoOriginal = original.trim().length;

  // c) tamanho: até 3000 e pelo menos metade do original.
  if (texto.length > MAX_TEXTO) {
    return { ok: false, motivo: `a versão sugerida passou de ${MAX_TEXTO} caracteres.` };
  }
  if (texto.length < tamanhoOriginal * 0.5) {
    return { ok: false, motivo: "a versão sugerida ficou com menos da metade do tamanho do original." };
  }

  // a) todo número do original continua no texto novo.
  const numerosNovos = numerosDe(texto);
  for (const n of numerosDe(original)) {
    if (!numerosNovos.has(n)) return { ok: false, motivo: `o número ${n} do texto original sumiu.` };
  }

  // b) nenhum número novo fora dos colchetes.
  const numerosOriginais = numerosDe(original);
  for (const n of numerosDe(semCampos(texto))) {
    if (!numerosOriginais.has(n)) {
      return { ok: false, motivo: "a versão sugerida acrescentou um número que não estava no original." };
    }
  }

  // d) a frase-modelo de cada item faltante aparece inteira, com os colchetes.
  const textoComparavel = espacos(texto);
  for (const item of faltantes) {
    if (!textoComparavel.includes(espacos(item.modelo))) {
      return { ok: false, motivo: `faltou a frase-modelo de "${item.titulo}".` };
    }
  }
  return { ok: true };
}

// ---------- IA ----------

export function montarMensagemReescrita(texto: string, faltantes: ItemChecklist[]): string {
  const lista = faltantes
    .map((it) => `- ${it.titulo} (pergunta: ${it.pergunta}) | frase-modelo: ${it.modelo}`)
    .join("\n");
  return `Itens que faltam:\n${lista}\n\n<texto_produto>\n${protegerDelimitador(texto)}\n</texto_produto>\n\nDevolva somente {"texto": "..."}.`;
}

function extrairObjeto(resposta: string): unknown {
  const cerca = resposta.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let bruto = (cerca ? cerca[1] : resposta).trim();
  const ini = bruto.indexOf("{");
  const fim = bruto.lastIndexOf("}");
  if (ini >= 0 && fim > ini) bruto = bruto.slice(ini, fim + 1);
  return JSON.parse(bruto);
}

// Itens faltantes: os que a tela mandou (se forem do checklist) ou, sem lista,
// os ausentes/ambíguos da análise por palavras-chave já verificada.
function escolherFaltantes(tipo: Tipo, texto: string, itemIds?: string[]): ItemChecklist[] | null {
  const itens = itensPara(tipo);
  if (itemIds) {
    const escolhidos = itens.filter((it) => itemIds.includes(it.id));
    return escolhidos.length === new Set(itemIds).size ? escolhidos : null; // id estranho = inválido
  }
  const status = new Map(verificar(analisarSemIA(texto, itens), texto).map((r) => [r.id, r.status]));
  return itens.filter((it) => status.get(it.id) === "ausente" || status.get(it.id) === "ambiguo");
}

function erro(mensagem: string, status = 400) {
  return Response.json({ erro: mensagem }, { status });
}

// Resposta sem texto novo: a tela mostra o aviso e não altera nada.
function semAlteracao(aviso: string) {
  return Response.json({ aviso });
}

export async function processarReescrita(
  req: Request,
  deps: DependenciasReescrita = {},
): Promise<Response> {
  const limite = registrarPedido(ipDoPedido(req));
  if (!limite.ok) return erro(limite.mensagem, 429);

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return erro("Corpo da requisição precisa ser um JSON válido.");
  }

  const entrada = Entrada.safeParse(corpo);
  if (!entrada.success) return erro(entrada.error.issues[0]?.message ?? "Entrada inválida.");
  const { tipo, texto, itemIds } = entrada.data;

  const faltantes = escolherFaltantes(tipo, texto, itemIds);
  if (!faltantes) return erro("Há itens inválidos para esse tipo de produto.");
  if (faltantes.length === 0) return erro("Não há itens faltando para incluir.");

  if (!(deps.iaDisponivel ?? iaConfigurada())) {
    return semAlteracao("IA não configurada no servidor. O texto não foi alterado.");
  }

  const uso = registrarUsoIA();
  if (!uso.ok) return erro(uso.mensagem, 429);

  let nova: string;
  try {
    const resposta = await (deps.chamarIA ?? chamarAnthropic)(
      SYSTEM_PROMPT_REESCRITA,
      montarMensagemReescrita(texto, faltantes),
      { timeoutMs: PRAZO_MS },
    );
    nova = RespostaIA.parse(extrairObjeto(resposta)).texto.trim();
  } catch (e) {
    // Só o tipo do erro vai para o log, nunca o texto do produto.
    const tipoErro = e instanceof Error ? e.constructor.name || e.name : typeof e;
    console.error(`[reescrever] IA falhou (${tipoErro}); texto não alterado.`);
    return semAlteracao("A IA não respondeu ou respondeu fora do formato. O texto não foi alterado.");
  }

  const validacao = validarReescrita(nova, texto, faltantes);
  if (!validacao.ok) {
    console.error("[reescrever] versão rejeitada pela validação.");
    return semAlteracao(`Versão rejeitada: ${validacao.motivo} O texto não foi alterado.`);
  }
  return Response.json({ texto: nova, itens: faltantes.map((it) => it.id) });
}
