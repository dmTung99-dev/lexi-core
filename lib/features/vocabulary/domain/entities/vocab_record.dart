import '../../../dictionary/domain/entities/app_context.dart';
import '../../../dictionary/domain/entities/input_type.dart';
import '../../../dictionary/domain/entities/language.dart';
import 'cefr_level.dart';

final class VocabRecord {
  const VocabRecord({
    required this.id,
    required this.headword,
    required this.inputType,
    required this.ipa,
    required this.meaning,
    required this.examples,
    required this.personalNotes,
    required this.topicIds,
    required this.targetLanguage,
    required this.cefrLevel,
    required this.activeContext,
    required this.createdAt,
    required this.updatedAt,
    this.nextReviewAt,
    this.sm2Repetitions = 0,
    this.sm2EaseFactor = 2.5,
    this.sm2Interval = 1,
    this.definition = '',
    this.synonyms = const [],
  });

  final String id;
  final String headword;
  final InputType inputType; // word or phrase only — sentences not saveable
  final String ipa;
  final String meaning;
  final List<String> examples;
  final String personalNotes;
  final String definition; // English definition (optional)
  final List<String> synonyms;
  final List<String> topicIds; // max 2
  final Language targetLanguage;
  final CEFRLevel cefrLevel;
  final AppContext activeContext;
  final DateTime createdAt;
  final DateTime updatedAt;
  // SM-2 fields — used by Plan 3 (Spaced Repetition); stored from Plan 2 onwards
  final DateTime? nextReviewAt;
  final int sm2Repetitions;
  final double sm2EaseFactor;
  final int sm2Interval;

  VocabRecord copyWith({
    String? headword,
    String? meaning,
    List<String>? examples,
    String? personalNotes,
    List<String>? topicIds,
    DateTime? updatedAt,
    DateTime? nextReviewAt,
    int? sm2Repetitions,
    double? sm2EaseFactor,
    int? sm2Interval,
    String? definition,
    List<String>? synonyms,
  }) =>
      VocabRecord(
        id: id,
        headword: headword ?? this.headword,
        inputType: inputType,
        ipa: ipa,
        meaning: meaning ?? this.meaning,
        examples: examples ?? this.examples,
        personalNotes: personalNotes ?? this.personalNotes,
        topicIds: topicIds ?? this.topicIds,
        targetLanguage: targetLanguage,
        cefrLevel: cefrLevel,
        activeContext: activeContext,
        createdAt: createdAt,
        updatedAt: updatedAt ?? this.updatedAt,
        nextReviewAt: nextReviewAt ?? this.nextReviewAt,
        sm2Repetitions: sm2Repetitions ?? this.sm2Repetitions,
        sm2EaseFactor: sm2EaseFactor ?? this.sm2EaseFactor,
        sm2Interval: sm2Interval ?? this.sm2Interval,
        definition: definition ?? this.definition,
        synonyms: synonyms ?? this.synonyms,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'headword': headword,
        'inputType': inputType.name,
        'ipa': ipa,
        'meaning': meaning,
        'examples': examples,
        'personalNotes': personalNotes,
        'topicIds': topicIds,
        'targetLanguage': targetLanguage.name,
        'cefrLevel': cefrLevel.name,
        'activeContext': activeContext.name,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
        'nextReviewAt': nextReviewAt?.toIso8601String(),
        'sm2Repetitions': sm2Repetitions,
        'sm2EaseFactor': sm2EaseFactor,
        'sm2Interval': sm2Interval,
        'definition': definition,
        'synonyms': synonyms,
      };

  // Most fields below fall back to a safe default instead of an unguarded
  // `as String`/`as List` cast: every in-app write path always produces a
  // complete record, but historical admin scripts (bulk import, the
  // per-language migration) wrote/copied Firestore documents straight from
  // external data with no field validation, so a stray null/missing field
  // here is a real possibility — and since the Vocab Bank list maps every
  // document through this factory in one pass, an unguarded cast on any one
  // malformed document used to take down the whole list.
  factory VocabRecord.fromJson(Map<String, dynamic> json) => VocabRecord(
        id: json['id'] as String? ?? '',
        headword: json['headword'] as String? ?? '',
        inputType: json['inputType'] != null
            ? InputType.values.byName(json['inputType'] as String)
            : InputType.word,
        ipa: json['ipa'] as String? ?? '',
        meaning: json['meaning'] as String? ?? '',
        examples: json['examples'] != null
            ? List<String>.from(json['examples'] as List)
            : const [],
        personalNotes: json['personalNotes'] as String? ?? '',
        topicIds: json['topicIds'] != null
            ? List<String>.from(json['topicIds'] as List)
            : const [],
        targetLanguage: json['targetLanguage'] != null
            ? Language.values.byName(json['targetLanguage'] as String)
            : Language.english,
        cefrLevel: json['cefrLevel'] != null
            ? CEFRLevel.values.byName(json['cefrLevel'] as String)
            : CEFRLevel.a1,
        activeContext: json['activeContext'] != null
            ? AppContext.values.byName(json['activeContext'] as String)
            : AppContext.general,
        createdAt: json['createdAt'] != null
            ? DateTime.parse(json['createdAt'] as String)
            : DateTime.fromMillisecondsSinceEpoch(0),
        updatedAt: json['updatedAt'] != null
            ? DateTime.parse(json['updatedAt'] as String)
            : DateTime.fromMillisecondsSinceEpoch(0),
        nextReviewAt: json['nextReviewAt'] != null
            ? DateTime.parse(json['nextReviewAt'] as String)
            : null,
        sm2Repetitions: json['sm2Repetitions'] as int? ?? 0,
        sm2EaseFactor: (json['sm2EaseFactor'] as num?)?.toDouble() ?? 2.5,
        sm2Interval: json['sm2Interval'] as int? ?? 1,
        definition: json['definition'] as String? ?? '',
        synonyms: json['synonyms'] != null
            ? List<String>.from(json['synonyms'] as List)
            : const [],
      );
}
