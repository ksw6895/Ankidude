"use client";
import { useDropzone } from "react-dropzone";
import { CloudUpload, File as FileIcon, X } from "lucide-react";
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

export function FileUploadZone({
  label,
  description,
  accept,
  file,
  onFile,
  onRemove
}: FileUploadZoneProps) {
  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop: (accepted) => {
      if (accepted?.[0]) onFile(accepted[0]);
    },
    accept,
    multiple: false,
    maxFiles: 1
  });

  const rejection = fileRejections[0]?.errors?.[0]?.message;

  return (
    <div
      className={cn(
        "group relative flex min-h-[180px] flex-col justify-between overflow-hidden rounded-2xl border border-white/60 bg-white/70 p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-glass",
        isDragActive && "border-teal-700/60 bg-white"
      )}
      {...getRootProps()}
    >
      <input {...getInputProps()} />
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
        <CloudUpload className="h-5 w-5 text-teal-700" />
      </div>

      <div className="mt-6 rounded-xl bg-sand-100/70 p-3 text-sm text-slate-700">
        {file ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileIcon className="h-4 w-4 text-teal-700" />
              <div className="flex flex-col">
                <span className="font-semibold">{file.name}</span>
                <span className="text-xs text-slate-500">{formatFileSize(file.size)}</span>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onRemove?.();
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            {isDragActive ? "여기에 놓아주세요" : "클릭하거나 파일을 끌어오세요"}
          </p>
        )}
      </div>

      {rejection && <p className="mt-2 text-xs text-red-600">{rejection}</p>}
    </div>
  );
}
