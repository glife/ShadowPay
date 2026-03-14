import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { CyberParticles } from "@/components/CyberParticles";
import { HeyElsaChatWidget } from "@heyelsa/chat-widget";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hey Elsa | Agentic Workflow Architecture",
  description: "Decentralized agentic economy gateway and middleware orchestrator.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased selection:bg-[#627EEA]/30`}
      >
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 lg:ml-64 ml-16 w-full relative">
            <CyberParticles />
            {children}
            <HeyElsaChatWidget keyId="local-elsa" dappName="Hey Elsa" />
          </div>
        </div>
      </body>
    </html>
  );
}
