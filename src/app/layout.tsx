import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Antes que Perguntem",
  description: "Revisa a descrição do produto antes de ir ao ar e mostra o que falta para o comprador.",
};

// Moldura comum a todas as páginas (aqui só existe uma).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
