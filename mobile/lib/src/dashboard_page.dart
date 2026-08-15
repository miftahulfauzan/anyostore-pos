// ignore_for_file: prefer_const_constructors

import 'dart:math' as math;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'api_client.dart';
import 'auth_store.dart';
import 'format.dart';
import 'task_ui.dart';

const _kBlueAccent = Color(0xff2E5D8F);
const _kGreen = Color(0xff2E7D4F);
const _kRed = Color(0xffC2410C);
const _kMagenta = Color(0xffB5265E);
const _kOrange = Color(0xffF2A33C);
const _kMuted = Color(0xff8A857C);
const _kBorder = Color(0xffE7E0D6);

const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des'
];
const _days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key, required this.api});
  final ApiClient api;

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  String _preset = '7d'; // today | 7d | 30d | bulan
  DateTime? _from;
  DateTime? _to;
  bool _loading = true;

  // Data
  double _masuk = 0;
  double _keluar = 0;
  List<({String label, double masuk, double keluar})> _daily = [];
  int _aman = 62;
  int _hampir = 26;
  int _kosong = 12;
  int _totalProduk = 0;

  // Dummy (backend belum menyediakan): stok per kategori & top produk keluar.
  final List<(String, double)> _categories = const [
    ('KEMEJA', 8000),
    ('TUNIK', 2700),
    ('AB12 ON MODEL', 750),
    ('VEST', 550),
    ('CELANA', 250),
    ('ONE SET', 120),
    ('ROK', 20),
  ];
  final List<(String, double)> _topProducts = const [
    ('AT77', 2200),
    ('AB12', 2100),
    ('OB', 1280),
    ('A105', 1130),
    ('AB12-ON-MODEL', 1120),
    ('AT67', 670),
  ];

  @override
  void initState() {
    super.initState();
    // Tampilkan data dummy dulu supaya dashboard langsung kebaca.
    _daily = _dummyDaily();
    _load();
  }

  (String, String) get _rangeDates {
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    String d(DateTime x) =>
        '${x.year.toString().padLeft(4, '0')}-${x.month.toString().padLeft(2, '0')}-${x.day.toString().padLeft(2, '0')}';
    switch (_preset) {
      case 'today':
        return (d(now), d(now));
      case '30d':
        return (d(now.subtract(const Duration(days: 29))), d(now));
      case 'bulan':
        return (
          '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-01',
          d(now)
        );
      case 'custom':
        final a = _from ?? now;
        final b = _to ?? now;
        return (d(a), d(b));
      default:
        return (d(now.subtract(const Duration(days: 6))), d(now));
    }
  }

  List<({String label, double masuk, double keluar})> _dummyDaily() {
    final masuk = <double>[360, 95, 5, 440, 415, 0, 0];
    final keluar = <double>[60, 235, 20, 50, 65, 70, 0];
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    return [
      for (var i = 6; i >= 0; i--)
        (
          label:
              '${now.subtract(Duration(days: i)).day} ${_months[now.subtract(Duration(days: i)).month - 1]}',
          masuk: masuk[6 - i],
          keluar: keluar[6 - i]
        ),
    ];
  }

  String get _activeLabel {
    final now = DateTime.now().toUtc().add(const Duration(hours: 7));
    return '${_days[now.weekday - 1]}, ${now.day} ${_months[now.month - 1]} ${now.year}';
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
    });
    try {
      final (start, end) = _rangeDates;
      final branch = context.read<AuthStore>().branchId ?? 0;
      final results = await Future.wait([
        widget.api.mutationReport(type: 'in', start: start, end: end),
        widget.api.mutationReport(type: 'out', start: start, end: end),
        widget.api.mutations(dateFrom: start, dateTo: end, limit: 2000),
        widget.api.stockTotal(branchId: branch, allBranches: false),
      ]);
      if (!mounted) return;
      final inSummary = ((results[0] as Map<String, dynamic>?)?['summary']
              as Map<String, dynamic>?) ??
          {};
      final outSummary = ((results[1] as Map<String, dynamic>?)?['summary']
              as Map<String, dynamic>?) ??
          {};
      final rows = (results[2] as List?)?.cast<Map<String, dynamic>>() ?? [];
      final stockSummary = ((results[3] as Map<String, dynamic>?)?['summary']
              as Map<String, dynamic>?) ??
          {};

      // Ringkasan masuk/keluar/selisih periode terpilih.
      final masuk = asNum(inSummary['total_qty']);
      final keluar = asNum(outSummary['total_qty']);

      // Grafik harian dari mutasi (qty positif = masuk, negatif = keluar).
      final buckets = <String, List<double>>{};
      final startDate = DateTime.parse(start);
      final endDate = DateTime.parse(end);
      for (var day = startDate;
          !day.isAfter(endDate);
          day = day.add(const Duration(days: 1))) {
        final key =
            '${day.year.toString().padLeft(4, '0')}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';
        buckets[key] = [0, 0];
      }
      for (final r in rows) {
        final created = (r['created_at'] ?? '').toString();
        final key = created.contains('T') ? created.split('T').first : created;
        final qty = asNum(r['qty']);
        if (!buckets.containsKey(key)) continue;
        if (qty >= 0) {
          buckets[key]![0] += qty;
        } else {
          buckets[key]![1] += -qty;
        }
      }
      final daily = <({String label, double masuk, double keluar})>[
        for (final e in buckets.entries)
          (
            label:
                '${DateTime.parse(e.key).day} ${_months[DateTime.parse(e.key).month - 1]}',
            masuk: e.value[0],
            keluar: e.value[1]
          ),
      ];

      // Status stok dari summary stock-total.
      var aman = 62, hampir = 26, kosong = 12, total = 0;
      total = int.tryParse('${stockSummary['total_products'] ?? 0}') ?? 0;
      final low = int.tryParse('${stockSummary['low_stock'] ?? 0}') ?? 0;
      final out = int.tryParse('${stockSummary['out_of_stock'] ?? 0}') ?? 0;
      if (total > 0) {
        kosong = (out / total * 100).round();
        hampir = (low / total * 100).round();
        aman = math.max(0, 100 - kosong - hampir);
      }

      setState(() {
        _masuk = masuk;
        _keluar = keluar;
        _daily = daily.isEmpty ? _dummyDaily() : daily;
        _aman = aman;
        _hampir = hampir;
        _kosong = kosong;
        _totalProduk = total;
      });
    } on ApiException catch (_) {
      // Biarkan data dummy tetap tampil.
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  double get _selisih => _masuk - _keluar;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: pageBg(context),
      child: Stack(
        children: [
          const Positioned.fill(child: SoftBlobs()),
          Column(
            children: [
              if (_loading)
                const LinearProgressIndicator(minHeight: 2)
              else
                const SizedBox(height: 2),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 104),
                  children: [
                    _buildHeader(),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                            child: _SummaryCard(
                                label: 'Masuk',
                                value: fmtRp(_masuk),
                                icon: Icons.south_west,
                                color: _kGreen)),
                        const SizedBox(width: 8),
                        Expanded(
                            child: _SummaryCard(
                                label: 'Keluar',
                                value: fmtRp(_keluar),
                                icon: Icons.north_east,
                                color: _kRed)),
                        const SizedBox(width: 8),
                        Expanded(
                            child: _SummaryCard(
                                label: 'Selisih',
                                value: fmtRp(_selisih),
                                icon: Icons.swap_vert,
                                color: _kBlueAccent)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    _MovementCard(
                        daily: _daily,
                        totalMasuk:
                            _daily.fold<double>(0, (s, d) => s + d.masuk),
                        totalKeluar:
                            _daily.fold<double>(0, (s, d) => s + d.keluar)),
                    const SizedBox(height: 12),
                    _StatusCard(
                        aman: _aman,
                        hampir: _hampir,
                        kosong: _kosong,
                        totalProduk: _totalProduk),
                    const SizedBox(height: 12),
                    _CategoryCard(categories: _categories),
                    const SizedBox(height: 12),
                    _TopProductsCard(products: _topProducts),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    String fmt(DateTime? d) => d == null
        ? 'Pilih'
        : '${d.day.toString().padLeft(2, '0')}/${d.month.toString().padLeft(2, '0')}/${d.year}';
    return GlassCard(
      padding: const EdgeInsets.all(16),
      radius: 22,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: const Color(0x141E3A5F),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.calendar_month,
                    size: 18, color: _kBlueAccent),
              ),
              const SizedBox(width: 10),
              Text('Ringkasan',
                  style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: ink(context))),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _dateBox('Date From', fmt(_from), () async {
                  final now = DateTime.now();
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _from ?? now,
                    firstDate: DateTime(2020),
                    lastDate: now,
                  );
                  if (picked != null && mounted) {
                    setState(() {
                      _from = picked;
                      if (_to == null || _to!.isBefore(picked)) _to = picked;
                      _preset = 'custom';
                    });
                  }
                }),
              ),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 8),
                child: Text('s/d', style: TextStyle(fontSize: 12)),
              ),
              Expanded(
                child: _dateBox('Date To', fmt(_to), () async {
                  final now = DateTime.now();
                  final picked = await showDatePicker(
                    context: context,
                    initialDate: _to ?? now,
                    firstDate: DateTime(2020),
                    lastDate: now,
                  );
                  if (picked != null && mounted) {
                    setState(() {
                      _to = picked;
                      _preset = 'custom';
                    });
                  }
                }),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  initialValue: _preset,
                  isExpanded: true,
                  decoration: const InputDecoration(
                      isDense: true,
                      contentPadding:
                          EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      border: OutlineInputBorder()),
                  items: const [
                    DropdownMenuItem(value: 'today', child: Text('Hari ini')),
                    DropdownMenuItem(value: '7d', child: Text('7 Hari')),
                    DropdownMenuItem(value: '30d', child: Text('30 Hari')),
                    DropdownMenuItem(value: 'bulan', child: Text('Bulan ini')),
                    DropdownMenuItem(
                        value: 'custom', child: Text('Rentang kustom')),
                  ],
                  onChanged: (v) => setState(() => _preset = v ?? '7d'),
                ),
              ),
              const SizedBox(width: 8),
              FilledButton.icon(
                style: FilledButton.styleFrom(
                  minimumSize: const Size(0, 46),
                  backgroundColor: _kBlueAccent,
                ),
                onPressed: _load,
                icon: const Icon(Icons.check, size: 18),
                label: const Text('Apply'),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(_activeLabel,
              style: TextStyle(
                  fontSize: 12.5, fontWeight: FontWeight.w600, color: _kMuted)),
        ],
      ),
    );
  }

  Widget _dateBox(String label, String value, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        height: 46,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: Theme.of(context).brightness == Brightness.dark
              ? const Color(0xff1F2530)
              : Colors.white,
          border: Border.all(color: _kBorder),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: const TextStyle(
                    fontSize: 9, fontWeight: FontWeight.w600, color: _kMuted)),
            Text(value,
                style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: ink(context))),
          ],
        ),
      ),
    );
  }
}

