import 'dart:async';

import 'package:flutter/material.dart';

import 'login_page.dart';
import 'task_ui.dart';

const _kInk = Color(0xff1E3A5F);

class SplashPage extends StatefulWidget {
  const SplashPage({super.key});

  @override
  State<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends State<SplashPage> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    // Langsung lanjut ke halaman login setelah tampil sebentar.
    _timer = Timer(const Duration(milliseconds: 1200), _goLogin);
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _goLogin() {
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginPage()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Color(0xfff7f4ed),
      body: Stack(
        children: [
          Positioned.fill(child: SoftBlobs()),
          SafeArea(
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  GlassCard(
                    padding: EdgeInsets.all(6),
                    radius: 20,
                    child: BrandLogo(size: 92, radius: 16),
                  ),
                  SizedBox(height: 18),
                  Text('Anyostore App',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          fontSize: 30,
                          fontWeight: FontWeight.w800,
                          color: _kInk,
                          letterSpacing: -0.5)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
