
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pinjie/main.dart';
void main() {
  test('金额按分精确展示', () {
    expect(formatFen(10001), '¥100.01');
    expect(formatFen(0), '¥0.00');
  });
  testWidgets('首页不分品类显示总榜空态', (tester) async {
    tester.view.physicalSize = const Size(390, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(ProviderScope(overrides: [
      globalBoardProvider.overrideWith((ref) async => []),
    ], child: const MaterialApp(home: DiscoverPage())));
    await tester.pumpAndSettle();
    expect(find.text('全站商家累计总榜'), findsOneWidget);
    expect(find.text('榜首之位，等待你的品牌。'), findsOneWidget);
    expect(find.byType(DropdownButtonFormField<String>), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('前三名突出展示且没有底部推荐', (tester) async {
    tester.view.physicalSize = const Size(390, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final rows = List.generate(3, (i) => {'id':'m$i','merchant_id':'m$i','rank':i+1,'name':'品牌$i','category_names':['手表'],'net_fen':(3-i)*10000,'gross_fen':(3-i)*10000,'refunded_fen':0});
    await tester.pumpWidget(ProviderScope(overrides: [
      globalBoardProvider.overrideWith((ref) async => rows),
    ], child: const MaterialApp(home: DiscoverPage())));
    await tester.pumpAndSettle();
    expect(find.byType(GlobalMerchantCard), findsNWidgets(3));
    expect(find.text('♛ 榜首'), findsOneWidget);
    expect(find.text('探索品类'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
