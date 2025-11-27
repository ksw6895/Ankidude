"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BadgeCheck, Clock3, ShieldCheck, Sparkles, UploadCloud } from "lucide-react";
import { createLecture } from "../lib/api";
import { loadAdminPassword, saveAdminPassword } from "../lib/admin";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { FileUploadZone } from "../components/file-upload-zone";
import { useToast } from "../components/ui/use-toast";
import { useJobHistory } from "../lib/history";
import { cn } from "../lib/utils";

const features = [
  {
    title: "Medical-grade STT (선택)",
    desc: "오디오를 주면 ElevenLabs Scribe v1로 의료 용어를 놓치지 않습니다.",
    icon: <ShieldCheck className="h-5 w-5 text-teal-700" />
  },
  {
    title: "Gemini 3 Pro QC",
    desc: "슬라이드와 transcript를 교차 검증해 환각을 줄입니다.",
    icon: <Sparkles className="h-5 w-5 text-teal-700" />
  },
  {
    title: "Anki-ready CSV",
    desc: "#separator:Semicolon 헤더 포함, 바로 Import 가능.",
    icon: <BadgeCheck className="h-5 w-5 text-teal-700" />
  }
];

type Step = 1 | 2;

export default function HomePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { push, items: history } = useJobHistory();

  const [step, setStep] = useState<Step>(1);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [professor, setProfessor] = useState("");
  const [slides, setSlides] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [adminPassword, setAdminPassword] = useState(loadAdminPassword());
  const [loading, setLoading] = useState(false);

  const canNext = !!slides;
  const canSubmit = !!slides && !loading;

  const handleSubmit = async () => {
    if (!slides) {
      toast({
        title: "슬라이드 PDF가 필요합니다",
        description: "슬라이드만으로도 카드 생성이 가능합니다.",
        variant: "destructive"
      });
      setStep(1);
      return;
    }
    setLoading(true);
    const formData = new FormData();
    formData.append("title", title);
    formData.append("subject", subject);
    formData.append("professor", professor);
    formData.append("slides_pdf", slides);
    if (audio) {
      formData.append("audio_file", audio);
    }
    try {
      const job = await createLecture(formData, adminPassword);
      saveAdminPassword(adminPassword);
      push({
        id: job.job_id,
        title,
        subject,
        professor,
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

  const heroStat = useMemo(
    () => [
      { label: "의학용어 인식률", value: "99%" },
      { label: "평균 생성 카드", value: "25~40장" },
      { label: "예상 소요", value: "3~6분" }
    ],
    []
  );

  return (
    <div className="space-y-12 pb-12">
      <section className="grid items-center gap-8 rounded-[32px] border border-white/60 bg-white/70 p-6 shadow-glass backdrop-blur-xl md:grid-cols-[1.1fr_0.9fr] md:p-10">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-teal-800 shadow-inner">
            <Sparkles className="h-4 w-4" /> 슬라이드(+오디오) → Anki CSV
          </div>
          <h1 className="text-4xl font-bold leading-tight text-slate-900 md:text-5xl">
            슬라이드만 올려도 카드 완성.{" "}
            <span className="text-gradient">녹음까지 주면 더 정확해집니다.</span>
          </h1>
          <p className="max-w-2xl text-lg text-slate-600">
            슬라이드만으로도 카드 생성이 가능하며, 오디오를 함께 올리면 ElevenLabs STT와 Gemini 3 Pro Preview가
            교차 분석해 더 높은 품질을 제공합니다. 업로드 → 대기 → 다운로드, 단 3스텝.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" asChild>
              <a href="#upload" className="inline-flex items-center gap-2">
                지금 시작하기 <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
            <p className="text-sm text-slate-500">대기 중에도 진행 상황을 바로 확인할 수 있어요.</p>
          </div>

          <div className="grid grid-cols-3 gap-3 rounded-2xl border border-white/60 bg-white/70 p-4 shadow-inner">
            {heroStat.map((stat) => (
              <div key={stat.label} className="space-y-1">
                <p className="text-xs uppercase tracking-[0.08em] text-slate-500">{stat.label}</p>
                <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
              </div>
            ))}
          </div>
        </div>

        <Card className="relative overflow-hidden border border-white/70 bg-white/80">
          <div className="absolute inset-0 bg-gradient-to-br from-teal-50 via-transparent to-white/60" />
          <CardHeader className="relative z-10">
            <CardTitle className="text-xl text-slate-900">처리 과정 미리보기</CardTitle>
            <p className="text-sm text-slate-500">
              대기열 등록 → 업로드 → (오디오 시 STT) → 슬라이드 분석 → Anki CSV 생성 과정을 실시간으로 보여줍니다.
            </p>
          </CardHeader>
          <CardContent className="relative z-10 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border border-white/60 bg-white/80 p-3 shadow-inner",
                  i === 2 || i === 3 ? "border-teal-700/30" : "border-slate-100"
                )}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  {i === 1 && <Clock3 className="h-4 w-4" />}
                  {i === 2 && <UploadCloud className="h-4 w-4 text-teal-700" />}
                  {i === 3 && <ShieldCheck className="h-4 w-4 text-teal-700" />}
                  {i === 4 && <Sparkles className="h-4 w-4 text-teal-700" />}
                  {i === 5 && <BadgeCheck className="h-4 w-4 text-teal-700" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {["대기열 등록", "업로드", "음성 → 텍스트(선택)", "슬라이드 분석", "CSV 준비"][i - 1]}
                  </p>
                  <p className="text-xs text-slate-500">
                    {[
                      "서버에 작업을 예약합니다.",
                      "슬라이드를 필수로, 오디오는 선택으로 전송합니다.",
                      "오디오가 있으면 ElevenLabs STT로 전사합니다.",
                      "Gemini가 핵심만 추출합니다.",
                      "Anki 호환 CSV로 패킹합니다."
                    ][i - 1]}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section id="upload" className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-teal-800">Step-by-step Upload</p>
            <h2 className="text-3xl font-bold text-slate-900">파일 업로드 → 메타데이터 → 생성</h2>
            <p className="text-slate-600">
              PDF는 필수, 오디오는 선택입니다. 슬라이드만으로도 생성되며, 오디오를 주면 STT로 보정해 더 정확합니다. 이중 제출
              방지를 위해 버튼 상태가 동적으로 바뀝니다.
            </p>
          </div>
          <div className="hidden items-center gap-2 rounded-full bg-white/80 px-3 py-2 text-sm text-slate-600 shadow-inner md:flex">
            <Clock3 className="h-4 w-4" />
            3~6분 소요 예상
          </div>
        </div>

        <Card className="border-none bg-white/80">
          <CardContent className="space-y-6 p-6 md:p-8">
            <div className="flex flex-wrap items-center gap-3">
              {["1. 파일 업로드", "2. 메타데이터"].map((label, idx) => {
                const current = (idx + 1) as Step;
                const active = step === current;
                const done = step > current;
                return (
                  <div
                    key={label}
                    className={cn(
                      "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all",
                      active
                        ? "bg-teal-800 text-white shadow-card"
                        : done
                        ? "bg-slate-100 text-slate-700"
                        : "bg-white text-slate-500 border border-slate-100"
                    )}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/30 text-xs">
                      {idx + 1}
                    </span>
                    {label}
                  </div>
                );
              })}
            </div>

            {step === 1 && (
              <div className="grid gap-4 lg:grid-cols-2">
                <FileUploadZone
                  label="슬라이드 PDF"
                  description="한 개의 PDF를 올려주세요. 여러 장이라면 하나로 병합해주세요."
                  accept={{ "application/pdf": [".pdf"] }}
                  file={slides}
                  onFile={setSlides}
                  onRemove={() => setSlides(null)}
                />
                <FileUploadZone
                  label="오디오 파일 (선택)"
                  description="mp3/m4a/wav 등 대부분의 오디오를 지원합니다. 없으면 슬라이드만으로 진행합니다."
                  accept={{ "audio/*": [] }}
                  file={audio}
                  onFile={setAudio}
                  onRemove={() => setAudio(null)}
                />
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="md:col-span-3">
                  <Label className="mb-2 block text-slate-600">관리자 비밀번호</Label>
                  <Input
                    type="password"
                    placeholder="Admin password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="md:col-span-3">
                  <Label className="mb-2 block text-slate-600">강의 제목 (선택)</Label>
                  <Input
                    placeholder="예: Neurology - Posture in coma"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-2 block text-slate-600">과목 (선택)</Label>
                  <Input placeholder="Neurology" value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-2 block text-slate-600">교수명 (선택)</Label>
                  <Input placeholder="Prof. Kim" value={professor} onChange={(e) => setProfessor(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-2 block text-slate-600">참고</Label>
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 p-3 text-sm text-slate-500">
                    빈칸이어도 괜찮습니다. 들어있는 경우 카드에 태그/문맥으로 반영됩니다.
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                PDF가 준비되면 다음 단계가 활성화됩니다. 오디오는 선택이며, 업로드 후에는 상태 페이지에서 진행률을 실시간으로 볼
                수 있습니다.
              </p>
              <div className="flex items-center gap-2">
                {step === 2 && (
                  <Button variant="ghost" type="button" onClick={() => setStep(1)}>
                    이전 단계로
                  </Button>
                )}
                {step === 1 ? (
                  <Button type="button" disabled={!canNext} onClick={() => setStep(2)}>
                    다음 단계
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                ) : (
                  <Button type="button" disabled={!canSubmit} onClick={handleSubmit}>
                    {loading ? "업로드 중..." : "카드 생성하기"}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-none bg-white/80 md:col-span-3">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">최근 작업</h3>
              <span className="text-xs text-slate-500">브라우저 LocalStorage에 저장됩니다</span>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">아직 저장된 작업이 없습니다. 업로드 후 이곳에 나타납니다.</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {history.slice(0, 6).map((item) => (
                  <Link
                    key={item.id}
                    href={`/jobs/${item.id}`}
                    className="flex items-center justify-between rounded-xl border border-white/60 bg-white/80 px-3 py-2 text-sm text-slate-700 shadow-inner hover:-translate-y-0.5 hover:shadow-card"
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold text-slate-900">
                        {item.title || item.subject || item.id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-slate-500">
                        {item.professor || "익명"} · {new Date(item.createdAt).toLocaleDateString("ko-KR")}
                      </span>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                      {item.cardCount ? `${item.cardCount}장` : "대기"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {features.map((item) => (
          <Card key={item.title} className="border-none bg-white/80">
            <CardContent className="flex gap-3 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                {item.icon}
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
                <p className="text-sm text-slate-600">{item.desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
