import type { Metadata } from "next";
import { Inter, Geist, Funnel_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { MermaidInit } from "@/components/mermaid/MermaidInit";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
});

const funnel = Funnel_Sans({
  variable: "--font-funnel",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Folio",
  description: "Your personal markdown knowledge base with AI assistant.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geist.variable} ${funnel.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden">
        {children}
        <MermaidInit />
      </body>
    </html>
  );
}
