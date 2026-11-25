import { itensPara } from "./checklist";
import { analisarSemIA } from "./analisar";
import { analisarComIA, chamarAnthropic, iaConfigurada, type ChamarIA } from "./analisarComIA";
import { verificar } from "./verificar";
import { ipDoPedido, registrarPedido, registrarUsoIA } from "./limite";
import { TIPOS, type Resposta, type Tipo } from "./tipos";

// Toda a lógica da rota POST /api/revisar fica aqui, e não no route.ts,
// porque o Next só deixa a rota exportar GET/POST/config. Assim os testes
// chamam esta função injetando uma IA falsa.

const MIN = 20;
const MAX = 3000;

// Frase que não existe em nenhum exemplo: serve para provar que a verificação pega invenções.
const CITACAO_INVENTADA = "Acesso vitalício, certificado incluso e garantia de 90 dias.";

export type Modo = "ia" | "sem-ia" | "fallback-sem-ia";

export type Dependencias = {
  chamarIA?: ChamarIA; // padrão: SDK real
  iaDisponivel?: boolean; // padrão: há chave e modelo no ambiente
};

function erro(mensagem: string, status = 400) {
  return Response.json({ erro: mensagem }, { status });
}

// Nome do tipo do erro, sem a mensagem: a mensagem poderia conter dados.
function tipoDoErro(e: unknown): string {
  return e instanceof Error ? e.constructor.name || e.name : typeof e;
}

export async function processarRevisao(req: Request, deps: Dependencias = {}): Promise<Response> {
  const limite = registrarPedido(ipDoPedido(req));
  if (!limite.ok) return erro(limite.mensagem, 429);

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return erro("Corpo da requisição precisa ser um JSON válido.");
  }

  const { tipo, texto, simularInvencao, modo } = (corpo ?? {}) as Record<string, unknown>;

  // Nunca confiar no que vem do navegador: validar tudo no servidor.
  if (typeof tipo !== "string" || !TIPOS.includes(tipo as Tipo)) {
    return erro("Tipo inválido. Use: digital, fisico ou assinatura.");
  }
  if (typeof texto !== "string") {
    return erro("Envie o texto da descrição.");
  }
  const tamanho = texto.trim().length;
  if (tamanho < MIN || tamanho > MAX) {
    return erro(`O texto precisa ter entre ${MIN} e ${MAX} caracteres (tem ${tamanho}).`);
  }

  const itens = itensPara(tipo as Tipo);
  const iaDisponivel = deps.iaDisponivel ?? iaConfigurada();
  const querIA = modo !== "sem-ia";

  let respostas: Resposta[];
  let modoUsado: Modo;
  let aviso: string | undefined;

  if (querIA && iaDisponivel) {
    const uso = registrarUsoIA();
    if (!uso.ok) return erro(uso.mensagem, 429);
    try {
      respostas = await analisarComIA(texto, itens, deps.chamarIA ?? chamarAnthropic);
      modoUsado = "ia";
    } catch (e) {
      // Só o tipo do erro vai para o log: nunca o texto do produto nem a chave.
      console.error(`[revisar] IA falhou (${tipoDoErro(e)}); usando análise sem IA.`);
      respostas = analisarSemIA(texto, itens);
      modoUsado = "fallback-sem-ia";
      aviso = "A IA não respondeu a tempo ou respondeu fora do formato. Usamos a análise por palavras-chave.";
    }
  } else {
    respostas = analisarSemIA(texto, itens);
    modoUsado = "sem-ia";
    if (querIA && !iaDisponivel) {
      aviso = "IA não configurada no servidor (falta chave ou modelo). Usamos a análise por palavras-chave.";
    }
  }

  // Simula uma IA que "alucina": afirma que algo foi respondido citando frase falsa.
  if (simularInvencao === true) {
    const i = respostas.findIndex((r) => r.status === "ausente");
    if (i >= 0) {
      respostas = respostas.map((r, j) =>
        j === i ? { ...r, status: "respondido", evidencia: CITACAO_INVENTADA } : r,
      );
    }
  }

  // A verificação roda SEMPRE por último, em qualquer modo, aconteça o que acontecer antes.
  const verificadas = verificar(respostas, texto);

  const resultado = verificadas.map((r) => {
    const item = itens.find((it) => it.id === r.id)!;
    return {
      item: {
        id: item.id,
        titulo: item.titulo,
        pergunta: item.pergunta,
        fonte: item.fonte,
        modelo: item.modelo, // campo novo; quem já lia a resposta continua funcionando
      },
      status: r.status,
      evidencia: r.evidencia,
    };
  });

  return Response.json(aviso ? { resultado, modo: modoUsado, aviso } : { resultado, modo: modoUsado });
}
