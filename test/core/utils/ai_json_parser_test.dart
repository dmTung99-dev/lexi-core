import 'package:flutter_test/flutter_test.dart';
import 'package:lexi_core/core/utils/ai_json_parser.dart';

void main() {
  test('parses plain valid JSON', () {
    final result = parseAiJsonObject('{"a": 1, "b": "two"}');
    expect(result, {'a': 1, 'b': 'two'});
  });

  test('strips ```json ... ``` markdown code fences', () {
    final result = parseAiJsonObject('```json\n{"a": 1}\n```');
    expect(result, {'a': 1});
  });

  test('strips bare ``` ... ``` code fences without a language tag', () {
    final result = parseAiJsonObject('```\n{"a": 1}\n```');
    expect(result, {'a': 1});
  });

  test('extracts the JSON object when trailing prose follows it', () {
    final result = parseAiJsonObject('{"a": 1}\nNote: this is a great answer!');
    expect(result, {'a': 1});
  });

  test('does not get confused by braces inside string values', () {
    final result = parseAiJsonObject(
        '{"meaning": "a symbol like { or }"}\nExtra trailing text');
    expect(result, {'meaning': 'a symbol like { or }'});
  });

  test('throws FormatException when no JSON object can be found at all', () {
    expect(() => parseAiJsonObject('not json at all'), throwsFormatException);
  });

  // A real production failure: the AI occasionally emits a trailing comma
  // before a closing `}`/`]` on longer structured output (translation +
  // several suggestions), which strict jsonDecode rejects outright even
  // though the rest of the payload is well-formed. Mirrors
  // apps/web/src/lib/parseAiJson.test.ts's equivalent cases.
  test('tolerates a trailing comma before a closing brace', () {
    final result = parseAiJsonObject('{"a": 1, "b": 2,}');
    expect(result, {'a': 1, 'b': 2});
  });

  test('tolerates a trailing comma before a closing bracket', () {
    final result = parseAiJsonObject(
        '{"suggestions": [{"headword": "a"}, {"headword": "b"},]}');
    expect(result, {
      'suggestions': [
        {'headword': 'a'},
        {'headword': 'b'},
      ],
    });
  });

  test('tolerates a trailing comma nested inside an array of objects', () {
    final result = parseAiJsonObject(
        '{"translation": "x", "suggestions": [{"headword": "a", "synonyms": ["s1", "s2",]},]}');
    expect(result, {
      'translation': 'x',
      'suggestions': [
        {
          'headword': 'a',
          'synonyms': ['s1', 's2'],
        },
      ],
    });
  });

  test('does not touch a trailing comma inside a string value', () {
    final result =
        parseAiJsonObject('{"a": "literally a trailing comma, right here"}');
    expect(result, {'a': 'literally a trailing comma, right here'});
  });
}
