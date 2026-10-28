
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';
import 'package:url_launcher/url_launcher.dart';

const apiBase = String.fromEnvironment('API_BASE', defaultValue: 'http://127.0.0.1:3100/api/v1');
final dioProvider = Provider((ref) => Dio(BaseOptions(baseUrl: apiBase, connectTimeout: const Duration(seconds: 15), receiveTimeout: const Duration(seconds: 15))));
final categoriesProvider = FutureProvider<List<dynamic>>((ref) async => (await ref.watch(dioProvider).get('/categories')).data['items'] as List<dynamic>);
final profilesProvider = FutureProvider.family<List<dynamic>, String>((ref, id) async => (await ref.watch(dioProvider).get('/categories/$id/brands')).data['items'] as List<dynamic>);
final boardProvider = FutureProvider.family<List<dynamic>, String>((ref, id) async => (await ref.watch(dioProvider).get('/categories/$id/merchant-board')).data['items'] as List<dynamic>);
final globalBoardProvider = FutureProvider<List<dynamic>>((ref) async => (await ref.watch(dioProvider).get('/merchant-board')).data['items'] as List<dynamic>);
final compareProvider = StateProvider<List<Map<String, dynamic>>>((ref) => []);
final router = GoRouter(initialLocation: '/discover', routes: [
  GoRoute(path: '/discover', builder: (c, s) => const DiscoverPage()),
  GoRoute(path: '/categories', builder: (c, s) => const CategoryPage()),
  GoRoute(path: '/categories/:id/brands', builder: (c, s) => BrandPage(categoryId: s.pathParameters['id']!, name: s.uri.queryParameters['name'] ?? '品牌')),
  GoRoute(path: '/merchant-board', builder: (c, s) => const BoardPage()),
  GoRoute(path: '/compare', builder: (c, s) => const ComparePage()),
  GoRoute(path: '/me', builder: (c, s) => const MePage()),
]);

void main() => runApp(const ProviderScope(child: PinjieApp()));
String formatFen(num n) => '¥${(n / 100).toStringAsFixed(2)}';
const bronze = Color(0xFFA16207);
class PinjieApp extends StatelessWidget {
  const PinjieApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp.router(
    title: '奢榜',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(useMaterial3: true, scaffoldBackgroundColor: const Color(0xFFFAFAF9), colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1C1917)).copyWith(primary: const Color(0xFF1C1917), onPrimary: Colors.white, surface: Colors.white, surfaceContainer: const Color(0xFFF0EDE6), secondaryContainer: const Color(0xFFEEE8D9)), cardTheme: const CardThemeData(color: Colors.white), appBarTheme: const AppBarTheme(backgroundColor: Color(0xFFFAFAF9)), textTheme: const TextTheme(bodyMedium: TextStyle(height: 1.6)), filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(backgroundColor: const Color(0xFF1C1917), minimumSize: const Size(48, 48)))),
    darkTheme: ThemeData(useMaterial3: true, brightness: Brightness.dark, scaffoldBackgroundColor: const Color(0xFF121212), colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFFF4C56A), brightness: Brightness.dark)),
    routerConfig: router,
  );
}
class Frame extends ConsumerWidget {
  final String title; final Widget child; final int index;
  const Frame({super.key, required this.title, required this.child, this.index = 0});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const destinations = [NavigationDestination(icon: Icon(Icons.explore_outlined), label: '总榜'), NavigationDestination(icon: Icon(Icons.grid_view), label: '图鉴'), NavigationDestination(icon: Icon(Icons.bar_chart), label: '商家榜'), NavigationDestination(icon: Icon(Icons.person_outline), label: '我的')];
    void go(int i) => context.go(['/discover','/categories','/merchant-board','/me'][i]);
    final wide = MediaQuery.sizeOf(context).width >= 1024;
    final selected = ref.watch(compareProvider);
    return Scaffold(
      appBar: AppBar(title: Text(title), actions: [if (selected.isNotEmpty) TextButton.icon(onPressed: () => context.push('/compare'), icon: const Icon(Icons.compare_arrows), label: Text('对比 ${selected.length}/3')), const Padding(padding: EdgeInsets.all(12), child: Chip(label: Text('演示')))]),
      body: Row(children: [
        if (wide) NavigationRail(selectedIndex: index, onDestinationSelected: go, labelType: NavigationRailLabelType.all, destinations: const [NavigationRailDestination(icon: Icon(Icons.explore_outlined), label: Text('总榜')), NavigationRailDestination(icon: Icon(Icons.grid_view), label: Text('图鉴')), NavigationRailDestination(icon: Icon(Icons.bar_chart), label: Text('商家榜')), NavigationRailDestination(icon: Icon(Icons.person_outline), label: Text('我的'))]),
        Expanded(child: Align(alignment: Alignment.topCenter, child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 1100), child: child))),
      ]),
      bottomNavigationBar: wide ? null : NavigationBar(selectedIndex: index, onDestinationSelected: go, destinations: destinations),
    );
  }
}
Widget asyncList(AsyncValue<List<dynamic>> value, Widget Function(List<dynamic>) data, VoidCallback retry) => value.when(
  data: data,
  loading: () => const Center(child: CircularProgressIndicator()),
  error: (e, s) => Center(child: Padding(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, children: [const Text('暂时无法读取数据，请确认 API 已启动。'), const SizedBox(height: 16), FilledButton(onPressed: retry, child: const Text('重试'))]))),
);

