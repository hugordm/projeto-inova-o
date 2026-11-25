import { processarReescrita } from "@/lib/reescrever";

// Mesmo teto das outras rotas (segundos). A IA tem 25 s numa chamada só.
export const maxDuration = 30;
export const dynamic = "force-dynamic";

// POST /api/reescrever: toda a lógica está em src/lib/reescrever.ts.
export function POST(req: Request) {
  return processarReescrita(req);
}
