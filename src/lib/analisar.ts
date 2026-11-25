import type { ItemChecklist, Resposta } from "./tipos";
import { normalizar } from "./verificar";

// Quebra em frases por linha ou por ". ", "! ", "? ".
// Exige espaço depois do ponto para não quebrar "R$ 29,90" ou "youshop.co".
function dividirEmFrases(texto: string): string[] {
  return texto
    .split(/\n+|(?<=[.!?])\s+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

// Versão sem IA: procura palavras-chave frase a frase.
// Devolve o mesmo formato (Resposta[]) que a IA devolverá no Passo 2,
// então a verificação e a tela não precisam mudar.
export function analisarSemIA(texto: string, itens: ItemChecklist[]): Resposta[] {
  const frases = dividirEmFrases(texto).map((original) => ({
    original, // guardada para servir de citação exata
    norm: normalizar(original), // usada só para casar as regex
  }));

  return itens.map((item) => {
    const forte = frases.find((f) => item.palavrasFortes.some((re) => re.test(f.norm)));
    if (forte) return { id: item.id, status: "respondido", evidencia: forte.original };

    const fraca = frases.find((f) => item.palavrasFracas?.some((re) => re.test(f.norm)));
    if (fraca) return { id: item.id, status: "ambiguo", evidencia: fraca.original };

    return { id: item.id, status: "ausente", evidencia: null };
  });
}
