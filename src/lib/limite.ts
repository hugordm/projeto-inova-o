// Freio simples de uso, guardado na memória do servidor.
// Atenção: em ambiente serverless cada instância tem sua própria memória e ela
// some quando a instância é desligada. A proteção real é o limite de gasto no
// console da Anthropic (veja o README).

export const LIMITE_POR_MINUTO = 10; // pedidos por IP a cada minuto
export const LIMITE_DIARIO_IA = 300; // chamadas à IA por dia, somando todos

const UM_MINUTO = 60_000;

// IP -> horários (ms) dos pedidos do último minuto.
const pedidosPorIp = new Map<string, number[]>();
let diaAtual = "";
let usosIaHoje = 0;

export type ResultadoLimite = { ok: true } | { ok: false; mensagem: string };

// Pega o IP do cabeçalho do proxy. Pode ser forjado fora de uma plataforma
// que o sobrescreva, por isso o limite por IP é só um freio.
export function ipDoPedido(req: Request): string {
  const encaminhado = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return encaminhado || req.headers.get("x-real-ip")?.trim() || "desconhecido";
}

// Conta um pedido do IP. Devolve erro se passou de LIMITE_POR_MINUTO.
export function registrarPedido(ip: string, agora = Date.now()): ResultadoLimite {
  const recentes = (pedidosPorIp.get(ip) ?? []).filter((t) => agora - t < UM_MINUTO);
  if (recentes.length >= LIMITE_POR_MINUTO) {
    pedidosPorIp.set(ip, recentes);
    return { ok: false, mensagem: "Muitos pedidos em pouco tempo. Espere um minuto e tente de novo." };
  }
  recentes.push(agora);
  pedidosPorIp.set(ip, recentes);

  // Faxina: evita que o mapa cresça sem parar com IPs antigos.
  if (pedidosPorIp.size > 5000) {
    for (const [chave, tempos] of pedidosPorIp) {
      if (tempos.every((t) => agora - t >= UM_MINUTO)) pedidosPorIp.delete(chave);
    }
  }
  return { ok: true };
}

// Conta uma chamada à IA no dia (horário UTC). Devolve erro se passou do teto.
export function registrarUsoIA(agora = Date.now()): ResultadoLimite {
  const dia = new Date(agora).toISOString().slice(0, 10);
  if (dia !== diaAtual) {
    diaAtual = dia;
    usosIaHoje = 0;
  }
  if (usosIaHoje >= LIMITE_DIARIO_IA) {
    return {
      ok: false,
      mensagem: "O limite diário de análises com IA foi atingido. Desmarque \"Usar IA\" ou tente amanhã.",
    };
  }
  usosIaHoje++;
  return { ok: true };
}

// Só para os testes: zera os contadores.
export function reiniciarLimites(): void {
  pedidosPorIp.clear();
  diaAtual = "";
  usosIaHoje = 0;
}
