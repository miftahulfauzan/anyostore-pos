import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'api_client.dart';
import 'format.dart';
import 'pos_page.dart';
import 'task_ui.dart';

const _kBg = Color(0xffF5F1EA);
const _kDark = Color(0xff1E3A5F);
const _kOrange = Color(0xff2E5D8F);
const _kTeal = Color(0xff7FA8CF);
const _kGray = Color(0xff8A857C);

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key, required this.api});
  final ApiClient api;

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await widget.api.dashboard();
      if (!mounted) return;
      setState(() => _data = data);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _openKasir() {
    Navigator.of(context).popUntil((route) => route.isFirst);
    PosPage.requestTab.value = 0;
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!),
              const SizedBox(height: 12),
              FilledButton(onPressed: _load, child: const Text('Coba lagi')),
            ],
          ),
        ),
      );
    }
    final summary = (_data?['summary'] as Map<String, dynamic>?) ?? {};
    final recent = ((_data?['recent_transactions'] as List?) ?? [])
        .cast<Map<String, dynamic>>();
    final today = fmtRp(asNum(summary['today_sales']));
    final week = fmtRp(asNum(summary['seven_day_sales']));
    final month = fmtRp(asNum(summary['month_sales']));
    final expenses = fmtRp(asNum(summary['today_expenses']));

    return ColoredBox(
      color: _kBg,
      child: RefreshIndicator(
        onRefresh: _load,
        color: _kDark,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _circleButton(
                    Icons.storefront, () => _openKasir()),
                const Column(
                  children: [
                    Text('Anyostore App',
                        style: TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.w800,
                            color: _kDark,
                            letterSpacing: -0.4)),
                    SizedBox(height: 3),
                    Text('Ringkasan bisnis Anda',
                        style: TextStyle(fontSize: 13, color: _kGray)),
                  ],
                ),
                _circleButton(Icons.refresh, _load),
              ],
            ),
            const SizedBox(height: 18),
            // Gauge penjualan hari ini
            SizedBox(
              width: 260,
              height: 260,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  const CustomPaint(
                    size: Size(260, 260),
                    painter: _GaugePainter(),
                  ),
                  Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Text('PENJUALAN HARI INI',
                          style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 0.6,
                              color: _kGray)),
                      const SizedBox(height: 4),
                      FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(today,
                            style: const TextStyle(
                                fontSize: 32,
                                fontWeight: FontWeight.w800,
                                color: _kDark,
                                letterSpacing: -0.5)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 4),
            // Mini stats
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _miniStat('7 Hari', week),
                  _miniStat('Bulan Ini', month, alignRight: true),
                ],
              ),
            ),
            const SizedBox(height: 22),
            const Text('Ringkasan Hari Ini',
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: _kDark)),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: _overviewCard(
                      'Transaksi',
                      '${summary['today_transactions'] ?? 0}',
                      Icons.receipt_long,
                      _kDark,
                      const Color(0xffE3EAF2)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _overviewCard('Pengeluaran', expenses,
                      Icons.account_balance_wallet, _kOrange,
                      const Color(0xffE3EAF2)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _overviewCard('Penjualan 7 Hari', week,
                      Icons.trending_up, _kTeal, const Color(0xffE9F1EF)),
                ),
              ],
            ),
            if (recent.isNotEmpty) ...[
              const SizedBox(height: 22),
              GlassCard(
                padding: const EdgeInsets.all(16),
                radius: 24,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Transaksi Terakhir',
                        style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            color: _kDark)),
                    const SizedBox(height: 8),
                    for (final t in recent)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 5),
                        child: Row(
                          children: [
                            Container(
                              width: 34,
                              height: 34,
                              decoration: BoxDecoration(
                                color: const Color(0xffE6ECF3),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(Icons.receipt,
                                  size: 16, color: _kDark),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                crossAxisAlignment:
                                    CrossAxisAlignment.start,
                                children: [
                                  Text(
                                      t['invoice_no']?.toString() ?? '',
                                      style: const TextStyle(
                                          fontSize: 12,
                                          fontWeight: FontWeight.w700,
                                          color: _kDark)),
                                  Text(
                                      t['cashier']?.toString() ?? '',
                                      style: const TextStyle(
                                          fontSize: 10, color: _kGray)),
                                ],
                              ),
                            ),
                            Text(fmtRp(asNum(t['grand_total'])),
                                style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w800,
                                    color: _kDark)),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 24),
            // CTA Mulai Kasir
            SizedBox(
              height: 58,
              child: FilledButton(
                onPressed: _openKasir,
                style: FilledButton.styleFrom(
                  backgroundColor: _kDark,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(29)),
                  padding: const EdgeInsets.only(left: 30, right: 6),
                ),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text('Mulai Kasir',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w600)),
                    ),
                    Container(
                      width: 44,
                      height: 44,
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.arrow_forward,
                          size: 20, color: _kDark),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _circleButton(IconData icon, VoidCallback onTap) {
    return Material(
      color: Colors.white,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(icon, size: 19, color: _kDark),
        ),
      ),
    );
  }

  Widget _miniStat(String label, String value, {bool alignRight = false}) {
    final text = Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Flexible(
          child: Text(value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                  color: _kDark)),
        ),
      ],
    );
    return Column(
      crossAxisAlignment:
          alignRight ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        text,
        const SizedBox(height: 3),
        Text(label,
            style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: _kGray)),
      ],
    );
  }

  Widget _overviewCard(
      String label, String value, IconData icon, Color chipFg, Color chipBg) {
    return GlassCard(
      height: 118,
      padding: const EdgeInsets.all(12),
      radius: 24,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label,
                  style:
                      const TextStyle(fontSize: 10, color: _kGray)),
              Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  color: chipBg,
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Icon(icon, size: 14, color: chipFg),
              ),
            ],
          ),
          Text(value,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: _kDark)),
        ],
      ),
    );
  }
}

class _GaugePainter extends CustomPainter {
  const _GaugePainter();

  @override
  void paint(Canvas canvas, Size size) {
    const segments = 48;
    const inner = 74.0;
    const short = 15.0;
    const long = 40.0;
    const stroke = 7.0;
    final center = Offset(size.width / 2, size.height / 2);
    for (var i = 0; i < segments; i++) {
      final deg = (i / segments) * 360;
      late final Color color;
      late final double length;
      if (deg >= 330 || deg <= 150) {
        color = _kOrange;
        length = long;
      } else if (deg > 150 && deg <= 225) {
        color = _kDark;
        length = short;
      } else {
        color = _kTeal;
        length = short;
      }
      final rad = (deg - 90) * math.pi / 180;
      final start = Offset(
          center.dx + inner * math.cos(rad),
          center.dy + inner * math.sin(rad));
      final end = Offset(
          center.dx + (inner + length) * math.cos(rad),
          center.dy + (inner + length) * math.sin(rad));
      canvas.drawLine(
        start,
        end,
        Paint()
          ..color = color
          ..strokeWidth = stroke
          ..strokeCap = StrokeCap.round,
      );
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
