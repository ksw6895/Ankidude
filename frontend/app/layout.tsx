import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "../components/navbar";
import { Toaster } from "../components/ui/toaster";

export const metadata: Metadata = {
  title: "Ankidude | Slide + Audio → Anki CSV",
  description: "Upload lecture slides and audio to generate ready-to-import Anki cards."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen text-slate-900">
        <div className="bg-noise" />
        <Navbar />
        <main className="mx-auto max-w-5xl px-6 pb-20 pt-16 md:pt-24">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