/// Kartu ringkasan kecil (Masuk/Keluar/Selisih).
class _SummaryCard extends StatelessWidget {
  const _SummaryCard(
      {required this.label,
      required this.value,
      required this.icon,
      required this.color});
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.all(12),
      radius: 18,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: color.withValues(alpha: .14),
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(icon, size: 18, color: color),
          ),
          const SizedBox(height: 10),
          Text(label, style: const TextStyle(fontSize: 11, color: _kMuted)),
          const SizedBox(height: 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(value,
                style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: ink(context))),
          ),
        ],
      ),
    );
  }
}

/// Line chart pergerakan stok 7 hari (masuk biru, keluar merah).
class _MovementCard extends StatelessWidget {
  const _MovementCard(
      {required this.daily,
      required this.totalMasuk,
      required this.totalKeluar});
  final List<({String label, double masuk, double keluar})> daily;
  final double totalMasuk;
  final double totalKeluar;

  @override
  Widget build(BuildContext context) {
    final maxV = daily.fold<double>(
        0, (s, d) => math.max(s, math.max(d.masuk, d.keluar)));
    final limit = maxV <= 0 ? 10.0 : maxV * 1.2;
    return GlassCard(
      padding: const EdgeInsets.all(16),
      radius: 22,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('Pergerakan Stock 7 Hari',
                    style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: ink(context))),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: const Color(0x141E3A5F),
                  borderRadius: BorderRadius.circular(99),
                ),
                child: Text(
                  'Masuk ${totalMasuk.round()} / Keluar ${totalKeluar.round()}',
                  style: const TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                      color: _kBlueAccent),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 210,
            child: LineChart(
              LineChartData(
                minY: 0,
                maxY: limit,
                gridData: FlGridData(
                  show: true,
                  drawVerticalLine: false,
                  getDrawingHorizontalLine: (_) => FlLine(
                      color: _kBorder.withValues(alpha: .55), strokeWidth: 0.6),
                ),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  topTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false)),
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 34,
                      interval: limit / 4,
                      getTitlesWidget: (v, meta) => Text('${v.round()}',
                          style: const TextStyle(fontSize: 9, color: _kMuted)),
                    ),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 26,
                      interval: 1,
                      getTitlesWidget: (v, meta) {
                        final i = v.toInt();
                        if (i < 0 || i >= daily.length) {
                          return const SizedBox.shrink();
                        }
                        return Padding(
                          padding: const EdgeInsets.only(top: 6),
                          child: Text(daily[i].label,
                              style: const TextStyle(
                                  fontSize: 8.5, color: _kMuted)),
                        );
                      },
                    ),
                  ),
                ),
                lineTouchData: LineTouchData(
                  touchTooltipData: LineTouchTooltipData(
                    getTooltipItems: (spots) => spots.map((s) {
                      final name = s.barIndex == 0 ? 'Masuk' : 'Keluar';
                      return LineTooltipItem(
                          '$name: ${s.y.round()}',
                          const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              fontSize: 11));
                    }).toList(),
                  ),
                ),
                lineBarsData: [
                  LineChartBarData(
                    spots: [
                      for (var i = 0; i < daily.length; i++)
                        FlSpot(i.toDouble(), daily[i].masuk)
                    ],
                    isCurved: true,
                    curveSmoothness: 0.35,
                    color: _kBlueAccent,
                    barWidth: 2.4,
                    dotData: FlDotData(
                      show: true,
                      getDotPainter: (s, p, b, i) => FlDotCirclePainter(
                        radius: 3,
                        color: Colors.white,
                        strokeWidth: 2,
                        strokeColor: _kBlueAccent,
                      ),
                    ),
                    belowBarData: BarAreaData(
                      show: true,
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          _kBlueAccent.withValues(alpha: .28),
                          _kBlueAccent.withValues(alpha: 0),
                        ],
                      ),
                    ),
                  ),
                  LineChartBarData(
                    spots: [
                      for (var i = 0; i < daily.length; i++)
                        FlSpot(i.toDouble(), daily[i].keluar)
                    ],
                    isCurved: true,
                    curveSmoothness: 0.35,
                    color: _kRed,
                    barWidth: 2.4,
                    dotData: FlDotData(
                      show: true,
                      getDotPainter: (s, p, b, i) => FlDotCirclePainter(
                        radius: 3,
                        color: Colors.white,
                        strokeWidth: 2,
                        strokeColor: _kRed,
                      ),
                    ),
                    belowBarData: BarAreaData(
                      show: true,
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          _kRed.withValues(alpha: .24),
                          _kRed.withValues(alpha: 0),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: const [
              _LegendDot(color: _kBlueAccent, label: 'Stock Masuk'),
              SizedBox(width: 16),
              _LegendDot(color: _kRed, label: 'Stock Keluar'),
            ],
          ),
        ],
      ),
    );
  }
}

