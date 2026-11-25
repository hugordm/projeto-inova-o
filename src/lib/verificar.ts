import type { Resposta } from "./tipos";

// Deixa o texto comparável: "Garantia  de 7 DIAS" e "garantia de 7 dias" viram iguais.
// NFD separa a letra do acento, e a regex remove só os acentos.
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Proteção contra citações inventadas: toda evidência precisa existir no texto.
// Se não existir, o código não confia e marca "nao_confirmado".
export function verificar(respostas: Resposta[], textoOriginal: string): Resposta[] {
  const textoNorm = normalizar(textoOriginal);

  return respostas.map((r) => {
    if (r.status === "ausente") return r;

    const evidenciaNorm = r.evidencia ? normalizar(r.evidencia) : "";
    // Evidência vazia também conta como não confirmada: afirmar sem citar não vale.
    if (evidenciaNorm === "" || !textoNorm.includes(evidenciaNorm)) {
      return { ...r, status: "nao_confirmado" };
    }
    return r;
  });
}
