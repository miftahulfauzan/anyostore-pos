// ignore_for_file: prefer_const_constructors

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'api_client.dart';
import 'auth_store.dart';
import 'format.dart';
import 'task_ui.dart';

/// Audit produk dengan HARGA MODAL (cost) >= HARGA JUAL (price).
class CostAuditPage extends StatefulWidget {
  const CostAuditPage({super.key, required this.api});
  final ApiClient api;

  @override
  State<CostAuditPage> createState() => _CostAuditPageState();
}

class _CostAuditPageState extends State<CostAuditPage> {
  bool _loading = true;
  List<Map<String, dynamic>> _bad = [];
  int _checked = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final branch =
          widget.api.activeBranchId ?? context.read<AuthStore>().branchId ?? 0;
      final rows = (await widget.api.products(branchId: branch))
          .cast<Map<String, dynamic>>();
      final bad = rows
          .where((p) => asNum(p['cost']) >= asNum(p['price']))
          .toList()
        ..sort((a, b) => (asNum(b['cost']) - asNum(b['price']))
            .compareTo(asNum(a['cost']) - asNum(a['price'])));
      if (!mounted) return;
      setState(() {
        _bad = bad;
        _checked = rows.length;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  double get _totalLoss =>
      _bad.fold(0, (s, p) => s + (asNum(p['cost']) - asNum(p['price'])));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: pageBg(context),
      appBar: AppBar(
        surfaceTintColor: Colors.transparent,
        title: const Text('Audit Modal vs Harga Jual'),
      ),
      body: Stack(
        children: [
          const Positioned.fill(child: SoftBlobs()),
          ListView(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 32),
            children: [
              GlassCard(
                padding: const EdgeInsets.all(14),
                radius: 20,
                child: Column(
                  children: [
                    Text('$_bad/$_checked produk modal ≥ harga jual',
                        style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: _bad.isEmpty
                                ? const Color(0xff2E7D4F)
                                : const Color(0xffC2410C))),
                    const SizedBox(height: 4),
                    Text(
                        _bad.isEmpty
                            ? 'Semua harga modal di bawah harga jual. Bagus!'
                            : 'Total selisih potensial: ${fmtRp(_totalLoss)}',
                        style: const TextStyle(
                            fontSize: 12, color: Color(0xff8A857C))),
                  ],
                ),
              ),
              const SizedBox(height: 10),
              if (_loading)
                const Padding(
                  padding: EdgeInsets.all(32),
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_bad.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(32),
                  child: Center(child: Text('Tidak ada produk bermasalah')),
                )
              else
                for (final p in _bad)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: GlassCard(
                      padding: const EdgeInsets.all(12),
                      radius: 16,
                      child: Row(
                        children: [
                          Container(
                            width: 38,
                            height: 38,
                            decoration: BoxDecoration(
                              color: const Color(0x14C2410C),
                              borderRadius: BorderRadius.circular(11),
                            ),
                            child: const Icon(Icons.warning_amber_rounded,
                                size: 19, color: Color(0xffC2410C)),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(p['name']?.toString() ?? '-',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w700)),
                                Text(
                                    '${p['sku'] ?? ''} · stok ${p['stock'] ?? 0}',
                                    style: const TextStyle(
                                        fontSize: 10.5,
                                        color: Color(0xff8A857C))),
                                Text(
                                    'Jual ${fmtRp(asNum(p['price']))} · Modal ${fmtRp(asNum(p['cost']))}',
                                    style: const TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w700,
                                        color: Color(0xffC2410C))),
                              ],
                            ),
                          ),
                          Text(
                              '+${fmtRp(asNum(p['cost']) - asNum(p['price']))}',
                              style: const TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                  color: Color(0xffC2410C))),
                        ],
                      ),
                    ),
                  ),
            ],
          ),
        ],
      ),
    );
  }
}