/// Donut chart status stok.
class _StatusCard extends StatelessWidget {
  const _StatusCard(
      {required this.aman,
      required this.hampir,
      required this.kosong,
      required this.totalProduk});
  final int aman;
  final int hampir;
  final int kosong;
  final int totalProduk;

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      padding: const EdgeInsets.all(16),
      radius: 22,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Status Stok',
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: ink(context))),
          if (totalProduk > 0) ...[
            const SizedBox(height: 2),
            Text('$totalProduk produk',
                style: const TextStyle(fontSize: 11, color: _kMuted)),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 150,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      PieChart(PieChartData(
                        sectionsSpace: 2,
                        centerSpaceRadius: 46,
                        sections: [
                          PieChartSectionData(
                              value: aman.toDouble(),
                              color: _kBlueAccent,
                              radius: 36,
                              showTitle: false),
                          PieChartSectionData(
                              value: hampir.toDouble(),
                              color: _kOrange,
                              radius: 36,
                              showTitle: false),
                          PieChartSectionData(
                              value: kosong.toDouble(),
                              color: _kRed,
                              radius: 36,
                              showTitle: false),
                        ],
                      )),
                      Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text('$aman%',
                              style: TextStyle(
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                  color: ink(context))),
                          const Text('Aman',
                              style: TextStyle(fontSize: 10, color: _kMuted)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  children: [
                    _RingIndicator(
                        percent: aman, color: _kBlueAccent, label: 'Aman'),
                    const SizedBox(height: 10),
                    _RingIndicator(
                        percent: hampir,
                        color: _kOrange,
                        label: 'Hampir Habis'),
                    const SizedBox(height: 10),
                    _RingIndicator(
                        percent: kosong, color: _kRed, label: 'Kosong'),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: const [
              _LegendDot(color: _kBlueAccent, label: 'Aman'),
              SizedBox(width: 12),
              _LegendDot(color: _kOrange, label: 'Hampir Habis'),
              SizedBox(width: 12),
              _LegendDot(color: _kRed, label: 'Kosong'),
            ],
          ),
        ],
      ),
    );
  }
}

