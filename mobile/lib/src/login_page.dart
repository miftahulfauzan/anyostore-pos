import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'auth_store.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _email = TextEditingController();
  final _secret = TextEditingController();
  bool _pinMode = false;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _secret.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final auth = context.read<AuthStore>();
    setState(() {
      _loading = true;
      _error = null;
    });
    final error = _pinMode
        ? await auth.loginPin(_email.text, _secret.text)
        : await auth.loginPassword(_email.text, _secret.text);
    if (!mounted) return;
    setState(() {
      _loading = false;
      _error = error;
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Container(
                    width: 72,
                    height: 72,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primary,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Text('A',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 32,
                            fontWeight: FontWeight.w800)),
                  ),
                  const SizedBox(height: 16),
                  Text('Anyostore POS',
                      textAlign: TextAlign.center,
                      style: theme.textTheme.headlineSmall
                          ?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 4),
                  Text('Masuk untuk memulai kasir',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: theme.colorScheme.outline)),
                  const SizedBox(height: 28),
                  SegmentedButton<bool>(
                    segments: const [
                      ButtonSegment(value: false, label: Text('Password')),
                      ButtonSegment(value: true, label: Text('PIN')),
                    ],
                    selected: {_pinMode},
                    onSelectionChanged: (s) =>
                        setState(() => _pinMode = s.first),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    decoration: const InputDecoration(
                      labelText: 'Email',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _secret,
                    obscureText: true,
                    keyboardType:
                        _pinMode ? TextInputType.number : TextInputType.text,
                    maxLength: _pinMode ? 6 : null,
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _submit(),
                    decoration: InputDecoration(
                      labelText: _pinMode ? 'PIN (6 digit)' : 'Password',
                      counterText: '',
                      border: const OutlineInputBorder(),
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!,
                        style: TextStyle(color: theme.colorScheme.error)),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _loading ? null : _submit,
                    style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(50)),
                    child: _loading
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Masuk'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
