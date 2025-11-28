"use client";

import { motion } from "framer-motion";
import { ArrowRight, Command, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { FileUploadZone } from "../components/file-upload-zone";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useToast } from "../components/ui/use-toast";
import { createLecture } from "../lib/api";
import { loadAdminPassword, saveAdminPassword } from "../lib/admin";
import { useJobHistory } from "../lib/history";
import { cn } from "../lib/utils";

type Step = 1 | 2;

export default function HomePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { push: pushHistory, items: history } = useJobHistory();

  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [slides, setSlides] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [adminPassword, setAdminPassword] = useState(loadAdminPassword());
  const [options, setOptions] = useState({ anki: true, notes: false });
  const [meta, setMeta] = useState({ title: "", subject: "", professor: "" });

  const canNext = !!slides;
  const canSubmit = !!slides && !!adminPassword && !loading && (options.anki || options.notes);

  useEffect(() => {
    if (!audio && options.notes) {
      setOptions((prev) => ({ ...prev, notes: false }));
    }
  }, [audio, options.notes]);

  const handleUpload = async () => {
    if (!slides) {
      toast({
        title: "슬라이드가 필요합니다",
        description: "PDF는 필수입니다. 오디오가 없으면 슬라이드만으로 진행합니다.",
        variant: "destructive"
      });
      setStep(1);
      return;
    }
    if (!options.anki && !options.notes) {
      toast({
        title: "실행할 작업을 선택하세요",
        description: "Anki 카드 또는 PDF 노트 중 하나 이상 선택해야 합니다.",
        variant: "destructive"
      });
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.append("slides_pdf", slides);
    if (audio) formData.append("audio_file", audio);
    formData.append("title", meta.title);
    formData.append("subject", meta.subject);
    formData.append("professor", meta.professor);
    formData.append("generate_cards", String(options.anki));
    formData.append("generate_notes", String(options.notes));

    try {
      const job = await createLecture(formData, adminPassword);
      saveAdminPassword(adminPassword);
      pushHistory({
        id: job.job_id,
        title: meta.title,
        subject: meta.subject,
        professor: meta.professor,
        cardCount: job.card_count,
        createdAt: new Date().toISOString()
      });
      router.push(`/jobs/${job.job_id}`);
    } catch (err) {
      toast({
        title: "업로드에 실패했습니다",
        description: (err as Error).message || "잠시 후 다시 시도해주세요.",
        variant: "destructive"
      });
      setLoading(false);
    }
  };

  const disableNotes = !audio;

  return (
    <div className="space-y-16">
      <section className="space-y-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50/80 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-teal-700 backdrop-blur-sm"
        >
          <Sparkles className="h-3 w-3" />
          <span>Automated Study Cards</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="text-5xl font-extrabold tracking-tight text-slate-900 md:text-6xl"
        >
          Slides in, cards and notes out.{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-br from-teal-600 to-teal-900">
            <br className="hidden md:block" />
            Add audio for sharper details.
          </span>
        </motion.h1>

        <p className="text-sm font-medium text-slate-500">PDF 필수 · 오디오는 선택 · Admin PW 필요</p>
      </section>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mx-auto max-w-3xl glass-panel rounded-3xl p-1 shadow-lg shadow-slate-200/50"
      >
        <div className="rounded-[20px] bg-white/70 p-6 md:p-8">
          <div className="mb-8 flex justify-center gap-2">
            <div
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-all",
                step === 1 ? "w-4 bg-teal-600" : "bg-slate-300"
              )}
            />
            <div
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-all",
                step === 2 ? "w-4 bg-teal-600" : "bg-slate-300"
              )}
            />
          </div>

          {step === 1 ? (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="grid gap-4 md:grid-cols-2">
                <FileUploadZone
                  label="Slide PDF"
                  description="필수 업로드"
                  accept={{ "application/pdf": [".pdf"] }}
                  file={slides}
                  onFile={setSlides}
                  onRemove={() => setSlides(null)}
                />
                <FileUploadZone
                  label="Lecture Audio"
                  description="선택 (있으면 STT 보정)"
                  accept={{ "audio/*": [] }}
                  file={audio}
                  onFile={setAudio}
                  onRemove={() => setAudio(null)}
                />
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-inner">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">무엇을 만들까요?</p>
                    <p className="text-xs text-slate-500">
                      Anki 카드와 강의 노트를 독립적으로 실행할 수 있습니다.
                    </p>
                  </div>
                  <div className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm">
                    {options.anki && options.notes
                      ? "Both Selected"
                      : options.anki
                        ? "Anki Only"
                        : options.notes
                          ? "Notes Only"
                          : "Select Task"}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200/80 bg-white/60 px-3 py-3 text-sm text-slate-800 shadow-sm transition hover:border-teal-500/50">
                    <input
                      type="checkbox"
                      checked={options.anki}
                      onChange={(e) => setOptions((prev) => ({ ...prev, anki: e.target.checked }))}
                      className="mt-1 h-4 w-4 accent-teal-600"
                    />
                    <div>
                      <p className="font-semibold text-slate-900">Anki Flashcards</p>
                      <p className="text-xs text-slate-500">시험 대비 Q&A CSV (기본 선택)</p>
                    </div>
                  </label>

                  <label
                    className={cn(
                      "flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white/60 px-3 py-3 text-sm text-slate-800 shadow-sm transition",
                      disableNotes ? "opacity-60" : "hover:border-teal-500/50"
                    )}
                  >
                    <input
                      type="checkbox"
                      disabled={disableNotes}
                      checked={!disableNotes && options.notes}
                      onChange={(e) => setOptions((prev) => ({ ...prev, notes: e.target.checked }))}
                      className="mt-1 h-4 w-4 accent-teal-600 disabled:cursor-not-allowed"
                    />
                    <div>
                      <p className="font-semibold text-slate-900">PDF Lecture Notes</p>
                      <p className="text-xs text-slate-500">
                        {disableNotes ? "오디오 업로드 시 활성화" : "슬라이드 우측에 요약 노트 삽입"}
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-2 md:col-span-2">
                <Label className="text-sm font-semibold text-slate-700">Admin Password</Label>
                <Input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="bg-white/80"
                  placeholder="필요 시 입력"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">Subject</Label>
                <Input
                  placeholder="e.g. Neurology"
                  value={meta.subject}
                  onChange={(e) => setMeta({ ...meta, subject: e.target.value })}
                  className="bg-white/80"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-700">Professor</Label>
                <Input
                  placeholder="e.g. Prof. Kim"
                  value={meta.professor}
                  onChange={(e) => setMeta({ ...meta, professor: e.target.value })}
                  className="bg-white/80"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="text-sm font-semibold text-slate-700">Lecture Title</Label>
                <Input
                  placeholder="e.g. Stroke Management"
                  value={meta.title}
                  onChange={(e) => setMeta({ ...meta, title: e.target.value })}
                  className="bg-white/80"
                />
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            {step === 2 ? (
              <Button variant="ghost" onClick={() => setStep(1)} className="text-slate-500">
                이전 단계
              </Button>
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Command className="h-3 w-3" />
                <span>PDF required · Audio optional</span>
              </div>
            )}

            {step === 1 ? (
              <Button
                disabled={!canNext}
                onClick={() => setStep(2)}
                className="rounded-xl bg-slate-900 px-6 text-white shadow-md hover:bg-slate-800"
              >
                다음 단계 <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                disabled={!canSubmit}
                onClick={handleUpload}
                className="rounded-xl bg-teal-600 px-8 text-white shadow-lg shadow-teal-600/20 hover:bg-teal-700"
              >
                {loading ? "업로드 중..." : "카드 생성하기"}
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">최근 작업</h3>
          <p className="text-xs text-slate-500">브라우저 LocalStorage에 저장됩니다</p>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">아직 저장된 작업이 없습니다. 업로드 후 이곳에 나타납니다.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {history.slice(0, 6).map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-white/60 bg-white/80 px-3 py-2 text-sm text-slate-700 shadow-inner"
              >
                <div className="flex flex-col">
                  <span className="font-semibold text-slate-900">
                    {item.title || item.subject || item.id.slice(0, 8)}
                  </span>
                  <span className="text-xs text-slate-500">
                    {item.professor || "익명"} · {new Date(item.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => router.push(`/jobs/${item.id}`)}
                >
                  열기
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
