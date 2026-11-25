// Tipos compartilhados entre a análise, a verificação, a rota e a tela.
// Ficam num arquivo só para que a análise com IA e a sem IA usem exatamente o mesmo formato.

export type Tipo = "digital" | "fisico" | "assinatura";

export const TIPOS: Tipo[] = ["digital", "fisico", "assinatura"];

// "nao_confirmado" nunca vem da análise por palavras-chave. Quem o atribui é a verificação
// (citação que não existe no texto) e analisarComIA (item que a IA não devolveu).
export type Status = "respondido" | "ausente" | "ambiguo" | "nao_confirmado";

export type Resposta = {
  id: string;
  status: Status;
  // A frase do texto que justifica o status (null quando nada foi encontrado).
  evidencia: string | null;
};

export type ItemChecklist = {
  id: string;
  titulo: string;
  pergunta: string;
  aplicaA: Tipo[];
  // De onde veio a ideia de que essa informação importa ao comprador.
  fonte: string;
  // Frase pronta para o vendedor completar quando o item está "ausente".
  // Os trechos entre colchetes são campos a preencher, ex.: "[N] dias".
  modelo: string;
  // Testadas sobre texto normalizado (minúsculas, sem acentos).
  palavrasFortes: RegExp[];
  palavrasFracas?: RegExp[];
};
