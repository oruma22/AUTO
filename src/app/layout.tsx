import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Auto Streak App - Daily Build Challenges",
  description: "Stay consistent, build daily, and track your automation progress with AI-generated build challenges.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      style={{ height: '100%', margin: 0, padding: 0 }}
    >
      <body style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
