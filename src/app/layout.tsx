import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FormBot — AI Service Assistant",
  description: "WhatsApp Seva Kendra management portal: applications, operator tasks, payments, services config.",
  keywords: ["CSC", "WhatsApp", "Admin Portal", "Seva Kendra"],
  authors: [{ name: "CSC Smart Seva" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "FormBot — AI Service Assistant",
    description: "WhatsApp Seva Kendra management portal",
    url: "https://chat.z.ai",
    siteName: "CSC Smart Seva",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FormBot — AI Service Assistant",
    description: "WhatsApp Seva Kendra management portal",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
