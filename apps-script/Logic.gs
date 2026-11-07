// Logika murni (tanpa SpreadsheetApp) agar bisa diuji dengan Node.
// Di Apps Script semua file .gs berbagi satu scope global.

var MAX_PETUGAS = 100;

function isValidBulan(bulan) {
  return typeof bulan === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(bulan);
}

// Dari nama semua sheet, ambil yang berupa sheet jadwal bulanan (YYYY-MM), terbaru dulu.
function listBulan(sheetNames) {
  return sheetNames.filter(isValidBulan).sort().reverse();
}

function daysInMonth(bulan) {
  var parts = bulan.split('-');
  return new Date(Number(parts[0]), Number(parts[1]), 0).getDate();
}

function parseBool(value) {
  return value === true || String(value).trim().toUpperCase() === 'TRUE';
}

// values = hasil getValues() Master_Petugas, baris pertama header.
function parsePetugas(values) {
  return values
    .slice(1)
    .filter(function (r) { return String(r[0]).trim() !== '' && parseBool(r[1]); })
    .map(function (r, i) {
      var urut = Number(r[2]);
      return { nama: String(r[0]).trim(), urutan: isNaN(urut) || r[2] === '' ? 1e6 + i : urut };
    })
    .sort(function (a, b) { return a.urutan - b.urutan; })
    .map(function (p) { return p.nama; });
}

// Semua petugas (aktif maupun tidak) untuk layar pengaturan, urut menurut Urutan.
function parsePetugasAll(values) {
  return values
    .slice(1)
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r, i) {
      var urut = Number(r[2]);
      return {
        nama: String(r[0]).trim(),
        aktif: parseBool(r[1]),
        urutan: isNaN(urut) || r[2] === '' ? 1e6 + i : urut
      };
    })
    .sort(function (a, b) { return a.urutan - b.urutan; })
    .map(function (p) { return { nama: p.nama, aktif: p.aktif }; });
}

// values = hasil getValues() Master_Shift: Kode, Jam, Keterangan.
function parseShift(values) {
  return values
    .slice(1)
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) {
      return {
        kode: String(r[0]).trim().toUpperCase(),
        jam: String(r[1]).trim(),
        keterangan: String(r[2] || '').trim()
      };
    });
}

// values = hasil getValues() Master_Config: Kunci, Nilai.
function parseConfig(values) {
  var out = {};
  values.slice(1).forEach(function (r) {
    var key = String(r[0]).trim();
    // Sheets mengubah teks "TRUE"/"FALSE" menjadi boolean; String(true) = "true".
    var val = typeof r[1] === 'boolean' ? (r[1] ? 'TRUE' : 'FALSE') : String(r[1]).trim();
    if (key) out[key] = val;
  });
  return out;
}

var CONFIG_KEYS = [
  'perusahaan', 'alamat', 'kontak', 'lokasi', 'keterangan_00_05',
  // Laporan absensi
  'absensi_kota', 'absensi_jam_kerja', 'absensi_legenda', 'absensi_catatan'
];
var JAM_REGEX = /^([01]\d|2[0-3])\.[0-5]\d-([01]\d|2[0-3])\.[0-5]\d$/;
var KODE_REGEX = /^[A-Z0-9]{1,3}$/;

// master = {petugas:[{nama,aktif}], shift:[{kode,jam,keterangan}], config:{...}}
// Mengembalikan pesan error, atau null bila valid.
function validateMaster(master) {
  if (!master || typeof master !== 'object') return 'Data pengaturan tidak valid';
  var petugas = master.petugas, shift = master.shift, config = master.config;
  if (!Array.isArray(petugas) || !Array.isArray(shift) || !config || typeof config !== 'object') {
    return 'Data pengaturan tidak lengkap';
  }

  if (petugas.length > MAX_PETUGAS) return 'Jumlah petugas melebihi ' + MAX_PETUGAS;
  var seenNama = {}, aktifCount = 0;
  for (var i = 0; i < petugas.length; i++) {
    var nama = typeof petugas[i].nama === 'string' ? petugas[i].nama.trim() : '';
    if (!nama || nama.length > 100) return 'Nama petugas pada baris ' + (i + 1) + ' kosong atau terlalu panjang';
    var key = nama.toLowerCase();
    if (seenNama[key]) return 'Nama petugas kembar: ' + nama;
    seenNama[key] = true;
    if (petugas[i].aktif === true) aktifCount++;
  }
  if (aktifCount === 0) return 'Minimal satu petugas harus aktif';

  var seenKode = {}, adaX = false;
  for (var j = 0; j < shift.length; j++) {
    var kode = typeof shift[j].kode === 'string' ? shift[j].kode.trim().toUpperCase() : '';
    var jam = typeof shift[j].jam === 'string' ? shift[j].jam.trim() : '';
    if (!KODE_REGEX.test(kode)) return 'Kode shift "' + shift[j].kode + '" harus 1-3 huruf/angka';
    if (seenKode[kode]) return 'Kode shift kembar: ' + kode;
    seenKode[kode] = true;
    if (kode === 'X') {
      if (jam !== '-') return 'Kode X (libur) harus berjam "-"';
      adaX = true;
    } else if (jam !== '-' && !JAM_REGEX.test(jam)) {
      // "-" = libur/tidak bertugas, boleh dipakai kode apa pun (mis. O selain X).
      return 'Jam untuk kode ' + kode + ' harus berformat HH.MM-HH.MM (misalnya 08.00-16.00), atau "-" untuk libur';
    }
    if (typeof shift[j].keterangan === 'string' && shift[j].keterangan.length > 100) {
      return 'Keterangan kode ' + kode + ' terlalu panjang';
    }
  }
  if (!adaX) return 'Kode X (libur) wajib ada';

  for (var c = 0; c < CONFIG_KEYS.length; c++) {
    var v = config[CONFIG_KEYS[c]];
    if (v !== undefined && (typeof v !== 'string' || v.length > 300)) {
      return 'Isi "' + CONFIG_KEYS[c] + '" tidak valid atau terlalu panjang';
    }
  }
  if (config.pam_aktif !== undefined && typeof config.pam_aktif !== 'boolean') {
    return 'pam_aktif harus berupa true/false';
  }
  return null;
}

