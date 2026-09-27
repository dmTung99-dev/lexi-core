import { beforeEach, describe, expect, it, vi } from "vitest";
import { CV_MAX_BYTES, extractCvText, normalizeCvText } from "./cvExtract";
import { extractDocxText, extractPdfText } from "./cvParsers";

vi.mock("./cvParsers", () => ({ extractPdfText: vi.fn(), extractDocxText: vi.fn() }));

const LONG = "Experienced React developer who built a booking app. ".repeat(10);

function file(name: string, size = 10, type = ""): File {
  const f = new File(["x".repeat(size)], name, { type });
  return f;
}

beforeEach(() => vi.clearAllMocks());

describe("normalizeCvText", () => {
  it("collapses whitespace, drops blank lines and truncates to 20000", () => {
    expect(normalizeCvText("  a   b \n\n\n c\t d  ")).toBe("a b\nc d");
    expect(normalizeCvText("x".repeat(25_000))).toHaveLength(20_000);
  });
});

describe("extractCvText", () => {
  it("rejects unsupported extensions", async () => {
    await expect(extractCvText(file("cv.png"))).resolves.toEqual({ ok: false, reason: "unsupported" });
  });

  it("rejects files over 5 MB", async () => {
    const big = file("cv.pdf");
    Object.defineProperty(big, "size", { value: CV_MAX_BYTES + 1 });
    await expect(extractCvText(big)).resolves.toEqual({ ok: false, reason: "too_large" });
  });

  it("extracts PDF text", async () => {
    vi.mocked(extractPdfText).mockResolvedValue(LONG);
    const result = await extractCvText(file("CV.PDF"));
    expect(result).toEqual({ ok: true, text: normalizeCvText(LONG) });
    expect(extractDocxText).not.toHaveBeenCalled();
  });

  it("extracts DOCX text", async () => {
    vi.mocked(extractDocxText).mockResolvedValue(LONG);
    await expect(extractCvText(file("cv.docx"))).resolves.toMatchObject({ ok: true });
  });

  it("reports no_text for a scanned PDF (under 200 non-whitespace chars)", async () => {
    vi.mocked(extractPdfText).mockResolvedValue("   Page 1   \n  ");
    await expect(extractCvText(file("scan.pdf"))).resolves.toEqual({ ok: false, reason: "no_text" });
  });

  it("reports read_error when the parser throws", async () => {
    vi.mocked(extractDocxText).mockRejectedValue(new Error("corrupt"));
    await expect(extractCvText(file("cv.docx"))).resolves.toEqual({ ok: false, reason: "read_error" });
  });
});
