const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";

const withBase = (path: string) => {
  if (path.startsWith("http")) return path;
  if (!path.startsWith("/")) return `${baseUrl}/${path}`;
  return `${baseUrl}${path}`;
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
