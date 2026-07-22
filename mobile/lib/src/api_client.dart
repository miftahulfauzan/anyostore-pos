import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiClient {
  // Android emulator uses 10.0.2.2; override for a device or production server.
  ApiClient(
      {this.baseUrl = const String.fromEnvironment('API_URL',
          defaultValue: 'http://10.0.2.2:3001/api')});
  final String baseUrl;
  String? _token;

  void setToken(String? token) => _token = token;
  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token'
      };

  Future<Map<String, dynamic>> post(
      String path, Map<String, dynamic> body) async {
    final response = await http.post(Uri.parse('$baseUrl$path'),
        headers: _headers, body: jsonEncode(body));
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400)
      throw ApiException(data['message']?.toString() ?? 'Permintaan gagal');
    return data;
  }

  Future<Map<String, dynamic>> get(String path) async {
    final response =
        await http.get(Uri.parse('$baseUrl$path'), headers: _headers);
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 400)
      throw ApiException(data['message']?.toString() ?? 'Permintaan gagal');
    return data;
  }
}

class ApiException implements Exception {
  ApiException(this.message);
  final String message;
  @override
  String toString() => message;
}
