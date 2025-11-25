"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchLecture, LectureStatusResponse, withBase } from "../../../lib/api";

const statusLabel: Record<string, string> = {
  PENDING: "대기 중",
  RUNNING_STT: "음성 인식 중…",
  RUNNING_LLM: "카드 생성 중…",
  GENERATING_CSV: "CSV 정리 중…",
  DONE: "완료",
  FAILED: "실패"
};

export default function JobPage() {
  const params = useParams<{ id: string }>();
  const jobId = params?.id;
  const [data, setData] = useState<LectureStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetchLecture(jobId as string);
        if (!cancelled) {
          setData(res);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    };

    load();
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId]);

  const readyForDownload = data?.status === "DONE" && data.download_url;
  const downloadLink =
    readyForDownload && data?.download_url ? withBase(data.download_url) : undefined;
  const statusText = data ? statusLabel[data.status] : "불러오는 중…";

  return (
    <main>
      <div className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="pill">Job ID: {jobId}</span>
          <Link href="/" className="muted">
            홈으로 돌아가기
          </Link>
        </div>
        <h1 className="title" style={{ marginTop: 12 }}>
          상태: {statusText}
        </h1>
        {data && data.card_count !== null && (
          <p className="muted" style={{ marginTop: -6 }}>
            생성된 카드: {data.card_count ?? 0}장
          </p>
        )}

        {data && data.status !== "DONE" && data.status !== "FAILED" && (
          <div style={{ marginTop: 16 }}>
            <div className="status">{statusText}</div>
            <div className="progress" style={{ marginTop: 12 }}>
              <div className="progress-bar" />
            </div>
          </div>
        )}

        {readyForDownload && (
          <div className="card" style={{ marginTop: 16 }}>
            <strong>CSV가 준비되었습니다.</strong>
            <p className="muted" style={{ margin: "6px 0 12px" }}>
              Anki에서 구분자를 세미콜론으로 선택하면 바로 import됩니다.
            </p>
            <a className="button" href={downloadLink ?? "#"} download>
              CSV 다운로드
            </a>
          </div>
        )}

        {data && data.status === "FAILED" && (
          <div
            className="card"
            style={{ marginTop: 16, borderColor: "#f87171", background: "#fef2f2" }}
          >
            <strong>처리 중 오류가 발생했습니다.</strong>
            <p className="muted" style={{ margin: "8px 0 0" }}>{data.error_message}</p>
          </div>
        )}

        {error && (
          <div className="card" style={{ marginTop: 16, borderColor: "#fcd34d" }}>
            {error}
          </div>
        )}
      </div>
    </main>
  );
}
