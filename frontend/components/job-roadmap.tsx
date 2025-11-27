import { CheckCircle2, Flag, Loader2, NotebookPen, Sparkles, Upload, Waves } from "lucide-react";

import { LectureStatus } from "../lib/api";
import { cn } from "../lib/utils";

type RoadmapStepId = "START" | "STT" | "ANKI" | "NOTES" | "FINISH";

type JobRoadmapProps = {
  status?: LectureStatus;
  currentStep?: string | null;
  generateCards?: boolean;
  generateNotes?: boolean;
  hasAudio?: boolean;
};

type StepState = "pending" | "active" | "done" | "skipped";

const order: RoadmapStepId[] = ["START", "STT", "ANKI", "NOTES", "FINISH"];

const normalizeStep = (status?: LectureStatus, currentStep?: string | null): RoadmapStepId => {
  if (currentStep === "STT") return "STT";
  if (currentStep === "ANKI_GEN") return "ANKI";
  if (currentStep === "NOTE_GEN") return "NOTES";
  if (currentStep === "FINISHED") return "FINISH";
  switch (status) {
    case "RUNNING_STT":
      return "STT";
    case "RUNNING_ANKI":
    case "RUNNING_LLM":
    case "GENERATING_CSV":
      return "ANKI";
    case "RUNNING_NOTES":
      return "NOTES";
    case "DONE":
      return "FINISH";
    default:
      return "START";
  }
};

export function JobRoadmap({
  status,
  currentStep,
  generateCards = true,
  generateNotes = false,
  hasAudio = false
}: JobRoadmapProps) {
  const normalized = normalizeStep(status, currentStep);
  const currentIndex = order.indexOf(normalized);

  const steps: { id: RoadmapStepId; label: string; caption: string; enabled: boolean; icon: any }[] = [
    { id: "START", label: "Start", caption: "업로드 완료", enabled: true, icon: Upload },
    { id: "STT", label: "Processing Audio", caption: "ElevenLabs STT", enabled: hasAudio, icon: Waves },
    { id: "ANKI", label: "Generating Anki", caption: "Gemini -> CSV", enabled: generateCards, icon: Sparkles },
    { id: "NOTES", label: "Writing Notes", caption: "Gemini -> PDF 편집", enabled: generateNotes, icon: NotebookPen },
    { id: "FINISH", label: "Finish", caption: "완료", enabled: true, icon: Flag }
  ];

  const stateFor = (step: (typeof steps)[number]): StepState => {
    if (!step.enabled && step.id !== "START" && step.id !== "FINISH") return "skipped";
    const idx = order.indexOf(step.id);
    if (status === "DONE") return idx <= currentIndex ? "done" : "pending";
    if (status === "FAILED") return idx < currentIndex ? "done" : "pending";
    if (idx < currentIndex) return "done";
    if (idx === currentIndex) return "active";
    return "pending";
  };

  return (
    <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-inner">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">Status Roadmap</p>
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
          {status === "DONE" ? "Completed" : status === "FAILED" ? "Error" : "In Progress"}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const state = stateFor(step);
          const isLast = idx === steps.length - 1;

          return (
            <div key={step.id} className="relative">
              {!isLast && (
                <div className="absolute right-[-10px] top-7 hidden h-0.5 w-5 bg-gradient-to-r from-slate-200 to-slate-100 md:block" />
              )}
              <div
                className={cn(
                  "flex h-full flex-col justify-between rounded-xl border bg-white/80 px-3 py-3 shadow-sm transition",
                  state === "done" && "border-teal-600/30 shadow-teal-600/10",
                  state === "active" && "border-slate-900/30 shadow-slate-900/10",
                  state === "pending" && "border-slate-200",
                  state === "skipped" && "border-dashed border-slate-200 bg-slate-50/60"
                )}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full border text-slate-700 transition",
                      state === "done" && "border-teal-600 bg-teal-50 text-teal-700",
                      state === "active" && "border-slate-900 bg-slate-900 text-white shadow-md shadow-slate-900/10",
                      state === "pending" && "border-slate-200 bg-white",
                      state === "skipped" && "border-slate-200 bg-white/70 text-slate-400"
                    )}
                  >
                    {state === "done" ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{step.label}</p>
                    <p className="text-[11px] text-slate-500">
                      {state === "skipped" ? "Skipped" : step.caption}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  <span>
                    {state === "done"
                      ? "Done"
                      : state === "active"
                        ? "In progress"
                        : state === "skipped"
                          ? "Skipped"
                          : "Waiting"}
                  </span>
                  {state === "active" && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-600" />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
