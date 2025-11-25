const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";

export const withBase = (path: string) => {
  if (path.startsWith("http")) return path;

  const trimmedBase = baseUrl.replace(/\/+$/, "");
  const trimmedPath = path.startsWith("/") ? path : `/${path}`;

  // 방어: base가 이미 /api로 끝나고 path도 /api로 시작하면 중복 제거
  if (trimmedBase.endsWith("/api") && trimmedPath.startsWith("/api/")) {
    return `${trimmedBase.slice(0, -4)}${trimmedPath}`;
  }

  return `${trimmedBase}${trimmedPath}`;
};

export type LectureStatus =
  | "PENDING"
  | "RUNNING_STT"
  | "RUNNING_LLM"
  | "GENERATING_CSV"
  | "DONE"
  | "FAILED";

export type LectureStatusResponse = {
  job_id: string;
  status: LectureStatus;
  created_at: string;
  updated_at: string;
  card_count?: number | null;
  download_url?: string | null;
  error_message?: string | null;
  title?: string | null;
  subject?: string | null;
  professor?: string | null;
};

export async function createLecture(formData: FormData): Promise<LectureStatusResponse> {
  const res = await fetch(withBase("/lectures"), {
    method: "POST",
    body: formData
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to create lecture");
  }

  return res.json();
}

export async function fetchLecture(jobId: string): Promise<LectureStatusResponse> {
  const res = await fetch(withBase(`/lectures/${jobId}`));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to fetch job");
  }
  return res.json();
}

export async function fetchCsvText(downloadUrl: string): Promise<string> {
  const res = await fetch(withBase(downloadUrl));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to fetch CSV");
  }
  return res.text();
}
