import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';

class AuthStore extends ChangeNotifier {
  AuthStore(this._api) {
    _api.refreshHandler = _refresh;
  }

  final ApiClient _api;

  ApiClient get api => _api;

  bool isAuthenticated = false;
  bool restoring = true;
  String? userName;
  String? username;
  String? email;
  String? role;
  int? branchId;
  String? token;
  String? refreshToken;

  static const _tokenKey = 'pos_access_token';
  static const _refreshKey = 'pos_refresh_token';
  static const _userKey = 'pos_user';

  Future<void> restore() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedToken = prefs.getString(_tokenKey);
      final savedUser = prefs.getString(_userKey);
      refreshToken = prefs.getString(_refreshKey);
      if (savedToken != null && savedUser != null) {
        _api.setToken(savedToken);
        token = savedToken;
        final user = jsonDecode(savedUser) as Map<String, dynamic>;
        _applyUser(user);
        isAuthenticated = true;
      }
    } catch (_) {
      // Token rusak: biarkan login ulang.
    } finally {
      restoring = false;
      notifyListeners();
    }
  }

  void _applyUser(Map<String, dynamic> user) {
    userName = user['name']?.toString();
    username = user['username']?.toString();
    email = user['email']?.toString();
    role = user['role']?.toString();
    branchId = int.tryParse('${user['branch_id']}');
  }

  /// Perbarui nama/email/username dari halaman Akun Saya.
  void updateSelf(String name, String email, [String? username]) {
    userName = name;
    if (username != null) this.username = username;
    this.email = email;
    notifyListeners();
  }

  Future<String?> loginPassword(String emailInput, String password) =>
      _login(() => _api.loginPassword(emailInput.trim(), password));

  Future<String?> loginPin(String emailInput, String pin) =>
      _login(() => _api.loginPin(emailInput.trim(), pin));

  Future<String?> _login(
      Future<Map<String, dynamic>> Function() request) async {
    try {
      final result = await request();
      final data = result['data'] as Map<String, dynamic>;
      final accessToken = data['accessToken']?.toString();
      final user = data['user'] as Map<String, dynamic>? ?? {};
      if (accessToken == null) return 'Login gagal: token tidak diterima';
      _api.setToken(accessToken);
      token = accessToken;
      refreshToken = data['refreshToken']?.toString();
      _applyUser(user);
      isAuthenticated = true;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_tokenKey, accessToken);
      if (refreshToken != null) {
        await prefs.setString(_refreshKey, refreshToken!);
      }
      await prefs.setString(_userKey, jsonEncode(user));
      notifyListeners();
      return null;
    } on ApiException catch (e) {
      return e.message;
    } catch (_) {
      return 'Tidak dapat terhubung ke server';
    }
  }

  Future<bool> _refresh() async {
    final rt = refreshToken;
    if (rt == null) return false;
    try {
      final result =
          await _api.post('/auth/mobile-refresh', {'refresh_token': rt});
      final data = result['data'] as Map<String, dynamic>? ?? {};
      final access = data['accessToken']?.toString();
      final newRt = data['refreshToken']?.toString();
      if (access == null) return false;
      _api.setToken(access);
      token = access;
      if (newRt != null) refreshToken = newRt;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_tokenKey, access);
      if (newRt != null) await prefs.setString(_refreshKey, newRt);
      notifyListeners();
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> logout() async {
    _api.setToken(null);
    token = null;
    refreshToken = null;
    isAuthenticated = false;
    userName = null;
    role = null;
    branchId = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_refreshKey);
    await prefs.remove(_userKey);
    notifyListeners();
  }
}
