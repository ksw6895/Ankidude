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
      <body className="mesh min-h-screen text-slate-900">
        <div className="fixed inset-0 -z-10 bg-[radial-gradient(120%_120%_at_10%_20%,rgba(20,156,144,0.12),transparent_40%),radial-gradient(100%_80%_at_80%_0%,rgba(100,116,139,0.12),transparent_42%),radial-gradient(90%_70%_at_40%_70%,rgba(15,118,110,0.08),transparent_40%),linear-gradient(145deg,#f7f7f3,#eef2f7,#f9fafb)]" />
        <Navbar />
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-10 md:px-8">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
