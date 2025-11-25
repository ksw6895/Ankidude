"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, GripHorizontal, Sparkles, Trash } from "lucide-react";

import { Flashcard } from "../lib/csv";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Input } from "./ui/input";

type Props = {
  cards: Flashcard[];
  activeIndex: number;
  onChangeIndex: (index: number) => void;
  onEdit: (index: number, field: keyof Flashcard, value: string) => void;
  onRemove: (index: number) => void;
};

export function CardPreview({ cards, activeIndex, onChangeIndex, onEdit, onRemove }: Props) {
  const [flipped, setFlipped] = useState(false);
  const active = cards[activeIndex];
  const progress = cards.length ? ((activeIndex + 1) / cards.length) * 100 : 0;
  const stats = useMemo(
    () => ({
      total: cards.length,
      tags: new Set(cards.map((c) => c.tag?.trim()).filter(Boolean)).size
    }),
    [cards]
  );

  return (
    <Card className="border-none bg-white/70">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-lg text-slate-900">카드 미리보기 & 빠른 수정</CardTitle>
          <p className="text-sm text-slate-500">
            Anki에서 보이는 앞/뒷면 그대로 확인하고, 마음에 안 드는 문구는 바로 고치세요.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 shadow-inner">
            <Sparkles className="h-4 w-4 text-teal-700" />
            {stats.total} cards
          </span>
          <span className="hidden items-center gap-2 rounded-full bg-white/70 px-3 py-1 shadow-inner md:flex">
            <GripHorizontal className="h-4 w-4 text-slate-500" />
            {stats.tags} tags
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-800 via-teal-600 to-teal-800 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        {active ? (
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div
              className="relative min-h-[240px] cursor-pointer overflow-hidden rounded-2xl border border-white/60 bg-white/80 p-5 shadow-card"
              onClick={() => setFlipped((v) => !v)}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={flipped ? "back" : "front"}
                  initial={{ opacity: 0, rotateY: -10 }}
                  animate={{ opacity: 1, rotateY: 0 }}
                  exit={{ opacity: 0, rotateY: 10 }}
                  transition={{ duration: 0.25 }}
                  className="absolute inset-0 p-2"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    {flipped ? "Back" : "Front"}
                  </p>
                  <p className="mt-3 text-lg font-semibold text-slate-900 leading-relaxed">
                    {flipped ? active.back || "뒷면이 비어 있습니다." : active.front || "앞면이 비어 있습니다."}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="mb-2 block text-slate-600">앞면</Label>
                <Input
                  value={active.front}
                  onChange={(e) => onEdit(activeIndex, "front", e.target.value)}
                  className="min-h-[48px] bg-white/90"
                  placeholder="질문/앞면 텍스트"
                />
              </div>
              <div>
                <Label className="mb-2 block text-slate-600">뒷면</Label>
                <textarea
                  value={active.back}
                  onChange={(e) => onEdit(activeIndex, "back", e.target.value)}
                  className="w-full rounded-xl border border-white/60 bg-white/90 p-3 text-sm text-slate-900 shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                  rows={4}
                  placeholder="답변/뒷면 텍스트"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm text-slate-500">
                  {activeIndex + 1} / {cards.length}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={cards.length <= 1}
                    onClick={() => onRemove(activeIndex)}
                  >
                    <Trash className="h-4 w-4" />
                    삭제
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={activeIndex === 0}
                    onClick={() => onChangeIndex(Math.max(0, activeIndex - 1))}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    이전
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={activeIndex >= cards.length - 1}
                    onClick={() => onChangeIndex(Math.min(cards.length - 1, activeIndex + 1))}
                  >
                    다음
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-center text-sm text-slate-500">
            CSV를 불러오면 카드가 여기에 표시됩니다.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
