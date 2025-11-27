지적하신 말씀이 맞습니다. 제가 제안했던 기능을 "원래 있던 것을 삭제한다"고 표현하여 혼란을 드렸습니다. 불필요한 사족 없이, **요청하신 깔끔하고 직관적인 디자인과 문구**가 적용된 최종 코드를 바로 정리해 드립니다.

### 핵심 변경 사항

1.  **홈 화면 (`page.tsx`)**: 설명조를 걷어내고, **"Anki Cards, Instantly."** 느낌의 간결하고 강렬한 카피로 변경했습니다.
2.  **카드 미리보기 (`card-preview.tsx`)**: 제안했던 3D 효과는 완전히 배제하고, **즉각적이고 평면적인 전환(Switch)** 방식을 적용했습니다.
3.  **디자인 톤**: 노이즈 질감과 유리 효과(Glassmorphism)를 적용해 완성도 높은 SaaS 제품 느낌을 냈습니다.

-----

### 1\. Global Styles (배경 질감)

**`frontend/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer utilities {
  .bg-noise {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: -1;
    opacity: 0.04;
    pointer-events: none;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
  }
  
  .glass-panel {
    @apply border border-white/40 bg-white/60 backdrop-blur-xl shadow-sm;
  }
}

body {
  @apply min-h-screen text-slate-900 antialiased;
  background-color: #f8fafc;
  background-image: 
    radial-gradient(circle at 10% 20%, rgba(20, 184, 166, 0.06), transparent 40%),
    radial-gradient(circle at 90% 60%, rgba(99, 102, 241, 0.04), transparent 40%);
}
```

**`frontend/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "../components/navbar";
import { Toaster } from "../components/ui/toaster";

export const metadata: Metadata = {
  title: "Ankidude",
  description: "Automated Flashcard Generation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen font-sans">
        <div className="bg-noise" />
        <Navbar />
        <main className="mx-auto max-w-5xl px-6 pb-20 pt-16 md:pt-24">{children}</main>
        <Toaster />
      </body>
    </html>
  );
}
```

-----

### 2\. Home Page (간결한 문구 & 업로드)

**`frontend/app/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Command } from "lucide-react";
import { createLecture } from "../lib/api";
import { loadAdminPassword, saveAdminPassword } from "../lib/admin";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { FileUploadZone } from "../components/file-upload-zone";
import { useToast } from "../components/ui/use-toast";
import { useJobHistory } from "../lib/history";
import { cn } from "../lib/utils";

export default function HomePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { push } = useJobHistory();

  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  
  const [slides, setSlides] = useState<File | null>(null);
  const [audio, setAudio] = useState<File | null>(null);
  const [adminPassword, setAdminPassword] = useState(loadAdminPassword());
  const [meta, setMeta] = useState({ title: "", subject: "", professor: "" });

  const handleUpload = async () => {
    if (!slides) return;
    setLoading(true);
    
    const formData = new FormData();
    formData.append("slides_pdf", slides);
    if (audio) formData.append("audio_file", audio);
    formData.append("title", meta.title);
    formData.append("subject", meta.subject);
    formData.append("professor", meta.professor);

    try {
      const job = await createLecture(formData, adminPassword);
      saveAdminPassword(adminPassword);
      push({
        id: job.job_id,
        title: meta.title,
        subject: meta.subject,
        professor: meta.professor,
        cardCount: null,
        createdAt: new Date().toISOString()
      });
      router.push(`/jobs/${job.job_id}`);
    } catch (err) {
      toast({
        title: "Error",
        description: (err as Error).message,
        variant: "destructive"
      });
      setLoading(false);
    }
  };

  return (
    <div className="space-y-20">
      {/* Hero Text: 아주 짧고 강렬하게 */}
      <section className="text-center space-y-4">
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
          transition={{ delay: 0.1 }}
          className="text-5xl font-extrabold tracking-tight text-slate-900 md:text-7xl"
        >
          강의자료, <br className="md:hidden" />
          <span className="text-transparent bg-clip-text bg-gradient-to-br from-teal-600 to-teal-900">
            시험 대비 카드로.
          </span>
        </motion.h1>
      </section>

      {/* Upload Widget */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mx-auto max-w-3xl glass-panel rounded-3xl p-1 shadow-lg shadow-slate-200/50"
      >
        <div className="rounded-[20px] bg-white/60 p-6 md:p-8">
          
          {/* Progress Dots */}
          <div className="flex justify-center gap-2 mb-8">
            <div className={cn("h-1.5 w-1.5 rounded-full transition-all", step === 1 ? "bg-teal-600 w-4" : "bg-slate-300")} />
            <div className={cn("h-1.5 w-1.5 rounded-full transition-all", step === 2 ? "bg-teal-600 w-4" : "bg-slate-300")} />
          </div>

          {step === 1 ? (
            <div className="grid gap-4 md:grid-cols-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
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
                description="선택 (더 정확해짐)"
                accept={{ "audio/*": [] }}
                file={audio}
                onFile={setAudio}
                onRemove={() => setAudio(null)}
              />
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="space-y-4 md:col-span-2">
                <Label>Admin Password</Label>
                <Input 
                  type="password" 
                  value={adminPassword} 
                  onChange={(e) => setAdminPassword(e.target.value)} 
                  className="bg-white/80"
                />
              </div>
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input 
                  placeholder="e.g. Neurology" 
                  value={meta.subject} 
                  onChange={(e) => setMeta({...meta, subject: e.target.value})} 
                  className="bg-white/80"
                />
              </div>
              <div className="space-y-2">
                <Label>Professor</Label>
                <Input 
                  placeholder="e.g. Prof. Kim" 
                  value={meta.professor} 
                  onChange={(e) => setMeta({...meta, professor: e.target.value})} 
                  className="bg-white/80"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Lecture Title</Label>
                <Input 
                  placeholder="e.g. Stroke Management" 
                  value={meta.title} 
                  onChange={(e) => setMeta({...meta, title: e.target.value})} 
                  className="bg-white/80"
                />
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            {step === 2 ? (
              <Button variant="ghost" onClick={() => setStep(1)} className="text-slate-500">Back</Button>
            ) : (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Command className="h-3 w-3" />
                <span>PDF required</span>
              </div>
            )}
            
            {step === 1 ? (
              <Button 
                disabled={!slides} 
                onClick={() => setStep(2)}
                className="bg-slate-900 text-white hover:bg-slate-800 rounded-xl px-6"
              >
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button 
                disabled={!slides || !adminPassword || loading} 
                onClick={handleUpload}
                className="bg-teal-600 hover:bg-teal-700 text-white rounded-xl px-8 shadow-lg shadow-teal-600/20"
              >
                {loading ? "Uploading..." : "Generate Cards"}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
```

