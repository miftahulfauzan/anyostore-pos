import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'auth_store.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final email = TextEditingController();
  final password = TextEditingController();
  bool loading = false;
  String? error;
  Future<void> submit() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      await context.read<AuthStore>().login(email.text.trim(), password.text);
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      body: Center(
          child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text('POS Pakaian',
                            style: Theme.of(context).textTheme.headlineMedium),
                        const SizedBox(height: 24),
                        TextField(
                            controller: email,
                            keyboardType: TextInputType.emailAddress,
                            decoration:
                                const InputDecoration(labelText: 'Email')),
                        TextField(
                            controller: password,
                            obscureText: true,
                            onSubmitted: (_) => submit(),
                            decoration:
                                const InputDecoration(labelText: 'Password')),
                        if (error != null)
                          Padding(
                              padding: const EdgeInsets.only(top: 12),
                              child: Text(error!,
                                  style: const TextStyle(color: Colors.red))),
                        const SizedBox(height: 16),
                        FilledButton(
                            onPressed: loading ? null : submit,
                            child: Text(loading ? 'Memproses…' : 'Masuk'))
                      ])))));
}
