const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const defaultAdminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "";

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

const withAdminHeader = (adminPassword?: string): Record<string, string> => {
  const value = adminPassword || defaultAdminPassword;
  const headers: Record<string, string> = {};
  if (value) headers["X-Admin-Password"] = value;
  return headers;
};

export async function createLecture(
  formData: FormData,
  adminPassword?: string
): Promise<LectureStatusResponse> {
  const res = await fetch(withBase("/lectures"), {
    method: "POST",
    body: formData,
    headers: {
      ...withAdminHeader(adminPassword)
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to create lecture");
  }

  return res.json();
}

export async function fetchLecture(jobId: string, adminPassword?: string): Promise<LectureStatusResponse> {
  const res = await fetch(withBase(`/lectures/${jobId}`), {
    headers: {
      ...withAdminHeader(adminPassword)
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to fetch job");
  }
  return res.json();
}

export async function fetchCsvText(downloadUrl: string, adminPassword?: string): Promise<string> {
  const res = await fetch(withBase(downloadUrl), {
    headers: {
      ...withAdminHeader(adminPassword)
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Failed to fetch CSV");
  }
  // 강제 UTF-8 디코딩 (헤더가 없거나 잘못된 경우 대비)
  const buffer = await res.arrayBuffer();
  const decoder = new TextDecoder("utf-8");
  return decoder.decode(buffer);
}
