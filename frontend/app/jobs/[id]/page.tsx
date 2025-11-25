"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Download, Loader2, RefreshCw, Timer, Wand2 } from "lucide-react";
import { fetchCsvText, fetchLecture, LectureStatus, LectureStatusResponse, withBase } from "../../../lib/api";
import { StatusStepper } from "../../../components/status-stepper";
import { CardPreview } from "../../../components/card-preview";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { useToast } from "../../../components/ui/use-toast";
import { Flashcard, buildCsv, parseCsvCards } from "../../../lib/csv";
import { useJobHistory } from "../../../lib/history";
import { cn } from "../../../lib/utils";

const statusCopy: Record<LectureStatus, string> = {
  PENDING: "작업 대기열 등록 중...",
  RUNNING_STT: "ElevenLabs가 음성을 텍스트로 변환하고 있습니다...",
  RUNNING_LLM: "Gemini 3 Pro가 슬라이드와 녹취를 분석 중입니다...",
  GENERATING_CSV: "Anki 호환 CSV를 패킹하고 있습니다...",
  DONE: "완료",
  FAILED: "실패"
};

const playfulCopy: Record<LectureStatus, string> = {
  PENDING: "파일 무결성 확인 중 · 네트워크 최적화 적용",
  RUNNING_STT: "교수님의 농담을 필터링하면서 STT 품질을 높이는 중",
  RUNNING_LLM: "의학 용어 사전과 슬라이드 포맷을 대조 분석 중",
  GENERATING_CSV: "카드마다 한 개념만 담도록 정렬 중",
  DONE: "이제 Anki로 바로 가져올 수 있어요",
  FAILED: "다시 시도하거나 파일 형식을 확인해주세요"
};