/// Vertical bar chart stok per kategori.
class _CategoryCard extends StatelessWidget {
  const _CategoryCard({required this.categories});
  final List<(String, double)> categories;

  @override
  Widget build(BuildContext context) {
    final maxV = categories.fold<double>(0, (s, c) => math.max(s, c.$2));
    final limit = maxV <= 0 ? 10.0 : maxV * 1.15;
    return GlassCard(
      padding: const EdgeInsets.all(16),
      radius: 22,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Stok per Kategori',
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: ink(context))),
          const SizedBox(height: 14),
          SizedBox(
            height: 230,
            child: BarChart(
              BarChartData(
                maxY: limit,
                gridData: FlGridData(
                  show: true,
                  drawVerticalLine: false,
                  getDrawingHorizontalLine: (_) => FlLine(
                      color: _kBorder.withValues(alpha: .55), strokeWidth: 0.6),
                ),
                borderData: FlBorderData(show: false),
                titlesData: FlTitlesData(
                  topTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false)),
                  rightTitles: const AxisTitles(
                      sideTitles: SideTitles(showTitles: false)),
                  leftTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 34,
                      interval: limit / 4,
                      getTitlesWidget: (v, meta) {
                        final val = v;
                        final text = val >= 1000
                            ? '${(val / 1000).toStringAsFixed(1)}k'
                            : '${val.round()}';
                        return Text(text,
                            style:
                                const TextStyle(fontSize: 9, color: _kMuted));
                      },
                    ),
                  ),
                  bottomTitles: AxisTitles(
                    sideTitles: SideTitles(
                      showTitles: true,
                      reservedSize: 52,
                      interval: 1,
                      getTitlesWidget: (v, meta) {
                        final i = v.toInt();
                        if (i < 0 || i >= categories.length) {
                          return const SizedBox.shrink();
                        }
                        final label = categories[i].$1;
                        return Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Transform.rotate(
                            angle: -0.7854,
                            child: Text(label,
                                maxLines: 1,
                                style: const TextStyle(
                                    fontSize: 8.5, color: _kMuted)),
                          ),
                        );
                      },
                    ),
                  ),
                ),
                barTouchData: BarTouchData(
                  touchTooltipData: BarTouchTooltipData(
                    getTooltipItem: (group, gi, rod, ri) => BarTooltipItem(
                      '${categories[group.x].$1}\n${rod.toY.round()}',
                      const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 11),
                    ),
                  ),
                ),
                barGroups: [
                  for (var i = 0; i < categories.length; i++)
                    BarChartGroupData(
                      x: i,
                      barRods: [
                        BarChartRodData(
                          toY: categories[i].$2,
                          color: _kBlueAccent,
                          width: 18,
                          borderRadius: const BorderRadius.vertical(
                              top: Radius.circular(5)),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Horizontal bar chart top produk keluar.
class _TopProductsCard extends StatelessWidget {
  const _TopProductsCard({required this.products});
  final List<(String, double)> products;

  @override
  Widget build(BuildContext context) {
    final maxV = products.fold<double>(0, (s, p) => math.max(s, p.$2));
    return GlassCard(
      padding: const EdgeInsets.all(16),
      radius: 22,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Top Produk Keluar',
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: ink(context))),
          const SizedBox(height: 14),
          for (final p in products)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 5),
              child: Row(
                children: [
                  SizedBox(
                    width: 92,
                    child: Text(p.$1,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                            color: _kMuted)),
                  ),
                  Expanded(
                    child: Container(
                      height: 14,
                      decoration: BoxDecoration(
                        color: Theme.of(context).brightness == Brightness.dark
                            ? const Color(0xff1F2530)
                            : const Color(0xffF0EEE8),
                        borderRadius: BorderRadius.circular(7),
                      ),
                      alignment: Alignment.centerLeft,
                      child: FractionallySizedBox(
                        widthFactor: maxV <= 0 ? 0 : p.$2 / maxV,
                        child: Container(
                          decoration: BoxDecoration(
                            color: _kMagenta,
                            borderRadius: BorderRadius.circular(7),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    width: 42,
                    child: Text('${p.$2.round()}',
                        textAlign: TextAlign.right,
                        style: const TextStyle(
                            fontSize: 11, fontWeight: FontWeight.w800)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot({required this.color, required this.label});
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 9,
          height: 9,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(3),
          ),
        ),
        const SizedBox(width: 5),
        Text(label, style: const TextStyle(fontSize: 10.5, color: _kMuted)),
      ],
    );
  }
}

/// Indikator persentase melingkar.
class _RingIndicator extends StatelessWidget {
  const _RingIndicator(
      {required this.percent, required this.color, required this.label});
  final int percent;
  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        SizedBox(
          width: 42,
          height: 42,
          child: Stack(
            alignment: Alignment.center,
            children: [
              SizedBox(
                width: 42,
                height: 42,
                child: CircularProgressIndicator(
                  value: percent / 100,
                  strokeWidth: 5,
                  backgroundColor:
                      Theme.of(context).brightness == Brightness.dark
                          ? const Color(0xff2A3140)
                          : const Color(0xffEFEBE3),
                  valueColor: AlwaysStoppedAnimation(color),
                ),
              ),
              Text('$percent%',
                  style: const TextStyle(
                      fontSize: 9.5, fontWeight: FontWeight.w800)),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child:
              Text(label, style: const TextStyle(fontSize: 11, color: _kMuted)),
        ),
      ],
    );
  }
}
