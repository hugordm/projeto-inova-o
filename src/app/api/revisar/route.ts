import { processarRevisao } from "@/lib/revisar";
import { iaConfigurada } from "@/lib/analisarComIA";

// Tempo máximo da rota na hospedagem (segundos). A IA tem 20 s; sobra para o fallback.
export const maxDuration = 30;
// Lê o ambiente a cada pedido (não congela a resposta do GET no build).
export const dynamic = "force-dynamic";

// POST /api/revisar: toda a lógica está em src/lib/revisar.ts.
export function POST(req: Request) {
  return processarRevisao(req);
}

// GET /api/revisar: só diz à tela se a IA está disponível (nunca a chave ou o modelo).
export function GET() {
  return Response.json({ iaDisponivel: iaConfigurada() });
}