class DiscoverPage extends ConsumerWidget {
  const DiscoverPage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => Frame(title: '奢榜', child: ListView(padding: const EdgeInsets.all(20), children: [
    const SizedBox(height: 12),
    const Center(child: Text('全站商家累计总榜', style: TextStyle(color: bronze, fontSize: 12))),
    const SizedBox(height: 12),
    const Text('让品牌，站上高位。', textAlign: TextAlign.center, style: TextStyle(fontSize: 32, height: 1.5)),
    const SizedBox(height: 14),
    const Text('不分品类，按累计有效推广投入排名。\n持续累计不清零。', textAlign: TextAlign.center),
    const SizedBox(height: 24),
    const HomeMerchantBoard(),
  ]));
}
class HomeMerchantBoard extends ConsumerWidget {
  const HomeMerchantBoard({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => asyncList(ref.watch(globalBoardProvider), (rows) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Text('商业推广 · 有效累计 = 实付 − 成功退款。金额不代表质量、自然人气或官方授权。当前为本地沙箱。', style: TextStyle(fontSize: 12, color: bronze)),
      const SizedBox(height: 24),
      if (rows.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 50), child: Column(children: [Icon(Icons.emoji_events_outlined, size: 55, color: bronze), SizedBox(height: 20), Text('榜首之位，等待你的品牌。', style: TextStyle(fontSize: 22)), SizedBox(height: 12), Text('暂无商家投入，不展示虚构金额。')])),
      if (rows.isNotEmpty) LayoutBuilder(builder: (context, constraints) {
        final top = rows.take(3).toList();
        if (constraints.maxWidth < 650) {
          return Column(children: [
            GlobalMerchantCard(merchant: Map<String,dynamic>.from(top[0])),
            const SizedBox(height: 16),
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (top.length > 1) Expanded(child: GlobalMerchantCard(merchant: Map<String,dynamic>.from(top[1]))),
              if (top.length > 2) ...[const SizedBox(width: 10), Expanded(child: GlobalMerchantCard(merchant: Map<String,dynamic>.from(top[2])))],
            ]),
          ]);
        }
        final ordered = [if(top.length>1) top[1],top[0],if(top.length>2) top[2]];
        return Row(crossAxisAlignment: CrossAxisAlignment.end, children: ordered.map((m) => Expanded(child: Padding(padding: const EdgeInsets.all(6), child: GlobalMerchantCard(merchant: Map<String,dynamic>.from(m))))).toList());
      }),
      if (rows.length > 3) ...[
        const SizedBox(height: 28), const Text('更多上榜品牌', style: TextStyle(fontSize: 20)), const SizedBox(height: 12),
        ...rows.skip(3).map((m) => ListTile(contentPadding: EdgeInsets.zero, leading: Text('${m['rank']}', style: const TextStyle(fontSize: 24, color: bronze)), title: Text(m['name']), subtitle: Text(formatFen(m['net_fen'])), trailing: const Icon(Icons.chevron_right), onTap: () => showGlobalMerchant(context, ref, Map<String,dynamic>.from(m)))),
      ],
      const SizedBox(height: 24), const Text('同一推广品牌各品类有效累计额汇总，仅出现一次。同额按最近净额变动时间、品牌ID排序。', style: TextStyle(fontSize: 11)),
    ]);
  }, () => ref.invalidate(globalBoardProvider));
}
class GlobalMerchantCard extends ConsumerWidget {
  final Map<String,dynamic> merchant;
  const GlobalMerchantCard({super.key, required this.merchant});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final champion = merchant['rank'] == 1;
    final colors = Theme.of(context).colorScheme;
    return Material(
      color: champion ? const Color(0xFF25231E) : colors.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8), side: BorderSide(color: merchant['rank']==3 ? const Color(0xFFA97B55) : const Color(0xFFB99A5B))),
      clipBehavior: Clip.antiAlias,
      child: InkWell(onTap: () => showGlobalMerchant(context,ref,merchant), child: Padding(padding: EdgeInsets.all(champion ? 24 : 16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(champion ? '♛ 榜首' : '第 ${merchant['rank']} 名', style: TextStyle(color: champion ? const Color(0xFFE5CE97) : bronze, fontSize: 13)),
        const SizedBox(height: 20),
        Text(merchant['name'], style: TextStyle(fontSize: champion ? 24 : 19, color: champion ? Colors.white : colors.onSurface)),
        const SizedBox(height: 8),
        Text((merchant['category_names'] as List<dynamic>?)?.join(' / ') ?? '', style: TextStyle(fontSize: 11, color: champion ? const Color(0xFFC2B28A) : colors.onSurfaceVariant)),
        SizedBox(height: champion ? 22 : 18),
        Text('累计有效投入', style: TextStyle(fontSize: 11, color: champion ? const Color(0xFFC2B28A) : colors.onSurfaceVariant)),
        const SizedBox(height: 6),
        Text(formatFen(merchant['net_fen']), style: TextStyle(fontSize: champion ? 28 : 23, color: champion ? const Color(0xFFE5CE97) : colors.onSurface)),
      ]))),
    );
  }
}
Future<void> showGlobalMerchant(BuildContext context, WidgetRef ref, Map<String,dynamic> merchant) async {
  try {
    final response = await ref.read(dioProvider).get('/merchants/${merchant['merchant_id']}');
    if (!context.mounted) return;
    final data = response.data;
    showModalBottomSheet(context: context, isScrollControlled: true, builder: (context) => SafeArea(child: SingleChildScrollView(padding: const EdgeInsets.all(26), child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      const Text('商业推广 · 全站累计', style: TextStyle(color: bronze)),
      Text(merchant['name'], style: const TextStyle(fontSize: 28)), const SizedBox(height: 14),
      Text('第 ${merchant['rank']} 名 · ${formatFen(merchant['net_fen'])}', style: const TextStyle(fontSize: 22)),
      Text('累计实付 ${formatFen(merchant['gross_fen'])} / 已退 ${formatFen(merchant['refunded_fen'])}'),
      const SizedBox(height: 20), const Text('各品类投入明细', style: TextStyle(fontSize: 18)),
      ...(data['entries'] as List<dynamic>).map((e) => Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Text("${e['category_name']}：${formatFen(e['net_fen'])}"))),
      if(data['description'].toString().isNotEmpty) Padding(padding: const EdgeInsets.symmetric(vertical: 16), child: Text(data['description'])),
      TextButton(onPressed: () => Navigator.pop(context), child: const Text('返回总榜')),
    ]))));
  } catch (_) {
    if(context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('商家暂不可用，请重试。')));
  }
}
class CategoryPage extends ConsumerStatefulWidget {
  const CategoryPage({super.key});
  @override
  ConsumerState<CategoryPage> createState() => _CategoryState();
}
class _CategoryState extends ConsumerState<CategoryPage> {
  final search = TextEditingController();
  List<dynamic>? results;
  bool busy = false;
  String? error;
  @override
  void dispose() { search.dispose(); super.dispose(); }
  Future<void> find() async {
    setState(() {busy = true; error = null;});
    try {final r = await ref.read(dioProvider).get('/search', queryParameters: {'q': search.text}); if (mounted) setState(() => results = r.data['items']);}
    catch (_) {if (mounted) setState(() => error = '搜索失败，请重试。');}
    finally {if (mounted) setState(() => busy = false);}
  }
  @override
  Widget build(BuildContext context) => Frame(title: '奢品图鉴', index: 1, child: ListView(padding: const EdgeInsets.all(20), children: [
    const Text('从一个品类，开始了解。', style: TextStyle(fontSize: 28)), const SizedBox(height: 18),
    TextField(controller: search, onSubmitted: (_) => find(), decoration: InputDecoration(labelText: '搜索品牌中文或英文名', border: const OutlineInputBorder(), suffixIcon: IconButton(onPressed: busy ? null : find, icon: const Icon(Icons.search)))),
    if (busy) const LinearProgressIndicator(), if (error != null) Text(error!),
    if (results != null) ...[TextButton(onPressed: () => setState(() => results = null), child: const Text('返回品类目录')), if (results!.isEmpty) const Padding(padding: EdgeInsets.all(24), child: Text('没有找到匹配品牌。')), ...results!.map((p) => BrandTile(profile: Map<String, dynamic>.from(p)))],
    if (results == null) asyncList(ref.watch(categoriesProvider), (rows) => LayoutBuilder(builder: (context, box) => Wrap(children: rows.map((c) => SizedBox(width: box.maxWidth / (box.maxWidth > 700 ? 4 : 3), child: Padding(padding: const EdgeInsets.all(6), child: OutlinedButton(onPressed: () => context.push('/categories/${c['id']}/brands?name=${c['name']}'), child: Padding(padding: const EdgeInsets.symmetric(vertical: 22), child: Text(c['name'])))))).toList())), () => ref.invalidate(categoriesProvider)),
  ]));
}
class BrandPage extends ConsumerWidget {
  final String categoryId, name;
  const BrandPage({super.key, required this.categoryId, required this.name});
  @override
  Widget build(BuildContext context, WidgetRef ref) => Frame(title: '$name · 品牌观察', index: 1, child: asyncList(ref.watch(profilesProvider(categoryId)), (rows) => ListView(padding: const EdgeInsets.all(20), children: [
    const Text('榜单待完善', style: TextStyle(fontSize: 27)), const SizedBox(height: 12), const Text('当前为演示资料目录。至少 5 份经复核资料后发布正式榜单；付费推广不影响品牌定位。'), const SizedBox(height: 24),
    if (rows.isEmpty) const Text('暂无公开资料，内容补充中。'),
    ...rows.map((p) => BrandTile(profile: Map<String, dynamic>.from(p))),
  ]), () => ref.invalidate(profilesProvider(categoryId))));
}
class BrandTile extends ConsumerWidget {
  final Map<String, dynamic> profile;
  const BrandTile({super.key, required this.profile});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = profile, selected = ref.watch(compareProvider), included = selected.any((r) => r['id'] == p['id']);
    return Card(margin: const EdgeInsets.only(bottom: 16), child: Padding(padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('虚构演示品牌', style: TextStyle(fontSize: 12, color: bronze)),
      ListTile(contentPadding: EdgeInsets.zero, title: Text('${p['name']}  ${p['english']}', style: const TextStyle(fontSize: 24)), subtitle: Text(p['tier']), onTap: () => showModalBottomSheet(context: context, isScrollControlled: true, builder: (context) => SafeArea(child: SingleChildScrollView(padding: const EdgeInsets.all(28), child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
        Text(p['name'], style: const TextStyle(fontSize: 28)), const SizedBox(height: 18), Text(p['summary']), const SizedBox(height: 18), Text('适用场合：${p['occasion']}'), Text('辨识度：${p['recognition']}'), const SizedBox(height: 18), Text('资料依据：${p['source']}'), Text('版本：${p['version']}'), const SizedBox(height: 20), FilledButton(onPressed: () => Navigator.pop(context), child: const Text('返回目录')),
      ]))))),
      Text(p['summary']), const SizedBox(height: 12),
      OutlinedButton.icon(onPressed: () {
        if (included) {ref.read(compareProvider.notifier).state = selected.where((r) => r['id'] != p['id']).toList(); return;}
        if (selected.length >= 3 || selected.isNotEmpty && selected.first['category_id'] != p['category_id']) {ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('只能对比同品类的最多三个品牌。'))); return;}
        ref.read(compareProvider.notifier).state = [...selected,p];
      }, icon: Icon(included ? Icons.check : Icons.add), label: Text(included ? '已加入对比' : '加入对比')),
    ])));
  }
}
class ComparePage extends ConsumerWidget {
  const ComparePage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rows = ref.watch(compareProvider);
    return Frame(title: '品牌对比', child: ListView(padding: const EdgeInsets.all(20), children: [
      const Text('同品类对比 · 全部为演示资料'), const SizedBox(height: 20),
      if (rows.isEmpty) const Text('请先从品牌目录加入对比。') else SingleChildScrollView(scrollDirection: Axis.horizontal, child: DataTable(columns: [const DataColumn(label: Text('维度')), ...rows.map((p) => DataColumn(label: Text(p['name'])))], rows: [
        for (final field in [['tier','当前定位'],['recognition','大众辨识'],['occasion','适用场合'],['source','资料依据']]) DataRow(cells: [DataCell(Text(field[1])), ...rows.map((p) => DataCell(SizedBox(width: 190, child: Text(p[field[0]]))))]),
      ])),
      const SizedBox(height: 16), TextButton(onPressed: () => ref.read(compareProvider.notifier).state = [], child: const Text('清空对比')),
    ]));
  }
}
class BoardPage extends ConsumerStatefulWidget {
  const BoardPage({super.key});
  @override
  ConsumerState<BoardPage> createState() => _BoardState();
}
class _BoardState extends ConsumerState<BoardPage> {
  String? category;
  @override
  Widget build(BuildContext context) => Frame(title: '商家累计榜', index: 2, child: asyncList(ref.watch(categoriesProvider), (cats) {
    final selected = category ?? cats.first['id'] as String;
    return Column(children: [
      Padding(padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('商业推广', style: TextStyle(color: bronze)), const Text('按累计有效打榜投入排序，累计不清零。金额不代表质量、自然人气或官方授权。'),
        const SizedBox(height: 16), DropdownButtonFormField<String>(initialValue: selected, isExpanded: true, decoration: const InputDecoration(labelText: '大品类', border: OutlineInputBorder()), items: cats.map((c) => DropdownMenuItem<String>(value: c['id'], child: Text(c['name']))).toList(), onChanged: (v) => setState(() => category = v)),
      ])),
      Expanded(child: asyncList(ref.watch(boardProvider(selected)), (rows) => rows.isEmpty ? const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('暂无付费商家。真实收款未开通。\n本 App 不提供购买引导。', textAlign: TextAlign.center))) : ListView.builder(itemCount: rows.length, itemBuilder: (context, i) {final m = rows[i]; return ListTile(minVerticalPadding: 20, leading: CircleAvatar(child: Text('${i + 1}')), title: Text(m['name']), subtitle: Text('有效投入 ${formatFen(m['net_fen'])}\n实付 ${formatFen(m['gross_fen'])} · 已退 ${formatFen(m['refunded_fen'])}'), isThreeLine: true, onTap: () async {
        try {final r = await ref.read(dioProvider).get('/merchants/${m['merchant_id']}'); if (!context.mounted) return; final links = r.data['links'] as List<dynamic>; showModalBottomSheet(context: context, builder: (context) => SafeArea(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(m['name'], style: const TextStyle(fontSize: 26)), Text('有效投入 ${formatFen(m['net_fen'])}'),
          if (r.data['description'].toString().isNotEmpty) Text(r.data['description']),
          ...links.map((l) => TextButton.icon(onPressed: () async {final uri = Uri.tryParse(l['url']); if (uri == null || uri.scheme != 'https') return; final ok = await showDialog<bool>(context: context, builder: (c) => AlertDialog(title: Text('即将前往 ${l['platform']}'), content: Text(uri.host), actions: [TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('取消')), TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('打开'))])); if (ok == true) {final opened = await launchUrl(uri, mode: LaunchMode.externalApplication); if (!opened) {await Clipboard.setData(ClipboardData(text: uri.toString())); if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('无法打开，链接已复制。')));}}}, icon: const Icon(Icons.open_in_new), label: Text('${l['type']} · ${l['platform']}'))),
          const SizedBox(height: 16), const Text('商业推广 · 本地沙箱资金'),
        ]))));
        } catch (_) {if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('商家信息暂不可用，请重试。')));}
      });}), () => ref.invalidate(boardProvider(selected)))),
    ]);
  }, () => ref.invalidate(categoriesProvider)));
}
class MePage extends StatelessWidget {
  const MePage({super.key});
  @override
  Widget build(BuildContext context) => Frame(title: '我的', index: 3, child: ListView(padding: const EdgeInsets.all(24), children: [
    const Icon(Icons.person_outline, size: 52), const SizedBox(height: 20), const Text('品牌的分量，由你理解。', style: TextStyle(fontSize: 26)), const SizedBox(height: 20),
    const Text('当前原生客户端提供匿名浏览、搜索、对比与外链。账号登录、同步收藏、商家管理暂在本地 Web 演示入口提供；原生登录渠道尚未接入。'),
    const SizedBox(height: 24), const ListTile(leading: Icon(Icons.verified_user_outlined), title: Text('真实支付未开通'), subtitle: Text('原生 App 不提供未经审核的购买引导。')),
    ListTile(leading: const Icon(Icons.compare_arrows), title: const Text('当前对比'), onTap: () => context.push('/compare')),
  ]));
}
