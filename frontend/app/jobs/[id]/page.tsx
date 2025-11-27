"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BrainCircuit,
  CheckCircle2,
  CircleDashed,
  Download,
  FileText,
  Layers,
  Loader2,
  Mic,
  NotebookPen,
  Sparkles
} from "lucide-react";

import { CardPreview } from "../../../components/card-preview";
import { JobRoadmap } from "../../../components/job-roadmap";
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
  RUNNING_ANKI: "Anki 생성 중",
  RUNNING_LLM: "텍스트 정제 중",
  GENERATING_CSV: "CSV 패킹 중",
  RUNNING_NOTES: "노트 작성 중",
  DONE: "완료",
  FAILED: "실패"
};

const iconMap: Partial<Record<LectureStatus, any>> = {
  RUNNING_STT: Mic,
  RUNNING_ANKI: Sparkles,
  RUNNING_LLM: BrainCircuit,
  GENERATING_CSV: Layers,
  RUNNING_NOTES: NotebookPen,
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
  const [pdfLoading, setPdfLoading] = useState(false);
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

  const generateCards = data?.generate_cards ?? true;
  const generateNotes = data?.generate_notes ?? false;
  const hasAudio = data?.has_audio ?? false;

  const csvDownloadPath = data?.csv_download_url || data?.download_url;
  const csvDownloadLink =
    data?.status === "DONE" && csvDownloadPath ? withBase(csvDownloadPath) : undefined;
  const pdfDownloadLink =
    data?.status === "DONE" && data?.note_pdf_url ? withBase(data.note_pdf_url) : undefined;

  const cardDone = generateCards && !!csvDownloadLink;
  const noteDone = generateNotes && !!data?.note_pdf_url;
  const cleanDone =
    data?.status === "DONE" ||
    ["RUNNING_ANKI", "RUNNING_LLM", "GENERATING_CSV", "RUNNING_NOTES"].includes(data?.status || "") ||
    cardDone ||
    noteDone;

  const loadCsv = useCallback(async () => {
    if (!csvDownloadLink) return null;
    setLoadingCsv(true);
    try {
      const text = await fetchCsvText(csvDownloadLink, adminPassword);
      setCsvText(text);
      setCards(parseCsvCards(text));
      setActiveIndex(0);
      return text;
    } catch (err) {
      toast({ title: "CSV를 불러오지 못했습니다", description: (err as Error).message, variant: "destructive" });
      return null;
    } finally {
      setLoadingCsv(false);
    }
  }, [adminPassword, csvDownloadLink, toast]);

  useEffect(() => {
    if (generateCards && data?.status === "DONE" && csvDownloadLink && cards.length === 0 && !loadingCsv) {
      void loadCsv();
    }
  }, [generateCards, data?.status, csvDownloadLink, cards.length, loadingCsv, loadCsv]);

  const handleExport = async () => {
    if (!generateCards || !csvDownloadLink) return;
    let exportCards = cards;
    let exportCsv = csvText;

    if (exportCards.length === 0 && !exportCsv) {
      const fetched = await loadCsv();
      exportCsv = fetched || "";
      if (exportCards.length === 0 && fetched) {
        exportCards = parseCsvCards(fetched);
      }
    }

    const payload = exportCards.length > 0 ? buildCsv(exportCards) : exportCsv;
    if (!payload) {
      toast({
        title: "CSV를 찾을 수 없습니다",
        description: "생성이 끝난 뒤 다시 시도해주세요.",
        variant: "destructive"
      });
      return;
    }

    const blob = new Blob([payload], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ankidude-${jobId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV가 준비되었습니다", description: "수정 내용을 반영한 CSV를 내려받았습니다." });
  };

  const handleDownloadPdf = async () => {
    if (!generateNotes || !pdfDownloadLink) return;
    setPdfLoading(true);
    const adminHeader = adminPassword || process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "";
    const headers: Record<string, string> = {};
    if (adminHeader) headers["X-Admin-Password"] = adminHeader;

    try {
      const res = await fetch(pdfDownloadLink, { headers });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "PDF 다운로드에 실패했습니다");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ankidude-${jobId}-notes.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF를 내려받았습니다", description: "필기 노트를 확인하세요." });
    } catch (err) {
      toast({
        title: "PDF를 불러오지 못했습니다",
        description: (err as Error).message,
        variant: "destructive"
      });
    } finally {
      setPdfLoading(false);
    }
  };

  const StatusIcon =
    iconMap[data?.status as LectureStatus] ||
    (data?.status === "DONE" ? CheckCircle2 : data?.status === "PENDING" ? CircleDashed : Loader2);
  const isProcessing = data
    ? ["PENDING", "RUNNING_STT", "RUNNING_ANKI", "RUNNING_LLM", "GENERATING_CSV", "RUNNING_NOTES"].includes(
        data.status
      )
    : true;

  return (
    <div className="mx-auto space-y-8">
      <div className="glass-panel flex flex-col gap-4 rounded-2xl px-6 py-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
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
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                {generateCards ? "Anki Flashcards" : "Anki Skipped"}
              </span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
                  generateNotes ? "bg-teal-100 text-teal-800" : "bg-slate-200 text-slate-700"
                )}
              >
                {generateNotes ? "PDF Notes" : "Notes Skipped"}
              </span>
              {!hasAudio && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                  No Audio
                </span>
              )}
            </div>
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
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
          Error: {error}
        </div>
      )}

      <JobRoadmap
        status={data?.status}
        currentStep={data?.current_step}
        generateCards={generateCards}
        generateNotes={generateNotes}
        hasAudio={hasAudio}
        cardDone={cardDone}
        noteDone={noteDone}
        cleanDone={cleanDone}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-2xl bg-white/70 p-6"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Total Cards</p>
          <p className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">
            {generateCards ? data?.card_count ?? cards.length ?? 0 : "-"}
          </p>
          {!generateCards && <p className="mt-1 text-xs text-slate-500">이 작업은 카드 생성을 건너뜀</p>}
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass-panel rounded-2xl bg-white/70 p-6"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Notes</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {generateNotes ? data?.note_page_count ?? 0 : "-"}
          </p>
          <p className="text-xs text-slate-500">
            {generateNotes ? "페이지 분량" : "노트 생성을 건너뜀"}
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-panel rounded-2xl bg-white/70 p-6"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Subject</p>
          <p className="mt-2 text-lg font-semibold text-slate-800 truncate">{data?.subject || "-"}</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-panel rounded-2xl bg-white/70 p-6"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Lecture Title</p>
          <p className="mt-2 text-lg font-semibold text-slate-800 truncate">{data?.title || "-"}</p>
        </motion.div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {generateCards ? (
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">Anki CSV 다운로드</p>
                <p className="text-xs text-slate-500">
                  {data?.status === "DONE"
                    ? `생성된 카드 ${data?.card_count ?? cards.length ?? 0}개`
                    : statusMap[data?.status || "PENDING"]}
                </p>
              </div>
              <Button
                size="sm"
                disabled={!csvDownloadLink || data?.status !== "DONE" || loadingCsv}
                onClick={() => void handleExport()}
                className="bg-slate-900 text-white hover:bg-slate-800"
              >
                {loadingCsv ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                CSV
              </Button>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <FileText className="h-4 w-4 text-slate-400" />
              <span>{csvDownloadLink ? "바로 import 가능한 CSV" : "완료되면 버튼이 활성화됩니다."}</span>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-500">
            Anki 카드 생성을 건너뛰었습니다.
          </div>
        )}

        {generateNotes ? (
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">강의 노트 PDF</p>
                <p className="text-xs text-slate-500">
                  {data?.status === "DONE" && pdfDownloadLink ? "필기 완료" : statusMap[data?.status || "PENDING"]}
                </p>
              </div>
              <Button
                size="sm"
                disabled={!pdfDownloadLink || data?.status !== "DONE" || pdfLoading}
                onClick={() => void handleDownloadPdf()}
                className="bg-teal-600 text-white shadow-teal-600/20 hover:bg-teal-700"
              >
                {pdfLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <NotebookPen className="mr-2 h-4 w-4" />
                )}
                PDF
              </Button>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <NotebookPen className="h-4 w-4 text-slate-400" />
              <span>{pdfDownloadLink ? "슬라이드 우측에 요약 노트 삽입 완료" : "완료되면 버튼이 활성화됩니다."}</span>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-4 text-sm text-slate-500">
            PDF 노트 생성을 건너뛰었습니다.
          </div>
        )}
      </div>

      {generateCards ? (
        data?.status === "DONE" ? (
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
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-5 text-sm text-slate-500">
            카드가 준비되면 미리보기가 표시됩니다.
          </div>
        )
      ) : null}
    </div>
  );
}
