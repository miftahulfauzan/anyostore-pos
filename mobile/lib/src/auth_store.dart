import 'package:flutter/foundation.dart';
import 'api_client.dart';

class AuthStore extends ChangeNotifier {
  AuthStore(this._api);
  final ApiClient _api;
  bool isAuthenticated = false;
  String? userName;

  Future<void> login(String email, String password) async {
    final result =
        await _api.post('/auth/login', {'email': email, 'password': password});
    final data = result['data'] as Map<String, dynamic>;
    _api.setToken(data['accessToken'] as String);
    userName = (data['user'] as Map<String, dynamic>)['name'] as String?;
    isAuthenticated = true;
    notifyListeners();
  }

  void logout() {
    _api.setToken(null);
    isAuthenticated = false;
    userName = null;
    notifyListeners();
  }
}
