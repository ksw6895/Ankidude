"use client";

import Link from "next/link";
import { ArrowUpRight, Github, History } from "lucide-react";
import { Button } from "./ui/button";
import { useJobHistory } from "../lib/history";
import { cn } from "../lib/utils";

export function Navbar() {
  const { items } = useJobHistory();

  return (
    <header className="sticky top-0 z-30 w-full border-b border-white/40 bg-white/60 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 md:px-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-800 to-teal-600 text-white shadow-card">
            <span className="text-lg font-bold">A</span>
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-900">Ankidude</p>
            <p className="text-xs text-slate-500">Slide + Audio → Anki</p>
          </div>
        </Link>

        <div className="flex items-center gap-2 text-sm">
          <div className={cn("hidden items-center gap-2 rounded-full bg-white/80 px-3 py-2 shadow-inner sm:flex")}>
            <History className="h-4 w-4 text-teal-700" />
            {items.length > 0 ? (
              <div className="flex items-center gap-2">
                {items.slice(0, 3).map((item) => (
                  <Link
                    key={item.id}
                    href={`/jobs/${item.id}`}
                    className="rounded-lg px-2 py-1 text-xs text-slate-700 underline-offset-4 hover:underline"
                  >
                    {item.title || item.subject || item.id.slice(0, 6)}
                  </Link>
                ))}
              </div>
            ) : (
              <span className="text-xs text-slate-500">최근 작업 없음</span>
            )}
          </div>
          <Button asChild variant="outline" size="sm" className="hidden sm:flex">
            <a href="https://github.com/ksw6895/Ankidude" target="_blank" rel="noreferrer">
              <Github className="mr-1 h-4 w-4" />
              GitHub
            </a>
          </Button>
          <Button asChild size="sm">
            <Link href="/#upload">
              시작하기
              <ArrowUpRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
