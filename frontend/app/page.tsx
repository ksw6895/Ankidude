"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createLecture } from "../lib/api";

export default function HomePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [professor, setProfessor] = useState("");
  const [slides, setSlides] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!slides || !audio) {
      setError("슬라이드 PDF와 오디오 파일을 모두 선택해주세요.");
      return;
    }
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("subject", subject);
      formData.append("professor", professor);
      formData.append("slides_pdf", slides);
      formData.append("audio_file", audio);

      const job = await createLecture(formData);
      router.push(`/jobs/${job.job_id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main>
      <div className="hero">
        <div className="panel">
          <span className="pill">슬라이드 + 녹음 → Anki CSV</span>
          <h1 className="title">시험에 바로 쓰는 카드, 한 번에 만드세요.</h1>
          <p className="subtitle">
            강의 슬라이드와 녹음을 업로드하면 ElevenLabs STT와 Gemini 3 Pro Preview가 정제된
            transcript와 고품질 Anki Basic 카드를 만들어 줍니다. 클릭 한 번으로 끝냅니다.
          </p>
          <form onSubmit={handleSubmit}>
            <div className="input-grid">
              <div>
                <label htmlFor="title">강의 제목 (선택)</label>
                <input
                  id="title"
                  type="text"
                  placeholder="Neurology - Posture in coma"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="subject">과목 (선택)</label>
                <input
                  id="subject"
                  type="text"
                  placeholder="Neurology"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="professor">교수명 (선택)</label>
                <input
                  id="professor"
                  type="text"
                  placeholder="Prof. Kim"
                  value={professor}
                  onChange={(e) => setProfessor(e.target.value)}
                />
              </div>
            </div>

            <div className="input-grid" style={{ marginTop: 14 }}>
              <div>
                <label htmlFor="slides">슬라이드 PDF</label>
                <input
                  id="slides"
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setSlides(e.target.files?.[0] || null)}
                />
              </div>
              <div>
                <label htmlFor="audio">오디오 파일</label>
                <input
                  id="audio"
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setAudio(e.target.files?.[0] || null)}
                />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
              <button className="button" type="submit" disabled={loading}>
                {loading ? "업로드 중..." : "카드 생성하기"}
              </button>
              <span className="muted">보통 25장의 고밀도 카드가 생성됩니다.</span>
            </div>

            {error && (
              <div
                className="card"
                style={{
                  marginTop: 14,
                  borderColor: "#fcd34d",
                  background: "#fffbeb"
                }}
              >
                {error}
              </div>
            )}
          </form>
        </div>

        <div className="panel">
          <h3 style={{ marginTop: 0 }}>왜 필요한가요?</h3>
          <div className="card" style={{ marginBottom: 12 }}>
            <strong>시간 절약</strong>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              1시간 강의 → 몇 분 만에 Anki CSV 완성. 손으로 타이핑하지 않아도 됩니다.
            </p>
          </div>
          <div className="card" style={{ marginBottom: 12 }}>
            <strong>믿을 수 있는 카드</strong>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              슬라이드와 녹음을 교차 검증해 환각을 줄이고, 한 카드에 한 개념만 담습니다.
            </p>
          </div>
          <div className="card">
            <strong>바로 가져오기</strong>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              `#separator:Semicolon` 헤더를 포함한 CSV라서 Anki에서 즉시 import 가능합니다.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
