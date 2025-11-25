import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ankidude | Slide + Audio → Anki CSV",
  description: "Upload lecture slides and audio to generate ready-to-import Anki cards."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
