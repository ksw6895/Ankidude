import { LectureStatus } from "./api";

export type UiStep = "START" | "STT" | "CLEAN" | "ANKI" | "CSV" | "NOTES" | "FINISH" | "FAILED";

const currentStepToUi: Record<string, UiStep> = {
  START: "START",
  STT: "STT",
  CLEAN_TRANSCRIPT: "CLEAN",
  ANKI_GEN: "ANKI",
  GENERATING_CSV: "CSV",
  NOTE_GEN: "NOTES",
  FINISHED: "FINISH"
};

const statusToUi: Record<LectureStatus, UiStep> = {
  PENDING: "START",
  RUNNING_STT: "STT",
  RUNNING_ANKI: "ANKI",
  RUNNING_LLM: "CLEAN",
  GENERATING_CSV: "CSV",
  RUNNING_NOTES: "NOTES",
  DONE: "FINISH",
  FAILED: "FAILED"
};

export const stepLabels: Record<UiStep, string> = {
  START: "대기 중",
  STT: "음성 처리 중",
  CLEAN: "텍스트 정제 중",
  ANKI: "Anki 생성 중",
  CSV: "CSV 패킹 중",
  NOTES: "노트 작성 중",
  FINISH: "완료",
  FAILED: "실패"
};

export function deriveUiStep(status?: LectureStatus, currentStep?: string | null): UiStep {
  if (status === "DONE") return "FINISH";
  if (status === "FAILED") return "FAILED";
  if (currentStep && currentStepToUi[currentStep]) {
    return currentStepToUi[currentStep];
  }
  if (status && statusToUi[status]) {
    return statusToUi[status];
  }
  return "START";
}
