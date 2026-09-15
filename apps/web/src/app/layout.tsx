import type { Metadata } from "next";
import { Providers } from "./providers";
import "@inspectai/ui/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "InspectAI — Landlord",
  description: "Professional property inspection platform for landlords",
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
