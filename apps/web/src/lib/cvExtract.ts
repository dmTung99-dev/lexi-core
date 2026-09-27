import { extractDocxText, extractPdfText } from "./cvParsers";

export const CV_MAX_BYTES = 5 * 1024 * 1024;
export const CV_MAX_CHARS = 20_000;
export const CV_MIN_TEXT_CHARS = 200;

export type CvExtractResult =
  | { ok: true; text: string }
  | { ok: false; reason: "unsupported" | "too_large" | "no_text" | "read_error" };

export function normalizeCvText(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .slice(0, CV_MAX_CHARS);
}

function kindOf(file: File): "pdf" | "docx" | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  return null;
}

export async function extractCvText(file: File): Promise<CvExtractResult> {
  const kind = kindOf(file);
  if (!kind) return { ok: false, reason: "unsupported" };
  if (file.size > CV_MAX_BYTES) return { ok: false, reason: "too_large" };
  let raw: string;
  try {
    const data = await file.arrayBuffer();
    raw = kind === "pdf" ? await extractPdfText(data) : await extractDocxText(data);
  } catch {
    return { ok: false, reason: "read_error" };
  }
  // A scanned/image-only PDF has no text layer — no OCR in MVP.
  if (raw.replace(/\s/g, "").length < CV_MIN_TEXT_CHARS) return { ok: false, reason: "no_text" };
  return { ok: true, text: normalizeCvText(raw) };
}
