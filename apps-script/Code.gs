// SISKOWAL - Web App Apps Script. Tempel di spreadsheet (Ekstensi > Apps Script).
// Dependensi: Logic.gs (di project yang sama).

var SHEET_PETUGAS = 'Master_Petugas';
var SHEET_SHIFT = 'Master_Shift';
var SHEET_CONFIG = 'Master_Config';
var SHEET_OB = 'Master_OB';
var SHEET_LIBUR = 'Master_Libur';
var SHEET_OB_CATATAN = 'OB_Catatan';

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function readSheet_(name) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sheet) throw new Error('Sheet "' + name + '" tidak ditemukan. Jalankan setup() dulu.');
  return sheet.getDataRange().getValues();
}

// Seperti readSheet_, tetapi sheet yang belum ada dianggap kosong. Dipakai untuk sheet OB agar
// aplikasi tetap jalan sebelum setup() dijalankan ulang.
function readSheetOpsional_(name) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(name);
  return sheet ? sheet.getDataRange().getValues() : [[]];
}

// Menulis satu sheet dari array 2D (dengan header). kolomTeks = nomor kolom yang dipaksa berformat teks
// supaya tanggal/jam tidak diubah Sheets menjadi tipe lain.
function tulisSheet_(ss, name, data, kolomTeks) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.clear();
  (kolomTeks || []).forEach(function (c) {
    sheet.getRange(1, c, sheet.getMaxRows(), 1).setNumberFormat('@');
  });
  sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
  sheet.getRange(1, 1, 1, data[0].length).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function getMaster_() {
  var petugasValues = readSheet_(SHEET_PETUGAS);
  return {
    petugas: parsePetugas(petugasValues),       // hanya yang aktif, untuk tabel jadwal
    petugasSemua: parsePetugasAll(petugasValues), // semua, untuk layar pengaturan
    shift: parseShift(readSheet_(SHEET_SHIFT)),
    config: parseConfig(readSheet_(SHEET_CONFIG)),
    ob: parseOB(readSheetOpsional_(SHEET_OB)),
    libur: parseLibur(readSheetOpsional_(SHEET_LIBUR))
  };
}

function simpanMaster_(master) {
  // OB yang sudah punya ID tidak boleh hilang dari daftar (riwayat laporan bergantung padanya).
  var ctx = {
    obLama: parseOB(readSheetOpsional_(SHEET_OB))
      .filter(function (o) { return o.id !== ''; })
      .map(function (o) { return { id: o.id, nama: o.nama }; })
  };
  var err = validateMaster(master, ctx);
  if (err) throw new Error(err);
  var values = masterToSheetValues(master);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = SpreadsheetApp.getActive();
    tulisSheet_(ss, SHEET_PETUGAS, values.petugas, []);
    tulisSheet_(ss, SHEET_SHIFT, values.shift, [2]);   // kolom Jam sebagai teks
    tulisSheet_(ss, SHEET_CONFIG, values.config, [2]); // kolom Nilai sebagai teks ("TRUE"/"FALSE")
    // OB dan hari libur hanya ditulis bila klien mengirimnya (klien lama tidak).
    if (values.ob) tulisSheet_(ss, SHEET_OB, values.ob, [4, 5]);        // Mulai, Selesai
    if (values.libur) tulisSheet_(ss, SHEET_LIBUR, values.libur, [1]);  // Tanggal
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

// Catatan kalender OB pada rentang tanggal [dari, sampai] (YYYY-MM-DD, inklusif).
function getObCatatan_(dari, sampai) {
  if (!isValidTanggal(dari) || !isValidTanggal(sampai)) throw new Error('Format tanggal harus YYYY-MM-DD');
  if (sampai < dari) throw new Error('Tanggal akhir sebelum tanggal awal');
  return { catatan: filterCatatan(parseCatatan(readSheetOpsional_(SHEET_OB_CATATAN)), dari, sampai) };
}

// Mengganti seluruh catatan satu bulan. Bulan lain tidak disentuh.
function simpanObCatatan_(bulan, catatan) {
  var obList = parseOB(readSheetOpsional_(SHEET_OB));
  var err = validateCatatan(bulan, catatan, obList);
  if (err) throw new Error(err);

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = SpreadsheetApp.getActive();
    var gabungan = mergeCatatan(parseCatatan(readSheetOpsional_(SHEET_OB_CATATAN)), bulan, catatan);
    tulisSheet_(ss, SHEET_OB_CATATAN, catatanToSheetValues(gabungan), [1]); // Tanggal sebagai teks
    return { bulan: bulan, tersimpan: catatan.length };
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
    if (action === 'ob_catatan') return jsonOut_({ ok: true, data: getObCatatan_(e.parameter.dari, e.parameter.sampai) });
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
    if (body.action === 'simpan_ob_catatan') {
      return jsonOut_({ ok: true, data: simpanObCatatan_(body.bulan, body.catatan) });
    }
    return jsonOut_({ ok: false, error: 'Aksi tidak dikenal' });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err.message || err) });
  }
}

