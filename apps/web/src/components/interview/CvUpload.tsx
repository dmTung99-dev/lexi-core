"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { CV_MIN_TEXT_CHARS, extractCvText, normalizeCvText } from "@/lib/cvExtract";
import { buildCvSummaryPrompt, parseCvSummary } from "@/lib/interviewPrompts";
import { callInterviewAi } from "@/lib/interviewAi";
import { deleteCvProfile, saveCvProfile } from "@/lib/cvProfile";
import type { InterviewCvProfile } from "@/lib/interviewTypes";
import type { UserSettings } from "@/lib/settings";

type Mode = "idle" | "reading" | "no_text" | "paste";

const EXTRACT_ERRORS = {
  unsupported: "Chỉ nhận file PDF hoặc DOCX.",
  too_large: "File lớn hơn 5 MB.",
  read_error: "Không đọc được file này — thử file khác.",
} as const;

export interface CvUploadProps {
  uid: string;
  settings: UserSettings;
  profile: InterviewCvProfile | null;
  onChange(profile: InterviewCvProfile | null): void;
}

export function CvUpload({ uid, settings, profile, onChange }: CvUploadProps) {
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [pasted, setPasted] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function summarize(text: string, name: string) {
    setMode("reading");
    try {
      const { summary, topics } = parseCvSummary(await callInterviewAi(settings, buildCvSummaryPrompt(text)));
      const next: InterviewCvProfile = { fileName: name, text, summary, topics, updatedAt: new Date().toISOString() };
      await saveCvProfile(uid, next);
      onChange(next);
      setPasted("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tóm tắt được CV.");
    }
    setMode("idle");
  }

  async function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    setMode("reading");
    const result = await extractCvText(file);
    if (result.ok) {
      await summarize(result.text, file.name);
    } else if (result.reason === "no_text") {
      setMode("no_text");
    } else {
      setError(EXTRACT_ERRORS[result.reason]);
      setMode("idle");
    }
  }

  function handleInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) void handleFile(file);
  }

  function handleDrop(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function handlePasteSubmit() {
    if (pasted.replace(/\s/g, "").length < CV_MIN_TEXT_CHARS) {
      setError("Nội dung quá ngắn — hãy dán toàn bộ CV.");
      return;
    }
    setError(null);
    void summarize(normalizeCvText(pasted), "Nội dung dán");
  }

  async function handleRemove() {
    await deleteCvProfile(uid);
    onChange(null);
  }

  const pickFile = () => inputRef.current?.click();

  return (
    <div className="iv-cv">
      <input ref={inputRef} type="file" accept=".pdf,.docx" hidden data-testid="cv-file-input" onChange={handleInput} />

      {mode === "reading" && (
        <div className="iv-cv-box" role="status">
          <strong>{fileName || "CV"}</strong>
          <span className="iv-muted">AI đang đọc CV…</span>
        </div>
      )}

      {mode === "no_text" && (
        <div className="iv-cv-box iv-cv-warn">
          <p>Không đọc được chữ trong file này (có thể là bản scan).</p>
          <div className="iv-row">
            <button type="button" className="btn-secondary" onClick={pickFile}>Tải bản DOCX</button>
            <button type="button" className="btn-secondary" onClick={() => setMode("paste")}>Dán nội dung CV</button>
          </div>
        </div>
      )}

      {mode === "paste" && (
        <div className="iv-cv-box">
          <label htmlFor="iv-cv-paste" className="iv-label">Nội dung CV</label>
          <textarea id="iv-cv-paste" rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} />
          <div className="iv-row">
            <button type="button" className="btn-primary" onClick={handlePasteSubmit}>Dùng nội dung này</button>
            <button type="button" className="btn-secondary" onClick={() => setMode("idle")}>Hủy</button>
          </div>
        </div>
      )}

      {mode === "idle" && profile && (
        <div className="iv-cv-box iv-cv-done">
          <div className="iv-row iv-cv-head">
            <div className="iv-cv-name">
              <strong>{profile.fileName}</strong>
              <span className="iv-ok">Đã đọc · lưu cho lần sau</span>
            </div>
            <button type="button" className="btn-secondary" onClick={pickFile}>Đổi file</button>
            <button type="button" className="iv-icon-btn" aria-label="Gỡ CV" onClick={() => void handleRemove()}>×</button>
          </div>
          <span className="iv-label">AI sẽ hỏi về:</span>
          <div className="iv-topics">
            {profile.topics.map((t) => (
              <span key={t} className="iv-topic">{t}</span>
            ))}
          </div>
        </div>
      )}

      {mode === "idle" && !profile && (
        <button type="button" className="iv-cv-drop" onClick={pickFile} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
          <strong>Kéo thả CV vào đây, hoặc chọn file</strong>
          <span className="iv-muted">PDF hoặc DOCX · tối đa 5 MB · tiếng Anh hay tiếng Việt đều được</span>
        </button>
      )}

      {error && <p className="iv-error" role="alert">{error}</p>}
    </div>
  );
}
