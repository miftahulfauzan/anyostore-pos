import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api_client.dart';
import 'branch_scope.dart';

class AuthStore extends ChangeNotifier {
  AuthStore(this._api) {
    _api.refreshHandler = _refresh;
  }

  final ApiClient _api;

  ApiClient get api => _api;

  bool isAuthenticated = false;
  bool restoring = true;
  int? userId;
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
  static const _accountsKey = 'pos_saved_accounts';

  /// Daftar akun tersimpan untuk fitur Ganti Akun (Level 2).
  List<Map<String, dynamic>> savedAccounts = [];

  Future<void> restore() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await _loadAccounts();
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
    userId = int.tryParse('${user['id']}');
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
      // Token refresh akun tersimpan ikut diperbarui biar tetap segar.
      final i = savedAccounts.indexWhere(
          (a) => (a['user'] as Map<String, dynamic>?)?['id'] == userId);
      if (i >= 0) {
        savedAccounts[i]['token'] = access;
        savedAccounts[i]['refreshToken'] =
            newRt ?? savedAccounts[i]['refreshToken'];
        await _persistAccounts();
      }
      notifyListeners();
      return true;
    } catch (_) {
      // Refresh token tidak valid / kedaluwarsa: akhiri sesi supaya aplikasi
      // kembali ke halaman login dengan pesan jelas.
      await logout();
      return false;
    }
  }

  Future<void> _loadAccounts() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_accountsKey);
      if (raw != null) {
        savedAccounts =
            ((jsonDecode(raw) as List?) ?? []).cast<Map<String, dynamic>>();
      }
    } catch (_) {
      savedAccounts = [];
    }
  }

  Future<void> _persistAccounts() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_accountsKey, jsonEncode(savedAccounts));
    } catch (_) {}
  }

  /// Simpan akun yang sedang aktif ke daftar akun tersimpan (Ganti Akun).
  Future<void> saveCurrentAccount({bool remember = true}) async {
    if (!remember) return;
    final uid = userId;
    final tok = token;
    if (uid == null || tok == null) return;
    final user = {
      'id': uid,
      'name': userName,
      'username': username,
      'email': email,
      'role': role,
      'branch_id': branchId,
    };
    final account = {
      'user': user,
      'token': tok,
      'refreshToken': refreshToken,
      'savedAt': DateTime.now().toIso8601String(),
    };
    final i = savedAccounts
        .indexWhere((a) => (a['user'] as Map<String, dynamic>?)?['id'] == uid);
    if (i >= 0) {
      savedAccounts[i] = account;
    } else {
      savedAccounts.add(account);
    }
    await _persistAccounts();
  }

  /// Pindah ke akun lain yang tersimpan tanpa input ulang.
  Future<void> switchToAccount(Map<String, dynamic> account) async {
    final user = (account['user'] as Map<String, dynamic>?) ?? {};
    final access = account['token']?.toString();
    if (access == null) return;
    _api.setToken(access);
    token = access;
    refreshToken = account['refreshToken']?.toString();
    _applyUser(user);
    isAuthenticated = true;
    // Reset pilihan toko/gudang owner & branch aktif supaya tidak ketuker
    // antar akun.
    _api.activeBranchId = null;
    BranchScope.set(null);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, access);
    if (refreshToken != null) {
      await prefs.setString(_refreshKey, refreshToken!);
    }
    await prefs.setString(_userKey, jsonEncode(user));
    notifyListeners();
  }

  /// Hapus akun dari daftar tersimpan. Kalau itu akun aktif, ikut logout.
  Future<void> removeAccount(int uid) async {
    savedAccounts
        .removeWhere((a) => (a['user'] as Map<String, dynamic>?)?['id'] == uid);
    await _persistAccounts();
    if (userId == uid) {
      await logout();
    }
  }

  Future<void> logout({bool removeFromList = false}) async {
    if (removeFromList && userId != null) {
      savedAccounts.removeWhere(
          (a) => (a['user'] as Map<String, dynamic>?)?['id'] == userId);
      await _persistAccounts();
    }
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
