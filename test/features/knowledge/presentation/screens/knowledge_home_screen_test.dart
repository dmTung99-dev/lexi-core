import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../_fakes.dart';

void main() {
  testWidgets('shows a group grid with counts', (tester) async {
    final svc = FakeKnowledgeService()
      ..store.addAll([
        noteFixture(id: 'a', group: 'en_tenses'),
        noteFixture(id: 'b', group: 'en_tenses'),
        noteFixture(id: 'c', group: 'en_conditionals'),
      ]);
    await pumpHome(tester, svc);
    expect(find.text('Thì'), findsOneWidget);
    expect(find.text('2'), findsWidgets); // count badge
  });

  testWidgets('typing in search switches to a flat result list', (tester) async {
    final svc = FakeKnowledgeService()
      ..store.addAll([
        noteFixture(id: 'a', title: 'Câu điều kiện loại 2'),
        noteFixture(id: 'b', title: 'Thì hiện tại đơn'),
      ]);
    await pumpHome(tester, svc);
    await tester.enterText(find.byType(TextField).first, 'dieu kien');
    await tester.pumpAndSettle();
    expect(find.text('Câu điều kiện loại 2'), findsOneWidget);
    expect(find.text('Thì hiện tại đơn'), findsNothing);
  });

  testWidgets('Khôi phục ghi chú mẫu calls restoreStarters', (tester) async {
    final svc = FakeKnowledgeService();
    await pumpHome(tester, svc);
    await tester.tap(find.byIcon(Icons.more_vert));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Khôi phục ghi chú mẫu'));
    await tester.pumpAndSettle();
    expect(svc.restoreCalls, 1);
  });

  testWidgets('caps the tag bar and opens a sheet with the rest on "+N"',
      (tester) async {
    // 10 distinct tags across notes — exceeds the 8-tag cap, so 2 must be
    // tucked behind the "+2" trigger instead of rendering unbounded.
    final svc = FakeKnowledgeService()
      ..store.addAll([
        for (var i = 0; i < 10; i++)
          noteFixture(id: 'n$i', tags: ['tag-$i']),
      ]);
    await pumpHome(tester, svc);

    for (var i = 0; i < 8; i++) {
      expect(find.text('tag-$i'), findsOneWidget);
    }
    expect(find.text('tag-8'), findsNothing);
    expect(find.text('tag-9'), findsNothing);
    expect(find.text('+2'), findsOneWidget);

    await tester.tap(find.text('+2'));
    await tester.pumpAndSettle();

    // The sheet's option list is a lazily-built ListView taller than the
    // sheet's initial size — scroll it so the last (hidden-behind-the-cap)
    // items are actually built before asserting on them.
    await tester.dragUntilVisible(
      find.text('tag-9'),
      find.byType(Scrollable).last,
      const Offset(0, -100),
    );
    await tester.pumpAndSettle();

    expect(find.text('tag-8'), findsOneWidget);
    expect(find.text('tag-9'), findsOneWidget);
  });

  testWidgets('selecting a hidden tag from the sheet filters the list',
      (tester) async {
    final svc = FakeKnowledgeService()
      ..store.addAll([
        for (var i = 0; i < 10; i++)
          noteFixture(id: 'n$i', title: 'Note $i', tags: ['tag-$i']),
      ]);
    await pumpHome(tester, svc);

    await tester.tap(find.text('+2'));
    await tester.pumpAndSettle();
    await tester.dragUntilVisible(
      find.text('tag-9'),
      find.byType(Scrollable).last,
      const Offset(0, -100),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('tag-9'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Áp dụng (1)'));
    await tester.pumpAndSettle();

    expect(find.text('Note 9'), findsOneWidget);
    expect(find.text('Note 0'), findsNothing);
  });
}