// master -> {petugas, shift, config}: array 2D (dengan header) untuk setValues.
function masterToSheetValues(master) {
  return {
    petugas: [['Nama', 'Aktif', 'Urutan']].concat(master.petugas.map(function (p, i) {
      return [p.nama.trim(), p.aktif === true, i + 1];
    })),
    shift: [['Kode', 'Jam', 'Keterangan']].concat(master.shift.map(function (s) {
      return [s.kode.trim().toUpperCase(), s.jam.trim(), (s.keterangan || '').trim()];
    })),
    config: [['Kunci', 'Nilai']]
      .concat(CONFIG_KEYS.map(function (k) { return [k, String(master.config[k] || '').trim()]; }))
      .concat([['pam_aktif', master.config.pam_aktif === false ? 'FALSE' : 'TRUE']])
  };
}

// Mengembalikan pesan error, atau null bila valid.
function validateRows(rows, validCodes, days) {
  if (!Array.isArray(rows)) return 'rows harus berupa array';
  if (rows.length > MAX_PETUGAS) return 'Jumlah petugas melebihi ' + MAX_PETUGAS;
  var allowed = {};
  validCodes.forEach(function (c) { allowed[String(c).toUpperCase()] = true; });

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var nama = row && typeof row.nama === 'string' ? row.nama.trim() : '';
    if (!nama || nama.length > 100) return 'Nama petugas pada baris ' + (i + 1) + ' tidak valid';
    if (!row.hari || typeof row.hari !== 'object') return 'Data hari untuk ' + nama + ' tidak valid';
    var keys = Object.keys(row.hari);
    for (var k = 0; k < keys.length; k++) {
      var tgl = Number(keys[k]);
      if (!Number.isInteger(tgl) || tgl < 1 || tgl > days) {
        return 'Tanggal "' + keys[k] + '" untuk ' + nama + ' di luar bulan ini';
      }
      var kode = String(row.hari[keys[k]]).trim().toUpperCase();
      if (kode !== '' && !allowed[kode]) {
        return 'Kode shift tidak dikenal "' + row.hari[keys[k]] + '" untuk ' + nama + ' tanggal ' + tgl;
      }
    }
  }
  return null;
}

// rows -> array 2D untuk setValues (header + 1 baris per petugas).
function gridToSheetValues(rows, days) {
  var header = ['Nama'];
  for (var d = 1; d <= days; d++) header.push(d);
  var body = rows.map(function (row) {
    var line = [row.nama.trim()];
    for (var d2 = 1; d2 <= days; d2++) {
      var v = row.hari[d2];
      line.push(v === undefined || v === null ? '' : String(v).trim().toUpperCase());
    }
    return line;
  });
  return [header].concat(body);
}

// getValues() sheet bulanan -> [{nama, hari:{1:'P'}}]
function sheetValuesToGrid(values) {
  if (!values || values.length < 2) return [];
  var header = values[0];
  return values.slice(1)
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) {
      var hari = {};
      for (var i = 1; i < header.length; i++) {
        var cell = String(r[i] === undefined ? '' : r[i]).trim();
        if (cell !== '') hari[Number(header[i])] = cell;
      }
      return { nama: String(r[0]).trim(), hari: hari };
    });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isValidBulan: isValidBulan,
    listBulan: listBulan,
    daysInMonth: daysInMonth,
    parsePetugas: parsePetugas,
    parsePetugasAll: parsePetugasAll,
    parseShift: parseShift,
    parseConfig: parseConfig,
    validateMaster: validateMaster,
    masterToSheetValues: masterToSheetValues,
    validateRows: validateRows,
    gridToSheetValues: gridToSheetValues,
    sheetValuesToGrid: sheetValuesToGrid
  };
}
