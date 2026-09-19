import type { Metadata } from "next";
import { Providers } from "./providers";
import "@inspectai/ui/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "InspectAI — Property Inspections Without the Guesswork",
  description:
    "InspectAI helps landlords capture property evidence, review findings and manage inspection decisions with confidence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
