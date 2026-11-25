// Tipos compartilhados entre a análise, a verificação, a rota e a tela.
// Ficam num arquivo só para que o Passo 2 (IA) use exatamente o mesmo formato.

export type Tipo = "digital" | "fisico" | "assinatura";

export const TIPOS: Tipo[] = ["digital", "fisico", "assinatura"];

// "nao_confirmado" nunca vem da análise: só a verificação pode atribuí-lo.
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
