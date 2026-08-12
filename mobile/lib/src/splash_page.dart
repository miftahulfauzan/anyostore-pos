import 'package:flutter/material.dart';

import 'login_page.dart';
import 'task_ui.dart';

const _kInk = Color(0xff1E3A5F);
const _kMuted = Color(0xff5f5f5d);
const _kBorder = Color(0xffeceae4);

class SplashPage extends StatelessWidget {
  const SplashPage({super.key});

  void _start(BuildContext context) {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const LoginPage()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xfff7f4ed),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Container(
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: _kBorder),
                              boxShadow: const [
                                BoxShadow(
                                    color: Color(0x14000000),
                                    blurRadius: 8,
                                    offset: Offset(0, 3))
                              ],
                            ),
                            padding: const EdgeInsets.all(4),
                            child: const BrandLogo(size: 88, radius: 14),
                          ),
                          const Positioned(
                            top: -4,
                            right: -4,
                            child: SizedBox(
                              width: 26,
                              height: 26,
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  color: _kInk,
                                  borderRadius: BorderRadius.all(
                                      Radius.circular(9)),
                                ),
                                child: Center(
                                  child: Text('+',
                                      style: TextStyle(
                                          color: Color(0xfffcfbf8),
                                          fontSize: 14,
                                          fontWeight: FontWeight.w700)),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 20),
                      const Text('Anyostore App',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: 30,
                              fontWeight: FontWeight.w800,
                              color: _kInk,
                              letterSpacing: -0.5)),
                      const SizedBox(height: 6),
                      const Text('POWERING YOUR BUSINESS',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 1.4,
                              color: _kMuted)),
                    ],
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(32, 0, 32, 24),
              child: SizedBox(
                width: double.infinity,
                height: 50,
                child: FilledButton(
                  onPressed: () => _start(context),
                  style: FilledButton.styleFrom(
                    backgroundColor: _kInk,
                    foregroundColor: const Color(0xfffcfbf8),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                    textStyle: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w700),
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text('Mulai'),
                      SizedBox(width: 8),
                      Icon(Icons.arrow_forward, size: 18),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
