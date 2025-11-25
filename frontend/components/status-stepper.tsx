import { Brain, CheckCircle2, Clock3, FileSpreadsheet, Waves } from "lucide-react";
import { cn } from "../lib/utils";
import { LectureStatus } from "../lib/api";

const steps: { key: LectureStatus; label: string; caption: string; icon: JSX.Element }[] = [
  {
    key: "PENDING",
    label: "대기열 등록",
    caption: "서버가 작업을 준비합니다.",
    icon: <Clock3 className="h-4 w-4" />
  },
  {
    key: "RUNNING_STT",
    label: "음성 → 텍스트",
    caption: "ElevenLabs STT로 변환 중",
    icon: <Waves className="h-4 w-4" />
  },
  {
    key: "RUNNING_LLM",
    label: "슬라이드 분석",
    caption: "Gemini가 핵심을 추출합니다.",
    icon: <Brain className="h-4 w-4" />
  },
  {
    key: "GENERATING_CSV",
    label: "Anki 카드 생성",
    caption: "CSV 포맷으로 패킹 중",
    icon: <FileSpreadsheet className="h-4 w-4" />
  },
  {
    key: "DONE",
    label: "완료",
    caption: "다운로드 준비 완료",
    icon: <CheckCircle2 className="h-4 w-4" />
  }
];

export function StatusStepper({ current }: { current?: LectureStatus }) {
  const currentIndex = steps.findIndex((step) => step.key === current);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
      {steps.map((step, idx) => {
        const isActive = idx <= currentIndex;
        const isCurrent = idx === currentIndex;
        return (
          <div
            key={step.key}
            className={cn(
              "rounded-2xl border border-white/50 bg-white/70 px-3 py-3 shadow-card transition-all",
              isActive ? "border-teal-700/40 shadow-lg shadow-teal-800/10" : "opacity-80"
            )}
          >
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border text-slate-700",
                  isActive
                    ? "border-teal-700/60 bg-teal-700/10 text-teal-800"
                    : "border-slate-200 bg-white/70"
                )}
              >
                {step.icon}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{step.label}</p>
                <p className="text-xs text-slate-500">{step.caption}</p>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn(
                  "h-full rounded-full bg-gradient-to-r from-teal-800 to-teal-600 transition-all",
                  isActive ? "w-full" : "w-1/4",
                  isCurrent && "animate-[pulse_1.2s_ease-in-out_infinite]"
                )}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
