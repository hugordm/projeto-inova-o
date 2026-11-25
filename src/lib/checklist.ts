import type { ItemChecklist, Tipo } from "./tipos";

// Fontes repetidas em vários itens ficam em constantes para não divergirem.
const FAQ = "FAQ YouShop, youshop.co/faq (consultado em 24/11/2026)";
const BLOG =
  'Blog YouShop, "Chargeback: o que é e como reduzir", blog.youshop.co (consultado em 25/11/2026)';

// Regras de exemplo. Todas as regex enxergam o texto já normalizado:
// minúsculas e sem acentos (ex.: "Vitalício" vira "vitalicio").
// Sem a flag "g" de propósito: ela guarda estado entre chamadas e causaria erros.
export const CHECKLIST: ItemChecklist[] = [
  {
    id: "prazo_acesso",
    titulo: "Prazo de acesso",
    pergunta: "Por quanto tempo terei acesso ao conteúdo?",
    aplicaA: ["digital", "assinatura"],
    fonte: `${FAQ}: o prazo de acesso varia conforme o vendedor.`,
    modelo: "Acesso por [N] meses a partir da compra.",
    palavrasFortes: [
      /vitalici/,
      /ilimitad/,
      /\d+\s*(dias?|mes|meses|anos?)\s+de\s+acesso/,
      /acesso\s+(por|durante|ate)\s+\d+/,
    ],
    palavrasFracas: [/acesso\s+imediato/, /acesso\s+liberado/, /acesso\s+por\s+e-?mail/],
  },
  {
    id: "certificado",
    titulo: "Certificado",
    pergunta: "O curso emite certificado?",
    aplicaA: ["digital"],
    fonte: `${FAQ}: a emissão de certificado depende do criador do conteúdo.`,
    modelo: "Certificado de conclusão [incluso / não incluso].",
    palavrasFortes: [
      /certificado\s+(de\s+conclusao|incluso|digital)/,
      /\b(com|sem|inclui|emite)\s+certificado/,
      /nao\s+emite\s+certificado/,
    ],
    palavrasFracas: [/certificad/],
  },
  {
    id: "prazo_entrega",
    titulo: "Prazo de entrega",
    pergunta: "Em quantos dias o produto chega?",
    aplicaA: ["fisico"],
    fonte: `${FAQ}: a entrega depende do vendedor. ${BLOG}: dúvidas de entrega geram contestações.`,
    modelo: "Prazo de entrega: [N] dias úteis após a confirmação do pagamento.",
    palavrasFortes: [
      /prazo\s+de\s+entrega/,
      /entrega\s+(em|ate|prevista)/,
      /enviamos\s+em/,
      /\d+\s+dias\s+uteis/,
    ],
    palavrasFracas: [/\bfrete/, /\bentrega/, /\benvio/],
  },
  {
    id: "garantia",
    titulo: "Garantia e reembolso",
    pergunta: "Se eu não gostar, posso pedir reembolso? Em quanto tempo?",
    aplicaA: ["digital", "fisico", "assinatura"],
    fonte: `${BLOG}: política de troca e reembolso clara reduz chargeback. ${FAQ}.`,
    modelo: "Garantia de [N] dias. Para pedir reembolso, [como solicitar].",
    palavrasFortes: [
      /garantia\s+de\s+\d+/,
      /\d+\s+dias\s+de\s+garantia/,
      /reembolso\s+(em|ate|integral)/,
      /devolucao\s+(em|ate)/,
      /direito\s+de\s+arrependimento/,
    ],
    palavrasFracas: [/garantia/, /reembolso/, /devolucao/, /arrependimento/],
  },
  {
    id: "renovacao_cancelamento",
    titulo: "Renovação e cancelamento",
    pergunta: "Como cancelo? Serei avisado antes da renovação?",
    aplicaA: ["assinatura"],
    fonte: `${BLOG}: avisar antes da renovação e permitir cancelamento simples.`,
    modelo: "Renovação [mensal/anual]. Cancele a qualquer momento em [onde].",
    palavrasFortes: [
      /cancel\w*\s+(a\s+qualquer\s+momento|quando\s+quiser|sem\s+multa)/,
      /aviso\s+antes\s+da\s+renovacao/,
    ],
    palavrasFracas: [/renov/, /cancel/, /recorrent/, /cobranca/],
  },
  {
    id: "conteudo_incluso",
    titulo: "O que está incluso",
    pergunta: "O que exatamente eu recebo, e em que quantidade?",
    aplicaA: ["digital", "fisico", "assinatura"],
    fonte: `${FAQ}: há dúvidas frequentes sobre a quantidade recebida.`,
    modelo: "O que está incluso: [lista e quantidade].",
    palavrasFortes: [
      /\d+\s+(aulas?|modulos?|videos?|e-?books?|unidades?|itens|item|produtos?|horas?)\b/,
      /\binclui\b/,
      /\bincluso/,
      /\bacompanha\b/,
      /voce\s+recebe/,
    ],
    palavrasFracas: [/\bconteudo/, /\bmaterial/, /\bkit\b/],
  },
  {
    id: "funcionamento",
    titulo: "Como funciona",
    pergunta: "Como funciona / como eu uso depois de comprar?",
    aplicaA: ["digital", "fisico", "assinatura"],
    fonte: `${FAQ}: dúvidas sobre o funcionamento do produto são encaminhadas ao vendedor.`,
    modelo: "Como funciona: [passo a passo curto].",
    palavrasFortes: [
      /como\s+funciona/,
      /como\s+usar/,
      /passo\s+a\s+passo/,
      /modo\s+de\s+uso/,
      /voce\s+aprende/,
      /(apos|depois)\s+(a|da)\s+compra/,
    ],
    palavrasFracas: [/\bfunciona/, /\bmetodo/],
  },
  {
    id: "contato_vendedor",
    titulo: "Contato do vendedor",
    pergunta: "Com quem eu falo se tiver dúvida ou problema?",
    aplicaA: ["digital", "fisico", "assinatura"],
    fonte: `${FAQ}: o primeiro contato para dúvidas é o vendedor.`,
    modelo: "Dúvidas? Fale conosco por [WhatsApp/e-mail].",
    palavrasFortes: [
      /whatsapp/,
      /fale\s+com/,
      /suporte@/,
      /contato@/,
      /duvidas\s+(pelo|pela|via|por)/,
      /canal\s+de\s+atendimento/,
    ],
    palavrasFracas: [/\bsuporte\b/, /\batendimento\b/, /\bcontato\b/],
  },
];

// Quem decide QUAIS perguntas valem para cada tipo é este código, nunca a IA.
// Assim a IA (Passo 2) não pode "esquecer" ou inventar itens.
export function itensPara(tipo: Tipo): ItemChecklist[] {
  return CHECKLIST.filter((item) => item.aplicaA.includes(tipo));
}