-----

### 3\. File Upload Component (깔끔하게)

**`frontend/components/file-upload-zone.tsx`**

```tsx
"use client";
import { useDropzone } from "react-dropzone";
import { CloudUpload, FileAudio, FileText, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn, formatFileSize } from "../lib/utils";
import { Button } from "./ui/button";

type Props = {
  label: string;
  description?: string;
  accept: Record<string, string[]>;
  file?: File | null;
  onFile: (file: File) => void;
  onRemove?: () => void;
};

export function FileUploadZone({ label, description, accept, file, onFile, onRemove }: Props) {
  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop: (acc) => acc?.[0] && onFile(acc[0]),
    accept,
    multiple: false,
    maxFiles: 1
  });

  const isPdf = Object.keys(accept).some(k => k.includes("pdf"));
  const Icon = isPdf ? FileText : FileAudio;

  return (
    <div className="relative group w-full">
      <div
        {...getRootProps()}
        className={cn(
          "relative flex h-[160px] flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-200",
          isDragActive 
            ? "border-teal-500 bg-teal-50/50 scale-[1.01]" 
            : "border-slate-200 bg-white/40 hover:border-slate-300 hover:bg-white/60",
          file && "border-solid border-teal-500/20 bg-teal-50/10"
        )}
      >
        <input {...getInputProps()} />
        <AnimatePresence mode="wait">
          {!file ? (
            <motion.div 
              key="empty"
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="flex flex-col items-center gap-2 text-center p-4"
            >
              <div className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm transition-colors",
                isDragActive && "text-teal-600"
              )}>
                <CloudUpload className="h-5 w-5 text-slate-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">{label}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{description || "Drag & Drop"}</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="file"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex w-[90%] items-center justify-between rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-900/5"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{file.name}</p>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">{formatFileSize(file.size)}</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-500" onClick={(e) => { e.stopPropagation(); onRemove?.(); }}>
                <X className="h-4 w-4" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {fileRejections[0] && (
        <p className="mt-2 text-center text-xs font-medium text-red-500 animate-in fade-in">
          {fileRejections[0].errors[0].message}
        </p>
      )}
    </div>
  );
}
```

-----

### 4\. Job Status Page (대시보드형 레이아웃)