// Hari libur nasional dan cuti bersama 2026 (SKB 3 Menteri 19 September 2025: Menag 1497/2025,
// Menaker 2/2025, MenPANRB 5/2025; sumber: setneg.go.id). Hanya libur nasional dan Sabtu/Minggu yang
// otomatis libur di kalender OB. Cuti bersama ditandai Libur = FALSE: tampil sebagai info, hari itu
// tetap masuk kecuali dicatat, karena kebijakannya berbeda tiap perusahaan.
function liburSeed2026_() {
  var N = 'Nasional', C = 'Cuti Bersama';
  return [
    ['2026-01-01', 'Tahun Baru 2026 Masehi', N, true],
    ['2026-01-16', 'Isra Mikraj Nabi Muhammad saw.', N, true],
    ['2026-02-16', 'Cuti Bersama Tahun Baru Imlek', C, false],
    ['2026-02-17', 'Tahun Baru Imlek 2577 Kongzili', N, true],
    ['2026-03-18', 'Cuti Bersama Hari Suci Nyepi', C, false],
    ['2026-03-19', 'Hari Suci Nyepi (Tahun Baru Saka 1948)', N, true],
    ['2026-03-20', 'Cuti Bersama Idulfitri 1447 H', C, false],
    ['2026-03-21', 'Idulfitri 1447 H (hari pertama)', N, true],
    ['2026-03-22', 'Idulfitri 1447 H (hari kedua)', N, true],
    ['2026-03-23', 'Cuti Bersama Idulfitri 1447 H', C, false],
    ['2026-03-24', 'Cuti Bersama Idulfitri 1447 H', C, false],
    ['2026-04-03', 'Wafat Yesus Kristus', N, true],
    ['2026-04-05', 'Kebangkitan Yesus Kristus (Paskah)', N, true],
    ['2026-05-01', 'Hari Buruh Internasional', N, true],
    ['2026-05-14', 'Kenaikan Yesus Kristus', N, true],
    ['2026-05-15', 'Cuti Bersama Kenaikan Yesus Kristus', C, false],
    ['2026-05-27', 'Iduladha 1447 H', N, true],
    ['2026-05-28', 'Cuti Bersama Iduladha 1447 H', C, false],
    ['2026-05-31', 'Hari Raya Waisak 2570 BE', N, true],
    ['2026-06-01', 'Hari Lahir Pancasila', N, true],
    ['2026-06-16', 'Tahun Baru Islam 1448 H', N, true],
    ['2026-08-17', 'Proklamasi Kemerdekaan', N, true],
    ['2026-08-25', 'Maulid Nabi Muhammad saw.', N, true],
    ['2026-12-24', 'Cuti Bersama Kelahiran Yesus Kristus', C, false],
    ['2026-12-25', 'Kelahiran Yesus Kristus (Natal)', N, true]
  ];
}

// Jalankan sekali dari editor Apps Script untuk membuat sheet master beserta isi awal.
// Aman dijalankan ulang: sheet yang sudah ada isinya tidak ditimpa, hanya sheet yang belum ada dibuat.
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
    ['absensi_catatan', ''],
    ['ob_jam_masuk', '08.00-17.00'],
    ['ob_catatan', '']
  ], [2]);

  // ----- OB -----
  ensure(SHEET_OB, ['ID', 'Nama', 'Jabatan', 'Mulai', 'Selesai', 'Urutan'], [
    ['OB001', 'Firdaus', 'ANGGOTA', '', '', 1],
    ['OB002', 'Rahmat Hidayat', 'ANGGOTA', '', '', 2],
    ['OB003', 'Zulkarnain', 'BACKUP', '', '', 3]
  ], [4, 5]);

  ensure(SHEET_LIBUR, ['Tanggal', 'Keterangan', 'Jenis', 'Libur'], liburSeed2026_(), [1]);

  ensure(SHEET_OB_CATATAN, ['Tanggal', 'ID_OB', 'Jenis', 'ID_Backup'], [], [1]);
}
