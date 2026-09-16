import 'dart:convert';

/// Extracts and decodes a JSON object from raw AI model output.
///
/// Even when a provider is explicitly asked for JSON-only output, it can
/// still wrap the object in markdown code fences or append trailing
/// prose/garbage after it. This strips markdown fences first, then — if the
/// text still doesn't parse as-is — falls back to extracting just the
/// balanced-brace JSON object substring (respecting string literals, so a
/// `{`/`}` inside a JSON string value doesn't throw off the brace count).
Map<String, dynamic> parseAiJsonObject(String raw) {
  // Trailing commas are stripped unconditionally (a no-op when absent) rather
  // than only as a fallback after a parse failure: the AI emits them often
  // enough on long structured output (translation + several suggestions,
  // each with nested arrays) that it's worth never hitting the strict
  // jsonDecode with one in the first place.
  final stripped = _stripTrailingCommas(_stripCodeFences(raw.trim()));
  try {
    return jsonDecode(stripped) as Map<String, dynamic>;
  } on FormatException {
    final extracted = _extractBalancedObject(stripped);
    if (extracted == null) rethrow;
    return jsonDecode(extracted) as Map<String, dynamic>;
  }
}

final _fencePattern = RegExp(r'^```(?:json)?\s*([\s\S]*?)\s*```$');

String _stripCodeFences(String text) {
  final match = _fencePattern.firstMatch(text);
  return match?.group(1)?.trim() ?? text;
}

/// Removes a comma that appears (outside any string literal) immediately
/// before the next `}` or `]`, ignoring whitespace between them — a comma
/// that's part of a string value (e.g. "a trailing comma, right here") is
/// left untouched since it's never immediately followed by a closing
/// brace/bracket once whitespace is skipped.
String _stripTrailingCommas(String text) {
  final buffer = StringBuffer();
  var inString = false;
  var escaped = false;
  for (var i = 0; i < text.length; i++) {
    final char = text[i];
    if (inString) {
      buffer.write(char);
      if (escaped) {
        escaped = false;
      } else if (char == '\\') {
        escaped = true;
      } else if (char == '"') {
        inString = false;
      }
      continue;
    }
    if (char == '"') {
      inString = true;
      buffer.write(char);
      continue;
    }
    if (char == ',') {
      var j = i + 1;
      while (j < text.length && text[j].trim().isEmpty) {
        j++;
      }
      if (j < text.length && (text[j] == '}' || text[j] == ']')) {
        continue; // drop this comma
      }
    }
    buffer.write(char);
  }
  return buffer.toString();
}

String? _extractBalancedObject(String text) {
  final start = text.indexOf('{');
  if (start == -1) return null;
  var depth = 0;
  var inString = false;
  var escaped = false;
  for (var i = start; i < text.length; i++) {
    final char = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char == '\\') {
      escaped = true;
      continue;
    }
    if (char == '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char == '{') depth++;
    if (char == '}') {
      depth--;
      if (depth == 0) return text.substring(start, i + 1);
    }
  }
  return null;
}