const orderedStatuses: LectureStatus[] = [
  "PENDING",
  "RUNNING_STT",
  "RUNNING_LLM",
  "GENERATING_CSV",
  "DONE"
];

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

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetchLecture(jobId);
        if (!cancelled) {
          setData(res);
          if (res.status !== "FAILED") setError(null);
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
    const interval = setInterval(load, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId, push]);

  const downloadLink =
    data?.status === "DONE" && data.download_url ? withBase(data.download_url) : undefined;
  const statusText = data ? statusCopy[data.status] : "불러오는 중...";
  const funText = data ? playfulCopy[data.status] : "";
  const progress =
    data && data.status !== "FAILED"
      ? ((orderedStatuses.indexOf(data.status) + 1) / orderedStatuses.length) * 100
      : 0;

  const loadCsv = useCallback(async () => {
    if (!downloadLink) return;
    setLoadingCsv(true);
    try {
      const text = await fetchCsvText(downloadLink);
      setCsvText(text);
      const parsed = parseCsvCards(text);
      setCards(parsed);
      setActiveIndex(0);
    } catch (err) {
      toast({
        title: "CSV를 불러오지 못했습니다",
        description: (err as Error).message,
        variant: "destructive"
      });
    } finally {
      setLoadingCsv(false);
    }
  }, [downloadLink, toast]);

  useEffect(() => {
    if (data?.status === "DONE" && downloadLink && cards.length === 0 && !loadingCsv) {
      void loadCsv();
    }
  }, [data?.status, downloadLink, cards.length, loadingCsv, loadCsv]);

  const handleExport = () => {
    const csv = buildCsv(cards);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lecture-${jobId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV가 준비되었습니다", description: "수정 내용을 반영한 CSV를 내려받았습니다." });
  };

  const eta = useMemo(() => {
    if (!data) return "약 3~6분 소요";
    switch (data.status) {
      case "PENDING":
        return "대기열 진입 중 · 수십 초 이내 시작";
      case "RUNNING_STT":
        return "음성 길이에 따라 1~3분";
      case "RUNNING_LLM":
        return "슬라이드 페이지 수에 따라 1~2분";
      case "GENERATING_CSV":
        return "수 초 내 완료";
      default:
        return "";
    }
  }, [data]);

  const ready = data?.status === "DONE";
  const failed = data?.status === "FAILED";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-full bg-white/80 px-3 py-2 text-xs font-semibold text-teal-800 shadow-inner">
          Job ID: {jobId}
        </div>
        <Link href="/" className="text-sm text-teal-800 underline-offset-4 hover:underline">
          홈으로 돌아가기
        </Link>
      </div>

      <Card className="border-none bg-white/80">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-2xl font-bold text-slate-900">{statusText}</CardTitle>
            {funText && <p className="text-sm text-slate-500">{funText}</p>}
          </div>
          {eta && data?.status !== "DONE" && (
            <div className="flex items-center gap-2 rounded-full bg-white/80 px-3 py-2 text-xs text-slate-600 shadow-inner">
              <Timer className="h-4 w-4 text-teal-700" />
              {eta}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {!failed && (
            <>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn(
                    "h-full rounded-full bg-gradient-to-r from-teal-800 via-teal-600 to-teal-800 transition-all",
                    data?.status === "FAILED" && "bg-red-400"
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <StatusStepper current={data?.status} />
            </>
          )}

          {failed && (
            <div className="rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-800">
              처리 중 오류가 발생했습니다: {data?.error_message || error || "알 수 없는 오류"}
            </div>
          )}

          {!ready && !failed && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-4 text-sm text-slate-600 shadow-inner">
              <div className="flex items-center gap-2 text-slate-700">
                <Loader2 className="h-4 w-4 animate-spin text-teal-700" />
                {statusText}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                브라우저를 닫아도 작업은 계속됩니다. 최근 작업은 상단 네비게이션의 히스토리에서 확인할 수 있습니다.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {ready && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-none bg-white/80">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-slate-500">생성된 카드</p>
                <p className="text-2xl font-bold text-slate-900">
                  {data?.card_count ?? cards.length ?? 0}장
                </p>
              </div>
              <BadgeCheck className="h-8 w-8 text-teal-700" />
            </CardContent>
          </Card>
          <Card className="border-none bg-white/80">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-slate-500">제목/과목</p>
                <p className="text-base font-semibold text-slate-900">
                  {data?.title || data?.subject || "제목 없음"}
                </p>
                <p className="text-xs text-slate-500">{data?.professor || "교수명 미입력"}</p>
              </div>
              <Wand2 className="h-8 w-8 text-teal-700" />
            </CardContent>
          </Card>
          <Card className="border-none bg-white/80">
            <CardContent className="flex flex-col gap-3 p-5">
              <p className="text-sm font-semibold text-slate-900">다운로드</p>
              <div className="flex flex-wrap gap-2">
                {downloadLink && (
                  <Button asChild size="sm" variant="outline">
                    <a href={downloadLink} download>
                      <Download className="mr-1 h-4 w-4" />
                      원본 CSV
                    </a>
                  </Button>
                )}
                <Button size="sm" onClick={handleExport} disabled={!cards.length}>
                  수정 반영 CSV
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={loadCsv}
                  disabled={loadingCsv}
                  className="gap-1"
                >
                  <RefreshCw className={cn("h-4 w-4", loadingCsv && "animate-spin")} />
                  다시 불러오기
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {ready && (
        <Tabs defaultValue="preview">
          <TabsList>
            <TabsTrigger value="preview">카드 미리보기</TabsTrigger>
            <TabsTrigger value="raw">CSV 원문</TabsTrigger>
          </TabsList>
          <TabsContent value="preview">
            <CardPreview
              cards={cards}
              activeIndex={activeIndex}
              onChangeIndex={setActiveIndex}
              onEdit={(idx, field, value) =>
                setCards((prev) => prev.map((card, i) => (i === idx ? { ...card, [field]: value } : card)))
              }
              onRemove={(idx) => {
                setCards((prev) => prev.filter((_, i) => i !== idx));
                setActiveIndex((prevIdx) => Math.max(0, Math.min(prevIdx, cards.length - 2)));
              }}
            />
          </TabsContent>
          <TabsContent value="raw">
            <Card className="border-none bg-white/80">
              <CardContent className="p-4">
                <pre className="h-72 overflow-auto rounded-xl bg-slate-900/90 p-4 text-xs text-slate-100">
{csvText || "CSV를 불러오는 중입니다..."}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-800">
          {error}
        </div>
      )}
    </div>
  );
}
