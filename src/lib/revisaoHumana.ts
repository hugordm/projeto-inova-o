import { CHECKLIST } from "./checklist";
import type { Status } from "./tipos";

// Funções da tela que não dependem do React, para poderem ser testadas.

// Um campo a preencher é qualquer trecho entre colchetes numa mesma linha, ex.: "[N]".
const CAMPO = /\[[^\[\]\n]*\]/g;

// Devolve os campos entre colchetes que ainda estão no texto (lista vazia = tudo preenchido).
export function camposAbertos(texto: string): string[] {
  return texto.match(CAMPO) ?? [];
}

// Todos os campos que aparecem nas frases-modelo do checklist, ex.: "[N]", "[onde]".
export const CAMPOS_DOS_MODELOS: ReadonlySet<string> = new Set(
  CHECKLIST.flatMap((item) => camposAbertos(item.modelo)),
);

// Campos de frase-modelo que continuam no texto sem preencher (sem repetir).
// Colchetes do próprio vendedor, como "Edição [2026]", ficam de fora.
export function camposDeModeloAbertos(
  texto: string,
  camposDosModelos: ReadonlySet<string> = CAMPOS_DOS_MODELOS,
): string[] {
  return [...new Set(camposAbertos(texto).filter((c) => camposDosModelos.has(c)))];
}

// Acrescenta a frase-modelo ao final do texto, em nova linha.
export function inserirModelo(texto: string, modelo: string): string {
  const base = texto.replace(/\s+$/, ""); // tira espaços e linhas vazias do fim
  return base === "" ? modelo : `${base}\n${modelo}`;
}

// Escolha da pessoa para um item "nao_confirmado" ou "ambiguo".
export type Decisao = "respondido" | "faltando";

// Só esses status pedem decisão humana; os outros a máquina já resolveu com segurança.
export function pedeDecisao(status: Status): boolean {
  return status === "nao_confirmado" || status === "ambiguo";
}

// Conta os itens respondidos: vale o status da máquina, a não ser que
// a pessoa tenha decidido sobre um item que pede decisão.
export function contarRespondidos(
  itens: { id: string; status: Status }[],
  decisoes: Record<string, Decisao>,
): number {
  return itens.filter((r) => {
    const decisao = pedeDecisao(r.status) ? decisoes[r.id] : undefined;
    return decisao ? decisao === "respondido" : r.status === "respondido";
  }).length;
}
