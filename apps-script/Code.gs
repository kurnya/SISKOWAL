// SISKOWAL - Web App Apps Script. Tempel di spreadsheet (Ekstensi > Apps Script).
// Dependensi: Logic.gs (di project yang sama).

var SHEET_PETUGAS = 'Master_Petugas';
var SHEET_SHIFT = 'Master_Shift';
var SHEET_CONFIG = 'Master_Config';

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function readSheet_(name) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) throw new Error('Sheet "' + name + '" tidak ditemukan. Jalankan setup() dulu.');
  return sheet.getDataRange().getValues();
}

function getMaster_() {
  var petugasValues = readSheet_(SHEET_PETUGAS);
  return {
    petugas: parsePetugas(petugasValues),       // hanya yang aktif, untuk tabel jadwal
    petugasSemua: parsePetugasAll(petugasValues), // semua, untuk layar pengaturan
    shift: parseShift(readSheet_(SHEET_SHIFT)),
    config: parseConfig(readSheet_(SHEET_CONFIG))
  };
}

function simpanMaster_(master) {
  var err = validateMaster(master);
  if (err) throw new Error(err);
  var values = masterToSheetValues(master);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = SpreadsheetApp.getActive();
    [
      [SHEET_PETUGAS, values.petugas, []],
      [SHEET_SHIFT, values.shift, [2]],   // kolom Jam sebagai teks
      [SHEET_CONFIG, values.config, [2]]  // kolom Nilai sebagai teks ("TRUE"/"FALSE")
    ].forEach(function (item) {
      var sheet = ss.getSheetByName(item[0]) || ss.insertSheet(item[0]);
      var data = item[1];
      sheet.clear();
      item[2].forEach(function (c) {
        sheet.getRange(1, c, sheet.getMaxRows(), 1).setNumberFormat('@');
      });
      sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
      sheet.getRange(1, 1, 1, data[0].length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    });
    return { petugas: master.petugas.length, shift: master.shift.length };
  } finally {
    lock.releaseLock();
  }
}

function getDaftarBulan_() {
  var names = SpreadsheetApp.getActive().getSheets().map(function (s) { return s.getName(); });
  return { bulan: listBulan(names) };
}

function getJadwal_(bulan) {
  if (!isValidBulan(bulan)) throw new Error('Format bulan harus YYYY-MM');
  var sheet = SpreadsheetApp.getActive().getSheetByName(bulan);
  if (!sheet) return { bulan: bulan, rows: [] };
  return { bulan: bulan, rows: sheetValuesToGrid(sheet.getDataRange().getValues()) };
}

function simpanJadwal_(bulan, rows) {
  if (!isValidBulan(bulan)) throw new Error('Format bulan harus YYYY-MM');
  var days = daysInMonth(bulan);
  var codes = parseShift(readSheet_(SHEET_SHIFT)).map(function (s) { return s.kode; });
  var err = validateRows(rows, codes, days);
  if (err) throw new Error(err);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = SpreadsheetApp.getActive();
    var sheet = ss.getSheetByName(bulan) || ss.insertSheet(bulan);
    var values = gridToSheetValues(rows, days);
    sheet.clear();
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    sheet.getRange(1, 1, 1, values[0].length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setFrozenColumns(1);
    return { bulan: bulan, tersimpan: rows.length };
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  try {
    var action = e && e.parameter && e.parameter.action;
    if (action === 'master') return jsonOut_({ ok: true, data: getMaster_() });
    if (action === 'bulan') return jsonOut_({ ok: true, data: getDaftarBulan_() });
    if (action === 'jadwal') return jsonOut_({ ok: true, data: getJadwal_(e.parameter.bulan) });
    return jsonOut_({ ok: false, error: 'Aksi tidak dikenal' });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'simpan') {
      return jsonOut_({ ok: true, data: simpanJadwal_(body.bulan, body.rows) });
    }
    if (body.action === 'simpan_master') {
      return jsonOut_({ ok: true, data: simpanMaster_(body.master) });
    }
    return jsonOut_({ ok: false, error: 'Aksi tidak dikenal' });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err.message || err) });
  }
}

// Jalankan sekali dari editor Apps Script untuk membuat sheet master beserta isi awal.
function setup() {
  var ss = SpreadsheetApp.getActive();

  function ensure(name, header, rows, textCols) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      var first = ss.getSheets()[0];
      var firstEmpty = ss.getSheets().length === 1 && first.getLastRow() === 0 &&
        first.getName() === 'Sheet1';
      sheet = firstEmpty ? first.setName(name) : ss.insertSheet(name);
    }
    if (sheet.getLastRow() > 0) return; // sudah ada isi, jangan ditimpa
    (textCols || []).forEach(function (c) {
      sheet.getRange(1, c, sheet.getMaxRows(), 1).setNumberFormat('@');
    });
    var all = [header].concat(rows);
    sheet.getRange(1, 1, all.length, header.length).setValues(all);
    sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, header.length);
  }

  ensure(SHEET_PETUGAS, ['Nama', 'Aktif', 'Urutan'], [
    ['Agus Sudirman', true, 1],
    ['Parwono', true, 2],
    ['Dimas Kurniawan', true, 3],
    ['Deddy Supriyadi', true, 4]
  ]);

  ensure(SHEET_SHIFT, ['Kode', 'Jam', 'Keterangan'], [
    ['P', '08.00-16.00', 'Pagi'],
    ['S', '16.00-00.00', 'Sore'],
    ['M', '00.00-08.00', 'Malam'],
    ['PS', '08.00-19.00', 'Shift panjang pagi'],
    ['SM', '19.00-08.00', 'Shift panjang malam'],
    ['X', '-', 'Libur']
  ], [2]);

  ensure(SHEET_CONFIG, ['Kunci', 'Nilai'], [
    ['perusahaan', 'PT. CAMPA PUTRA SILIWANGI'],
    ['alamat', 'JL. GAMA SETIA RAYA BLOK B3 No.6A Komplek Pelni Kel. Bakti Jaya Kec. Sukma Jaya Depok - 16418'],
    ['kontak', 'Tlp: 021 - 87728378 / email: support@campasiliwangi.com'],
    ['lokasi', 'OSCARMAS PONTIANAK'],
    ['keterangan_00_05', 'AGUS (PAM TNI)'],
    ['pam_aktif', 'TRUE'],
    ['absensi_kota', 'Jakarta'],
    ['absensi_jam_kerja', 'Jam Kerja 8 Jam'],
    ['absensi_legenda', 'H : hadir     L :          I : Izin     S : sakit     TK : Tanpa Keterangan     CT : Cuti'],
    ['absensi_catatan', '']
  ], [2]);
}
