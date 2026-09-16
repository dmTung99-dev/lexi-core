import 'package:flutter_test/flutter_test.dart';
import 'package:lexi_core/features/dictionary/domain/entities/language.dart';
import 'package:lexi_core/features/vocabulary/domain/entities/cefr_level.dart';
import 'package:lexi_core/features/knowledge/domain/entities/knowledge_note.dart';
import 'package:lexi_core/features/knowledge/domain/knowledge_filters.dart';

KnowledgeNote _n(String id, {
  String title = '', String explanation = '', String group = 'en_other',
  CEFRLevel? level, List<String> tags = const [],
}) {
  final t = DateTime.utc(2026, 1, 1);
  return KnowledgeNote(
    id: id, title: title, summary: '', explanation: explanation, groupId: group,
    tags: tags, cefrLevel: level, targetLanguage: Language.english,
    origin: KnowledgeNoteOrigin.manual, createdAt: t, updatedAt: t,
  );
}

void main() {
  final notes = [
    _n('a', title: 'Câu điều kiện loại 2', group: 'en_conditionals', level: CEFRLevel.b1, tags: ['toeic']),
    _n('b', title: 'Thì hiện tại đơn', group: 'en_tenses', level: CEFRLevel.a1),
    _n('c', explanation: 'nói về **điều kiện** trong quá khứ', group: 'en_conditionals', level: CEFRLevel.b2),
  ];

  test('query matches folded across fields', () {
    final r = applyKnowledgeFilter(notes,
        const KnowledgeFilter(query: 'dieu kien'));
    expect(r.map((n) => n.id), containsAll(['a', 'c']));
  });

  test('group + level filters AND across, OR within', () {
    final r = applyKnowledgeFilter(notes, const KnowledgeFilter(
      groupIds: {'en_conditionals'}, levels: {CEFRLevel.b1},
    ));
    expect(r.map((n) => n.id), ['a']);
  });

  test('tag filter', () {
    final r = applyKnowledgeFilter(notes, const KnowledgeFilter(tags: {'toeic'}));
    expect(r.map((n) => n.id), ['a']);
  });

  test('group counts and all tags', () {
    expect(knowledgeGroupCounts(notes)['en_conditionals'], 2);
    expect(knowledgeAllTags(notes), ['toeic']);
  });

  group('visibleKnowledgeTags', () {
    const tags = ['a', 'b', 'c', 'd', 'e'];

    test('returns every tag with no overflow when under the cap', () {
      final r = visibleKnowledgeTags(tags, const {}, 8);
      expect(r.visible, tags);
      expect(r.hiddenCount, 0);
    });

    test('caps at max and reports how many are hidden', () {
      final r = visibleKnowledgeTags(tags, const {}, 3);
      expect(r.visible, ['a', 'b', 'c']);
      expect(r.hiddenCount, 2);
    });

    test('prioritizes selected tags so an active filter is never hidden', () {
      // "e" is selected but would otherwise fall outside a cap of 3 by
      // plain order.
      final r = visibleKnowledgeTags(tags, const {'e'}, 3);
      expect(r.visible, ['e', 'a', 'b']);
      expect(r.hiddenCount, 2);
    });

    test('keeps all selected tags visible even if they exceed the cap alone',
        () {
      final r = visibleKnowledgeTags(tags, const {'b', 'd', 'e'}, 2);
      expect(r.visible, ['b', 'd', 'e']);
      expect(r.hiddenCount, 2);
    });
  });
}