**`frontend/app/jobs/[id]/page.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, CircleDashed, Download, Loader2, Mic, BrainCircuit, Layers } from "lucide-react";
import { fetchCsvText, fetchLecture, LectureStatusResponse, withBase } from "../../../lib/api";
import { CardPreview } from "../../../components/card-preview";
import { Button } from "../../../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../components/ui/tabs";
import { useToast } from "../../../components/ui/use-toast";
import { Flashcard, buildCsv, parseCsvCards } from "../../../lib/csv";
import { useJobHistory } from "../../../lib/history";
import { cn } from "../../../lib/utils";
import { loadAdminPassword } from "../../../lib/admin";

const statusMap: Record<string, string> = {
  PENDING: "Waiting...",
  RUNNING_STT: "Processing Audio...",
  RUNNING_LLM: "Analyzing Content...",
  GENERATING_CSV: "Finalizing...",
  DONE: "Ready",
  FAILED: "Failed"
};

const iconMap: Record<string, any> = {
  RUNNING_STT: Mic,
  RUNNING_LLM: BrainCircuit,
  GENERATING_CSV: Layers,
  DONE: CheckCircle2,
};

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { push } = useJobHistory();

  const [data, setData] = useState<LectureStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string>("");
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadingCsv, setLoadingCsv] = useState(false);
  const [adminPassword] = useState(loadAdminPassword());

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetchLecture(id, adminPassword);
        if (!cancelled) {
          setData(res);
          if (res.status === "FAILED") setError(res.error_message || "Unknown error");
          else setError(null);
          push({ id: res.job_id, title: res.title, subject: res.subject, professor: res.professor, cardCount: res.card_count, createdAt: res.created_at });
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    };
    load();
    const interval = setInterval(load, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [id, adminPassword, push]);

  const downloadLink = data?.status === "DONE" && data.download_url ? withBase(data.download_url) : undefined;

  const loadCsv = useCallback(async () => {
    if (!downloadLink) return;
    setLoadingCsv(true);
    try {
      const text = await fetchCsvText(downloadLink, adminPassword);
      setCsvText(text);
      setCards(parseCsvCards(text));
      setActiveIndex(0);
    } catch (err) {
      toast({ title: "Load Failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoadingCsv(false);
    }
  }, [downloadLink, adminPassword, toast]);

  useEffect(() => {
    if (data?.status === "DONE" && downloadLink && cards.length === 0 && !loadingCsv) void loadCsv();
  }, [data?.status, downloadLink, cards.length, loadingCsv, loadCsv]);

  const handleExport = () => {
    const blob = new Blob([buildCsv(cards)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ankidude-${id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "CSV file has been downloaded." });
  };

  const StatusIcon = iconMap[data?.status || ""] || (data?.status === "PENDING" ? CircleDashed : Loader2);
  const isProcessing = ["RUNNING_STT", "RUNNING_LLM", "GENERATING_CSV", "PENDING"].includes(data?.status || "");

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Panel */}
      <div className="glass-panel flex flex-col gap-4 md:flex-row md:items-center md:justify-between rounded-2xl px-6 py-5">
        <div className="flex items-center gap-4">
          <div className={cn(
            "flex h-12 w-12 items-center justify-center rounded-2xl transition-colors",
            data?.status === "DONE" ? "bg-teal-100 text-teal-700" : "bg-white text-slate-400",
            isProcessing && "bg-indigo-50 text-indigo-600 animate-pulse"
          )}>
            <StatusIcon className={cn("h-6 w-6", isProcessing && "animate-spin")} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{statusMap[data?.status || "PENDING"]}</h1>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mt-0.5">Job: {id?.slice(0, 8)}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">New Job</Link>
          </Button>
          {data?.status === "DONE" && (
            <Button onClick={handleExport} size="sm" className="bg-slate-900 text-white hover:bg-slate-800">
              <Download className="mr-2 h-4 w-4" /> Download CSV
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 font-medium">
          Error: {error}
        </div>
      )}

      {/* Info Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-2xl p-6 bg-white/70">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total Cards</p>
          <p className="mt-2 text-4xl font-extrabold text-slate-900 tracking-tight">{data?.card_count ?? cards.length ?? 0}</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel md:col-span-2 rounded-2xl p-6 bg-white/70 flex flex-col justify-center">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Subject</p>
              <p className="text-lg font-semibold text-slate-800 truncate">{data?.subject || "-"}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Topic</p>
              <p className="text-lg font-semibold text-slate-800 truncate">{data?.title || "-"}</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Preview Section */}
      {data?.status === "DONE" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <Tabs defaultValue="preview" className="w-full">
            <div className="flex items-center justify-between mb-4 px-1">
              <TabsList className="bg-white/50 border border-white/40">
                <TabsTrigger value="preview" className="text-xs">Preview</TabsTrigger>
                <TabsTrigger value="raw" className="text-xs">Raw CSV</TabsTrigger>
              </TabsList>
              <span className="text-xs font-medium text-slate-400">{activeIndex + 1} / {cards.length}</span>
            </div>
            <TabsContent value="preview" className="mt-0">
              <CardPreview 
                cards={cards} 
                activeIndex={activeIndex} 
                onChangeIndex={setActiveIndex}
                onEdit={(idx, field, val) => setCards(prev => prev.map((c, i) => i === idx ? { ...c, [field]: val } : c))}
                onRemove={(idx) => {
                  setCards(prev => prev.filter((_, i) => i !== idx));
                  setActiveIndex(prev => Math.min(prev, cards.length - 2));
                }}
              />
            </TabsContent>
            <TabsContent value="raw" className="mt-0">
              <div className="glass-panel rounded-2xl p-4">
                <pre className="h-96 overflow-auto rounded-xl bg-slate-900 p-4 text-xs font-mono text-slate-300 leading-relaxed">
                  {csvText}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>
      )}
    </div>
  );
}
```

