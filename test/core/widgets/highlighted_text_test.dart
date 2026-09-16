import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lexi_core/core/theme/app_theme.dart';
import 'package:lexi_core/core/theme/bloom_tokens.dart';
import 'package:lexi_core/core/widgets/highlighted_text.dart';

void main() {
  testWidgets('no highlights → plain Text', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light,
      home: const Scaffold(
        body: HighlightedText(text: 'hello world', highlights: []),
      ),
    ));
    expect(find.text('hello world'), findsOneWidget);
  });

  testWidgets('accent-insensitive match splits into spans', (tester) async {
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light,
      home: const Scaffold(
        body: HighlightedText(
          text: 'Tôi thích điều kiện', highlights: ['dieu kien'],
        ),
      ),
    ));
    final rich = tester.widget<RichText>(find.byType(RichText));
    final root = rich.text as TextSpan;
    final matched = (root.children!).map((s) => (s as TextSpan).text).toList();
    expect(matched, ['Tôi thích ', 'điều kiện']);
  });

  // Regression test: knowledge_detail_screen.dart's example sentence passes
  // `style: const TextStyle(fontSize: 15)` (no color) — RichText/TextSpan
  // don't inherit DefaultTextStyle's color the way the Text widget does, and
  // the rendering engine's fallback for an unset TextSpan color is white, so
  // the sentence was invisible on the light theme's light background (it
  // happened to look fine on the dark theme's dark background, which is why
  // this went unnoticed until someone used light mode).
  testWidgets(
      'a style without an explicit color still resolves to bloom.ink, not white',
      (tester) async {
    late BuildContext capturedContext;
    await tester.pumpWidget(MaterialApp(
      theme: AppTheme.light,
      home: Scaffold(
        body: Builder(
          builder: (context) {
            capturedContext = context;
            return const HighlightedText(
              text: 'Tôi thích điều kiện',
              highlights: ['dieu kien'],
              style: TextStyle(fontSize: 15),
            );
          },
        ),
      ),
    ));

    final rich = tester.widget<RichText>(find.byType(RichText));
    final root = rich.text as TextSpan;
    final nonHighlighted = root.children!.first as TextSpan;
    expect(nonHighlighted.style!.color, capturedContext.bloom.ink);
    expect(nonHighlighted.style!.color, isNot(Colors.white));
  });

  testWidgets('an explicit color in the passed style is preserved',
      (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(
        body: HighlightedText(
          text: 'Tôi thích điều kiện',
          highlights: ['dieu kien'],
          style: TextStyle(fontSize: 15, color: Colors.red),
        ),
      ),
    ));

    final rich = tester.widget<RichText>(find.byType(RichText));
    final root = rich.text as TextSpan;
    final nonHighlighted = root.children!.first as TextSpan;
    expect(nonHighlighted.style!.color, Colors.red);
  });
}
