"use client";
import { useDropzone } from "react-dropzone";
import { AnimatePresence, motion } from "framer-motion";
import { CloudUpload, FileAudio, FileText, X } from "lucide-react";
import { cn, formatFileSize } from "../lib/utils";
import { Button } from "./ui/button";

type FileUploadZoneProps = {
  label: string;
  description?: string;
  accept: Record<string, string[]>;
  file?: File | null;
  onFile: (file: File) => void;
  onRemove?: () => void;
};

export function FileUploadZone({ label, description, accept, file, onFile, onRemove }: FileUploadZoneProps) {
  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop: (acc) => acc?.[0] && onFile(acc[0]),
    accept,
    multiple: false,
    maxFiles: 1
  });

  const isPdf = Object.keys(accept).some((k) => k.includes("pdf"));
  const Icon = isPdf ? FileText : FileAudio;
  const rejection = fileRejections[0]?.errors?.[0]?.message;

  return (
    <div className="relative group w-full">
      <div
        {...getRootProps()}
        className={cn(
          "relative flex h-[180px] flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-200",
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
              className="flex flex-col items-center gap-2 p-4 text-center"
            >
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm transition-colors",
                  isDragActive && "text-teal-600"
                )}
              >
                <CloudUpload className="h-5 w-5 text-slate-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">{label}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{description || "Drag & Drop"}</p>
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
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-red-500"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove?.();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {rejection && (
        <p className="mt-2 text-center text-xs font-medium text-red-500 animate-in fade-in">{rejection}</p>
      )}
    </div>
  );
}
