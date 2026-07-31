/// Platform boundary for Bluetooth ESC/POS printing.
/// Implement [connect] and [printReceipt] with the selected printer plugin after
/// selecting the Android/iOS printer SDK and permission flow.
class PrinterService {
  Future<void> connect() async {}
  Future<void> printReceipt(Map<String, dynamic> receipt) async {
    // Deliberately no-op until a Bluetooth adapter/plugin is configured.
  }
}
