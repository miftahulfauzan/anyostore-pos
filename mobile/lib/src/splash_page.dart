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
    return Scaffold(
      backgroundColor: pageBg(context),
      body: Stack(
        children: [
          const Positioned.fill(child: SoftBlobs()),
          SafeArea(
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0.86, end: 1.0),
                    duration: const Duration(milliseconds: 500),
                    curve: Curves.easeOutBack,
                    builder: (context, v, child) => Opacity(
                      opacity: (v - 0.86) / 0.14,
                      child: Transform.scale(scale: v, child: child),
                    ),
                    child: const GlassCard(
                      padding: EdgeInsets.all(6),
                      radius: 20,
                      child: BrandLogo(size: 92, radius: 16),
                    ),
                  ),
                  const SizedBox(height: 18),
                  const Text('Anyostore App',
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
