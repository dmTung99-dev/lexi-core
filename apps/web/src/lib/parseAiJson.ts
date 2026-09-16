// Ports lib/core/utils/ai_json_parser.dart's parseAiJsonObject. Even when a
// provider is explicitly asked for JSON-only output, it can still wrap the
// object in markdown code fences or append trailing prose/garbage after it.
// Strip markdown fences first, then — if the text still doesn't parse as-is —
// fall back to extracting just the balanced-brace JSON object substring
// (respecting string literals, so a `{`/`}` inside a JSON string value
// doesn't throw off the brace count).
export function parseAiJsonObject(raw: string): Record<string, unknown> {
  // Trailing commas are stripped unconditionally (a no-op when absent) rather
  // than only as a fallback after a parse failure: the AI emits them often
  // enough on long structured output (translation + several suggestions,
  // each with nested arrays) that it's worth never hitting the strict
  // JSON.parse with one in the first place.
  const stripped = stripTrailingCommas(stripCodeFences(raw.trim()));
  try {
    return JSON.parse(stripped) as Record<string, unknown>;
  } catch {
    const extracted = extractBalancedObject(stripped);
    if (extracted === null) {
      throw new Error("No JSON object found in AI response.");
    }
    return JSON.parse(extracted) as Record<string, unknown>;
  }
}

const FENCE_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

function stripCodeFences(text: string): string {
  const match = FENCE_PATTERN.exec(text);
  return match ? match[1].trim() : text;
}

// Removes a comma that appears (outside any string literal) immediately
// before the next `}` or `]`, ignoring whitespace between them — a comma
// that's part of a string value (e.g. "a trailing comma, right here") is
// left untouched since it's never immediately followed by a closing
// brace/bracket once whitespace is skipped.
function stripTrailingCommas(text: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }
    if (char === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "}" || text[j] === "]") continue; // drop this comma
    }
    result += char;
  }
  return result;
}

function extractBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth++;
    if (char === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
