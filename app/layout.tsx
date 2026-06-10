import type { ReactNode } from "react";

export const metadata = {
  title: "Open MCP Knowledgebase",
  description: "A zero-database MCP knowledgebase template for Vercel.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
