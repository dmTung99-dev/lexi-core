import 'package:flutter_test/flutter_test.dart';
import 'package:lexi_core/features/dictionary/domain/entities/app_context.dart';
import 'package:lexi_core/features/dictionary/domain/entities/input_type.dart';
import 'package:lexi_core/features/dictionary/domain/entities/language.dart';
import 'package:lexi_core/features/vocabulary/domain/entities/cefr_level.dart';
import 'package:lexi_core/features/vocabulary/domain/entities/vocab_record.dart';

Map<String, dynamic> _validJson() => {
      'id': 'abc123',
      'headword': 'Serendipity',
      'inputType': 'word',
      'ipa': '/ˌserənˈdɪpɪti/',
      'meaning': 'sự tình cờ may mắn',
      'examples': ['It was pure serendipity.'],
      'personalNotes': '',
      'topicIds': <String>['daily-life'],
      'targetLanguage': 'english',
      'cefrLevel': 'c1',
      'activeContext': 'general',
      'createdAt': '2026-01-01T00:00:00.000Z',
      'updatedAt': '2026-01-01T00:00:00.000Z',
    };

void main() {
  group('VocabRecord.fromJson', () {
    test('parses a well-formed document', () {
      final record = VocabRecord.fromJson(_validJson());
      expect(record.headword, 'Serendipity');
      expect(record.ipa, '/ˌserənˈdɪpɪti/');
    });

    // Reproduces a real production incident: a bulk-import admin script
    // (scripts/import-vocab/import.js) wrote vocab_records documents
    // straight from an AI-generated file with no field validation, and a
    // later migration script (scripts/migrate-vocab-records-per-language.js)
    // copied them as-is into the collection this app reads — so a document
    // can legitimately have a null field here despite every in-app write
    // path always producing a complete record.
    test('falls back to an empty string when ipa is null', () {
      final json = _validJson()..['ipa'] = null;
      expect(VocabRecord.fromJson(json).ipa, '');
    });

    test('falls back to an empty string when ipa is missing', () {
      final json = _validJson()..remove('ipa');
      expect(VocabRecord.fromJson(json).ipa, '');
    });

    test('falls back to an empty list when examples is null', () {
      final json = _validJson()..['examples'] = null;
      expect(VocabRecord.fromJson(json).examples, <String>[]);
    });

    test('falls back to an empty list when topicIds is null', () {
      final json = _validJson()..['topicIds'] = null;
      expect(VocabRecord.fromJson(json).topicIds, <String>[]);
    });

    test('falls back to an empty string when headword is null', () {
      final json = _validJson()..['headword'] = null;
      expect(VocabRecord.fromJson(json).headword, '');
    });

    test('falls back to an empty string when meaning is null', () {
      final json = _validJson()..['meaning'] = null;
      expect(VocabRecord.fromJson(json).meaning, '');
    });

    test('falls back to CEFRLevel.a1 when cefrLevel is null', () {
      final json = _validJson()..['cefrLevel'] = null;
      expect(VocabRecord.fromJson(json).cefrLevel, CEFRLevel.a1);
    });

    test('falls back to Language.english when targetLanguage is null', () {
      final json = _validJson()..['targetLanguage'] = null;
      expect(VocabRecord.fromJson(json).targetLanguage, Language.english);
    });

    test('falls back to AppContext.general when activeContext is null', () {
      final json = _validJson()..['activeContext'] = null;
      expect(VocabRecord.fromJson(json).activeContext, AppContext.general);
    });

    test('falls back to InputType.word when inputType is null', () {
      final json = _validJson()..['inputType'] = null;
      expect(VocabRecord.fromJson(json).inputType, InputType.word);
    });

    test('falls back to epoch when createdAt/updatedAt are null', () {
      final json = _validJson()
        ..['createdAt'] = null
        ..['updatedAt'] = null;
      final record = VocabRecord.fromJson(json);
      expect(record.createdAt, DateTime.fromMillisecondsSinceEpoch(0));
      expect(record.updatedAt, DateTime.fromMillisecondsSinceEpoch(0));
    });
  });
}