-----

### 5\. Card Preview (Flat Design, No 3D)

**`frontend/components/card-preview.tsx`**

```tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Flashcard } from "../lib/csv";
import { cn } from "../lib/utils";

type Props = {
  cards: Flashcard[];
  activeIndex: number;
  onChangeIndex: (index: number) => void;
  onEdit: (index: number, field: keyof Flashcard, value: string) => void;
  onRemove: (index: number) => void;
};

export function CardPreview({ cards, activeIndex, onChangeIndex, onEdit, onRemove }: Props) {
  const [showBack, setShowBack] = useState(false);
  const active = cards[activeIndex];

  if (!active) return null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      {/* 1. Flashcard Area (Flat Interaction) */}
      <div 
        className="group relative flex aspect-[1.6/1] min-h-[360px] cursor-pointer flex-col items-center justify-center rounded-[32px] border border-white/60 bg-white p-10 shadow-sm transition-all hover:shadow-md active:scale-[0.99] select-none"
        onClick={() => setShowBack(!showBack)}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={showBack ? "back" : "front"}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="flex h-full w-full flex-col items-center justify-center text-center"
          >
            <span className={cn(
              "mb-6 inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider",
              showBack ? "bg-indigo-50 text-indigo-600" : "bg-teal-50 text-teal-700"
            )}>
              {showBack ? "Answer" : "Question"}
            </span>
            
            <p className={cn(
              "max-w-2xl leading-relaxed text-slate-800 whitespace-pre-wrap",
              showBack ? "text-lg font-medium text-slate-700" : "text-2xl font-bold"
            )}>
              {showBack ? active.back : active.front}
            </p>
          </motion.div>
        </AnimatePresence>

        <p className="absolute bottom-8 text-[10px] font-medium uppercase tracking-widest text-slate-300 transition-opacity group-hover:text-slate-400">
          Click to Flip
        </p>
      </div>

      {/* 2. Controls & Edit Area */}
      <div className="flex flex-col gap-4">
        {/* Navigation */}
        <div className="flex items-center justify-between rounded-2xl bg-white/60 p-2 border border-white/40 shadow-sm">
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl" disabled={activeIndex === 0} onClick={() => { setShowBack(false); onChangeIndex(activeIndex - 1); }}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-bold text-slate-500 font-mono">
            {String(activeIndex + 1).padStart(2, '0')} / {String(cards.length).padStart(2, '0')}
          </span>
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl" disabled={activeIndex === cards.length - 1} onClick={() => { setShowBack(false); onChangeIndex(activeIndex + 1); }}>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Editor */}
        <div className="flex-1 space-y-4 rounded-3xl bg-white/40 p-6 backdrop-blur-md border border-white/40">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Front</label>
            <textarea
              className="w-full rounded-xl border-0 bg-white/70 p-3 text-sm font-medium text-slate-800 shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-teal-500 resize-none placeholder:text-slate-300"
              rows={3}
              value={active.front}
              onChange={(e) => onEdit(activeIndex, "front", e.target.value)}
              placeholder="질문 입력..."
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Back</label>
            <textarea
              className="w-full rounded-xl border-0 bg-white/70 p-3 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500 resize-none placeholder:text-slate-300"
              rows={5}
              value={active.back}
              onChange={(e) => onEdit(activeIndex, "back", e.target.value)}
              placeholder="답변 입력..."
            />
          </div>
          <div className="pt-2">
            <Button 
              variant="ghost" 
              className="w-full text-red-400 hover:text-red-600 hover:bg-red-50 justify-start h-auto py-2 px-3 text-xs"
              onClick={() => onRemove(activeIndex)}
            >
              <Trash2 className="mr-2 h-3 w-3" /> Delete Card
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```