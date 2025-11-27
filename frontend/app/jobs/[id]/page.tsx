"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BrainCircuit, CheckCircle2, CircleDashed, Download, Layers, Loader2, Mic } from "lucide-react";

import { CardPreview } from "../../../components/card-preview";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { useToast } from "../../../components/ui/use-toast";
import { Flashcard, buildCsv, parseCsvCards } from "../../../lib/csv";
import { useJobHistory } from "../../../lib/history";
import { fetchCsvText, fetchLecture, LectureStatus, LectureStatusResponse, withBase } from "../../../lib/api";
import { cn } from "../../../lib/utils";
import { loadAdminPassword, saveAdminPassword } from "../../../lib/admin";

const statusMap: Record<LectureStatus, string> = {
  PENDING: "대기 중",
  RUNNING_STT: "음성 처리 중",
  RUNNING_LLM: "내용 분석 중",
  GENERATING_CSV: "마무리 중",
  DONE: "완료",
  FAILED: "실패"
};

const iconMap: Partial<Record<LectureStatus, any>> = {
  RUNNING_STT: Mic,
  RUNNING_LLM: BrainCircuit,
  GENERATING_CSV: Layers,
  DONE: CheckCircle2
};

export default function JobPage() {
  const params = useParams<{ id: string }>();
  const jobId = params?.id;
  const { toast } = useToast();
  const { push } = useJobHistory();

  const [data, setData] = useState<LectureStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string>("");
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadingCsv, setLoadingCsv] = useState(false);
  const [adminPassword, setAdminPassword] = useState(loadAdminPassword());

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetchLecture(jobId, adminPassword);
        if (!cancelled) {
          setData(res);
          if (res.status === "FAILED") setError(res.error_message || "Unknown error");
          else setError(null);
          push({
            id: res.job_id,
            title: res.title,
            subject: res.subject,
            professor: res.professor,
            cardCount: res.card_count,
            createdAt: res.created_at
          });
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    };
    load();
    const interval = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId, adminPassword, push]);

  const downloadLink =
    data?.status === "DONE" && data.download_url ? withBase(data.download_url) : undefined;

  const loadCsv = useCallback(async () => {
    if (!downloadLink) return;
    setLoadingCsv(true);
    try {
      const text = await fetchCsvText(downloadLink, adminPassword);
      setCsvText(text);
      setCards(parseCsvCards(text));
      setActiveIndex(0);
    } catch (err) {
      toast({ title: "CSV를 불러오지 못했습니다", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoadingCsv(false);
    }
  }, [adminPassword, downloadLink, toast]);

  useEffect(() => {
    if (data?.status === "DONE" && downloadLink && cards.length === 0 && !loadingCsv) {
      void loadCsv();
    }
  }, [data?.status, downloadLink, cards.length, loadingCsv, loadCsv]);

  const handleExport = () => {
    const blob = new Blob([buildCsv(cards)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ankidude-${jobId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV가 준비되었습니다", description: "수정 내용을 반영한 CSV를 내려받았습니다." });
  };

  const StatusIcon =
    iconMap[data?.status as LectureStatus] ||
    (data?.status === "PENDING" ? CircleDashed : Loader2);
  const isProcessing = data
    ? ["PENDING", "RUNNING_STT", "RUNNING_LLM", "GENERATING_CSV"].includes(data.status)
    : true;

  return (
    <div className="mx-auto space-y-8">
      <div className="glass-panel flex flex-col gap-4 rounded-2xl px-6 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-2xl transition-colors",
              data?.status === "DONE" ? "bg-teal-100 text-teal-700" : "bg-white text-slate-400",
              isProcessing && "bg-indigo-50 text-indigo-600"
            )}
          >
            <StatusIcon className={cn("h-6 w-6", isProcessing && "animate-spin")} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              {statusMap[data?.status || "PENDING"]}
            </h1>
            <p className="mt-0.5 text-xs font-medium uppercase tracking-wider text-slate-400">
              Job: {jobId?.slice(0, 8)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-600">
            <Label className="text-[11px] uppercase tracking-[0.1em] text-slate-500">Admin PW</Label>
            <Input
              type="password"
              className="h-8 w-36 border-0 bg-transparent px-2 text-xs"
              value={adminPassword}
              onChange={(e) => {
                setAdminPassword(e.target.value);
                saveAdminPassword(e.target.value);
              }}
              placeholder="required"
            />
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">새 작업</Link>
          </Button>
          {data?.status === "DONE" && (
            <Button onClick={handleExport} size="sm" className="bg-slate-900 text-white hover:bg-slate-800">
              <Download className="mr-2 h-4 w-4" /> CSV 다운로드
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          Error: {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-2xl bg-white/70 p-6"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Total Cards</p>
          <p className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">
            {data?.card_count ?? cards.length ?? 0}
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass-panel rounded-2xl bg-white/70 p-6"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Subject</p>
          <p className="mt-2 text-lg font-semibold text-slate-800 truncate">{data?.subject || "-"}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-panel rounded-2xl bg-white/70 p-6"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Lecture Title</p>
          <p className="mt-2 text-lg font-semibold text-slate-800 truncate">{data?.title || "-"}</p>
        </motion.div>
      </div>

      {data?.status === "DONE" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
          <Tabs defaultValue="preview" className="w-full">
            <div className="mb-4 flex items-center justify-between px-1">
              <TabsList className="border border-white/40 bg-white/50">
                <TabsTrigger value="preview" className="text-xs">
                  Preview
                </TabsTrigger>
                <TabsTrigger value="raw" className="text-xs">
                  Raw CSV
                </TabsTrigger>
              </TabsList>
              <span className="text-xs font-medium text-slate-400">
                {activeIndex + 1} / {cards.length || 0}
              </span>
            </div>
            <TabsContent value="preview" className="mt-0">
              <CardPreview
                cards={cards}
                activeIndex={activeIndex}
                onChangeIndex={setActiveIndex}
                onEdit={(idx, field, val) =>
                  setCards((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: val } : c)))
                }
                onRemove={(idx) => {
                  const nextLength = Math.max(0, cards.length - 1);
                  setCards((prev) => prev.filter((_, i) => i !== idx));
                  setActiveIndex((prev) => Math.max(0, Math.min(prev, nextLength - 1)));
                }}
              />
            </TabsContent>
            <TabsContent value="raw" className="mt-0">
              <div className="glass-panel rounded-2xl p-4">
                <pre className="h-96 overflow-auto rounded-xl bg-slate-900 p-4 text-xs font-mono leading-relaxed text-slate-300">
                  {csvText}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>
      )}
    </div>
  );
}
