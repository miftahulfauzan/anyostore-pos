const ExcelJS = require('exceljs');

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
const BORDER = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
};

/**
 * Formulir stok opname manual (format Anyostore) dengan stok sistem terisi.
 * Kolom mengikuti template: No, Kode Produk, Stok Sistem, Stok Fisik,
 * Selisih, Catatan. Stok fisik dibiarkan kosong untuk diisi saat hitung fisik.
 */
function createOpnameWorkbook({ branchName = '', warehouseName = '', dateLabel = '', products = [] }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Anyostore POS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Stok Opname', {
    views: [{ state: 'frozen', ySplit: 7 }],
    pageSetup: {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      printTitlesRow: '7:7',
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.2, footer: 0.2 },
    },
  });

  sheet.columns = [
    { key: 'no', width: 6 },
    { key: 'sku', width: 24 },
    { key: 'system', width: 14 },
    { key: 'physical', width: 14 },
    { key: 'diff', width: 14 },
    { key: 'note', width: 28 },
  ];

  sheet.mergeCells('A2:F2');
  const title = sheet.getCell('A2');
  title.value = 'FORMULIR STOK OPNAME MANUAL';
  title.font = { bold: true, size: 14, color: { argb: 'FF1E3A5F' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(2).height = 24;

  sheet.mergeCells('A3:F3');
  sheet.getCell('A3').value = `Tanggal: ${dateLabel || '____________________'}    `
    + `Lokasi/Gudang: ${warehouseName || '____________________'}`
    + `${branchName ? ` (${branchName})` : ''}    Petugas: ____________________`;
  sheet.getCell('A3').font = { size: 10 };

  sheet.mergeCells('A4:F4');
  sheet.getCell('A4').value = 'Pemeriksa: ____________________    Shift: ____________';
  sheet.getCell('A4').font = { size: 10 };

  sheet.mergeCells('A5:F5');
  sheet.getCell('A5').value = 'Isi stok fisik hasil hitung. Selisih dihitung otomatis '
    + '(fisik dikurangi sistem); kolom catatan untuk temuan selisih.';
  sheet.getCell('A5').font = { size: 9, italic: true, color: { argb: 'FF64748B' } };

  const headerRow = sheet.getRow(7);
  headerRow.values = ['No.', 'Kode Produk', 'Stok Sistem', 'Stok Fisik', 'Selisih (+/-)', 'Catatan'];
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = BORDER;
  });

  const firstRow = 8;
  products.forEach((product, index) => {
    const row = sheet.getRow(firstRow + index);
    row.getCell(1).value = index + 1;
    // Template manual memakai nama/model (mis. "A101-BLAZE"), bukan SKU
    // ber-prefix cabang. SKU tetap disimpan sebagai komentar sel.
    const label = String(product.name || product.sku || '').trim() || `#${product.id}`;
    row.getCell(2).value = label;
    if (product.sku && String(product.sku).trim() && String(product.sku).trim() !== label) {
      row.getCell(2).note = `SKU: ${String(product.sku).trim()}`;
    }
    row.getCell(3).value = Number(product.system_stock || 0);
    row.getCell(4).value = null;
    // Selisih otomatis; kosong selama stok fisik belum diisi.
    row.getCell(5).value = { formula: `IF(OR(C${firstRow + index}="",D${firstRow + index}=""),"",D${firstRow + index}-C${firstRow + index})` };
    row.getCell(6).value = null;

    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = BORDER;
      cell.alignment = { vertical: 'middle' };
    });
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(4).numFmt = '0';
    row.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(4).dataValidation = {
      type: 'whole',
      operator: 'greaterThanOrEqual',
      formulae: [0],
      allowBlank: true,
      showErrorMessage: true,
      errorTitle: 'Stok fisik tidak valid',
      error: 'Isi bilangan bulat 0 atau lebih.',
    };
    row.getCell(5).numFmt = '+0;-0;0';
    row.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
    row.height = 18;
  });

  const footerRow = Math.max(firstRow + products.length + 1, firstRow + 1);
  sheet.mergeCells(`A${footerRow}:C${footerRow}`);
  sheet.getCell(`A${footerRow}`).value = 'Petugas opname: ______________________________';
  sheet.mergeCells(`D${footerRow}:F${footerRow}`);
  sheet.getCell(`D${footerRow}`).value = 'Pemeriksa: ______________________________';
  sheet.getRow(footerRow).font = { size: 10 };

  return workbook;
}

module.exports = { createOpnameWorkbook, XLSX_MIME };