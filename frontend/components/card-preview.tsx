"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Trash2 } from "lucide-react";

import { Flashcard } from "../lib/csv";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

type Props = {
  cards: Flashcard[];
  activeIndex: number;
  onChangeIndex: (index: number) => void;
  onEdit: (index: number, field: keyof Flashcard, value: string) => void;
  onRemove: (index: number) => void;
};

export function CardPreview({ cards, activeIndex, onChangeIndex, onEdit, onRemove }: Props) {
  const [showBack, setShowBack] = useState(false);
  const active = cards[activeIndex];

  if (!active) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div
        className="group relative flex aspect-[1.6/1] min-h-[360px] cursor-pointer flex-col items-center justify-center rounded-[32px] border border-white/60 bg-white p-10 shadow-sm transition-all hover:shadow-md active:scale-[0.99] select-none"
        onClick={() => setShowBack(!showBack)}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={showBack ? "back" : "front"}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="flex h-full w-full flex-col items-center justify-center text-center"
          >
            <span
              className={cn(
                "mb-6 inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider",
                showBack ? "bg-indigo-50 text-indigo-600" : "bg-teal-50 text-teal-700"
              )}
            >
              {showBack ? "Answer" : "Question"}
            </span>

            <p
              className={cn(
                "max-w-2xl whitespace-pre-wrap leading-relaxed text-slate-800",
                showBack ? "text-lg font-medium text-slate-700" : "text-2xl font-bold"
              )}
            >
              {showBack ? active.back : active.front}
            </p>
          </motion.div>
        </AnimatePresence>

        <p className="absolute bottom-8 text-[10px] font-medium uppercase tracking-widest text-slate-300 transition-opacity group-hover:text-slate-400">
          Click to Flip
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-2xl border border-white/40 bg-white/60 p-2 shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-xl"
            disabled={activeIndex === 0}
            onClick={() => {
              setShowBack(false);
              onChangeIndex(activeIndex - 1);
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="font-mono text-xs font-bold text-slate-500">
            {String(activeIndex + 1).padStart(2, "0")} / {String(cards.length).padStart(2, "0")}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-xl"
            disabled={activeIndex === cards.length - 1}
            onClick={() => {
              setShowBack(false);
              onChangeIndex(activeIndex + 1);
            }}
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-4 rounded-3xl border border-white/40 bg-white/40 p-6 backdrop-blur-md">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Front</label>
            <textarea
              className="w-full resize-none rounded-xl border-0 bg-white/70 p-3 text-sm font-medium text-slate-800 shadow-sm ring-1 ring-slate-200 placeholder:text-slate-300 focus:ring-2 focus:ring-teal-500"
              rows={3}
              value={active.front}
              onChange={(e) => onEdit(activeIndex, "front", e.target.value)}
              placeholder="질문 입력..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Back</label>
            <textarea
              className="w-full resize-none rounded-xl border-0 bg-white/70 p-3 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200 placeholder:text-slate-300 focus:ring-2 focus:ring-indigo-500"
              rows={5}
              value={active.back}
              onChange={(e) => onEdit(activeIndex, "back", e.target.value)}
              placeholder="답변 입력..."
            />
          </div>
          <div className="pt-2">
            <Button
              variant="ghost"
              className="w-full justify-start rounded-lg px-3 py-2 text-xs text-red-400 hover:bg-red-50 hover:text-red-600"
              onClick={() => onRemove(activeIndex)}
            >
              <Trash2 className="mr-2 h-3 w-3" /> Delete Card
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
