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
  'absensi_kota', 'absensi_jam_kerja', 'absensi_legenda', 'absensi_catatan',
  // Laporan OB
  'ob_jam_masuk', 'ob_catatan'
];
var JAM_REGEX = /^([01]\d|2[0-3])\.[0-5]\d-([01]\d|2[0-3])\.[0-5]\d$/;
var KODE_REGEX = /^[A-Z0-9]{1,3}$/;

// master = {petugas:[{nama,aktif}], shift:[{kode,jam,keterangan}], config:{...}}
// Mengembalikan pesan error, atau null bila valid.
function validateMaster(master, ctx) {
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
  if (config.ob_jam_masuk !== undefined && config.ob_jam_masuk !== '' && !JAM_REGEX.test(config.ob_jam_masuk)) {
    return 'Jam masuk OB harus berformat HH.MM-HH.MM, misalnya 08.00-17.00';
  }
  // OB dan hari libur bersifat opsional: klien lama tidak mengirimnya, dan sheet-nya dibiarkan.
  if (master.ob !== undefined) {
    var eOb = validateOB(master.ob, ctx && ctx.obLama);
    if (eOb) return eOb;
  }
  if (master.libur !== undefined) {
    var eLibur = validateLibur(master.libur);
    if (eLibur) return eLibur;
  }
  return null;
}

// master -> {petugas, shift, config[, ob, libur]}: array 2D (dengan header) untuk setValues.
function masterToSheetValues(master) {
  var out = {
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
  if (master.ob !== undefined) out.ob = obToSheetValues(assignObIds(master.ob));
  if (master.libur !== undefined) out.libur = liburToSheetValues(master.libur);
  return out;
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

// ====================== OB: master, hari libur, catatan kalender ======================
var JABATAN_OB = ['ANGGOTA', 'BACKUP'];
var JENIS_LIBUR = ['Nasional', 'Cuti Bersama', 'Lainnya'];
// S sakit, I izin, TK tanpa keterangan, CT cuti, O libur (pada hari kerja), LEMBUR (masuk pada hari libur)
var JENIS_CATATAN = ['S', 'I', 'TK', 'CT', 'O', 'LEMBUR'];
var JENIS_ABSEN = ['S', 'I', 'TK', 'CT']; // hanya jenis ini yang boleh punya pengganti (backup)
var MAX_OB = 50;
var MAX_LIBUR = 400;
var MAX_CATATAN = 400;

function pad2(n) { return (n < 10 ? '0' : '') + n; }

// Sel tanggal -> "YYYY-MM-DD". Sheets bisa mengubah teks tanggal menjadi objek Date saat diketik manual.
function normalisasiTanggal(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    return v.getFullYear() + '-' + pad2(v.getMonth() + 1) + '-' + pad2(v.getDate());
  }
  return String(v === null || v === undefined ? '' : v).trim();
}

function isValidTanggal(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var p = s.split('-');
  var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return d.getFullYear() === Number(p[0]) && d.getMonth() === Number(p[1]) - 1 && d.getDate() === Number(p[2]);
}

// Master_OB: ID, Nama, Jabatan, Mulai, Selesai, Urutan
function parseOB(values) {
  return values.slice(1)
    .filter(function (r) { return String(r[0]).trim() !== '' || String(r[1]).trim() !== ''; })
    .map(function (r, i) {
      var urut = Number(r[5]);
      var jab = String(r[2]).trim().toUpperCase();
      return {
        id: String(r[0]).trim(),
        nama: String(r[1]).trim(),
        jabatan: JABATAN_OB.indexOf(jab) >= 0 ? jab : 'ANGGOTA',
        mulai: normalisasiTanggal(r[3]),
        selesai: normalisasiTanggal(r[4]),
        urutan: isNaN(urut) || r[5] === '' ? 1e6 + i : urut
      };
    })
    .sort(function (a, b) { return a.urutan - b.urutan; })
    .map(function (o) { return { id: o.id, nama: o.nama, jabatan: o.jabatan, mulai: o.mulai, selesai: o.selesai }; });
}

// Master_Libur: Tanggal, Keterangan, Jenis, Libur
function parseLibur(values) {
  return values.slice(1)
    .filter(function (r) { return normalisasiTanggal(r[0]) !== ''; })
    .map(function (r) {
      var jenis = String(r[2]).trim();
      return {
        tanggal: normalisasiTanggal(r[0]),
        keterangan: String(r[1]).trim(),
        jenis: JENIS_LIBUR.indexOf(jenis) >= 0 ? jenis : 'Lainnya',
        libur: parseBool(r[3])
      };
    })
    .sort(function (a, b) { return a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0; });
}

// OB_Catatan: Tanggal, ID_OB, Jenis, ID_Backup
function parseCatatan(values) {
  return values.slice(1)
    .filter(function (r) { return normalisasiTanggal(r[0]) !== '' && String(r[1]).trim() !== ''; })
    .map(function (r) {
      return {
        tanggal: normalisasiTanggal(r[0]),
        idOb: String(r[1]).trim(),
        jenis: String(r[2]).trim().toUpperCase(),
        idBackup: String(r[3] === undefined ? '' : r[3]).trim()
      };
    });
}

// obLama = [{id, nama}] yang sudah ada di sheet. Orang yang sudah tercatat tidak boleh dihapus
// (riwayat laporan lama bergantung padanya); gunakan tanggal Selesai.
function validateOB(list, obLama) {
  if (!Array.isArray(list)) return 'Data OB tidak valid';
  if (list.length > MAX_OB) return 'Jumlah OB melebihi ' + MAX_OB;
  var names = {}, ids = {};
  for (var i = 0; i < list.length; i++) {
    var o = list[i] || {};
    var nama = typeof o.nama === 'string' ? o.nama.trim() : '';
    if (!nama || nama.length > 100) return 'Nama OB pada baris ' + (i + 1) + ' kosong atau terlalu panjang';
    var key = nama.toLowerCase();
    if (names[key]) {
      return 'Nama OB kembar: ' + nama + '. Untuk orang yang sama, cukup satu baris (isi tanggal Selesai bila sudah berhenti).';
    }
    names[key] = true;
    if (JABATAN_OB.indexOf(String(o.jabatan).toUpperCase()) < 0) return 'Jabatan ' + nama + ' harus ANGGOTA atau BACKUP';
    var mulai = o.mulai || '', selesai = o.selesai || '';
    if (mulai !== '' && !isValidTanggal(mulai)) return 'Tanggal Mulai ' + nama + ' tidak valid';
    if (selesai !== '' && !isValidTanggal(selesai)) return 'Tanggal Selesai ' + nama + ' tidak valid';
    if (mulai !== '' && selesai !== '' && selesai < mulai) return 'Tanggal Selesai ' + nama + ' tidak boleh sebelum tanggal Mulai';
    if (o.id) {
      if (!/^OB\d{3,}$/.test(o.id)) return 'ID OB tidak valid: ' + o.id;
      if (ids[o.id]) return 'ID OB kembar: ' + o.id;
      ids[o.id] = true;
    }
  }
  var lama = obLama || [];
  for (var j = 0; j < lama.length; j++) {
    if (!ids[lama[j].id]) {
      return 'OB "' + lama[j].nama + '" tidak boleh dihapus karena sudah menjadi riwayat. Isi tanggal Selesai (tombol Berhenti) agar laporan lama tetap utuh.';
    }
  }
  return null;
}

// Beri ID (OB001, OB002, ...) pada baris yang belum punya, melanjutkan nomor terbesar yang ada.
function assignObIds(list) {
  var maks = 0;
  list.forEach(function (o) {
    var m = /^OB(\d+)$/.exec(o.id || '');
    if (m) maks = Math.max(maks, Number(m[1]));
  });
  return list.map(function (o) {
    if (o.id) return o;
    maks++;
    var n = String(maks);
    while (n.length < 3) n = '0' + n;
    return { id: 'OB' + n, nama: o.nama, jabatan: o.jabatan, mulai: o.mulai, selesai: o.selesai };
  });
}

function validateLibur(list) {
  if (!Array.isArray(list)) return 'Data hari libur tidak valid';
  if (list.length > MAX_LIBUR) return 'Jumlah hari libur melebihi ' + MAX_LIBUR;
  var seen = {};
  for (var i = 0; i < list.length; i++) {
    var h = list[i] || {};
    if (!isValidTanggal(h.tanggal)) return 'Tanggal hari libur pada baris ' + (i + 1) + ' tidak valid';
    if (seen[h.tanggal]) return 'Tanggal hari libur kembar: ' + h.tanggal;
    seen[h.tanggal] = true;
    if (typeof h.keterangan === 'string' && h.keterangan.length > 100) return 'Keterangan libur ' + h.tanggal + ' terlalu panjang';
    if (JENIS_LIBUR.indexOf(h.jenis) < 0) return 'Jenis libur ' + h.tanggal + ' tidak dikenal';
    if (typeof h.libur !== 'boolean') return 'Status libur ' + h.tanggal + ' harus ya/tidak';
  }
  return null;
}

// Catatan satu bulan. obList = hasil parseOB (untuk memeriksa ID).
function validateCatatan(bulan, list, obList) {
  if (!isValidBulan(bulan)) return 'Format bulan harus YYYY-MM';
  if (!Array.isArray(list)) return 'catatan harus berupa array';
  if (list.length > MAX_CATATAN) return 'Jumlah catatan melebihi ' + MAX_CATATAN;
  var ada = {}, namaDari = {};
  obList.forEach(function (o) { ada[o.id] = true; namaDari[o.id] = o.nama; });
  var pakai = {};
  for (var i = 0; i < list.length; i++) {
    var c = list[i] || {};
    if (!isValidTanggal(c.tanggal) || c.tanggal.indexOf(bulan + '-') !== 0) {
      return 'Tanggal catatan "' + c.tanggal + '" di luar bulan ' + bulan;
    }
    if (JENIS_CATATAN.indexOf(c.jenis) < 0) return 'Jenis catatan tidak dikenal pada ' + c.tanggal + ': ' + c.jenis;
    if (!ada[c.idOb]) return 'OB tidak ditemukan pada catatan ' + c.tanggal + ': ' + c.idOb;
    var kunci = c.tanggal + '|' + c.idOb;
    if (pakai[kunci]) return 'Catatan ganda untuk ' + namaDari[c.idOb] + ' pada ' + c.tanggal;
    pakai[kunci] = true;
    if (c.idBackup) {
      if (JENIS_ABSEN.indexOf(c.jenis) < 0) return 'Backup hanya untuk Sakit, Izin, Tanpa keterangan, atau Cuti (' + c.tanggal + ')';
      if (!ada[c.idBackup]) return 'Backup tidak ditemukan pada catatan ' + c.tanggal + ': ' + c.idBackup;
      if (c.idBackup === c.idOb) return namaDari[c.idOb] + ' tidak bisa menjadi backup untuk dirinya sendiri (' + c.tanggal + ')';
    }
  }
  return null;
}

function obToSheetValues(list) {
  return [['ID', 'Nama', 'Jabatan', 'Mulai', 'Selesai', 'Urutan']].concat(list.map(function (o, i) {
    return [o.id, o.nama.trim(), String(o.jabatan).toUpperCase(), o.mulai || '', o.selesai || '', i + 1];
  }));
}

function liburToSheetValues(list) {
  var urut = list.slice().sort(function (a, b) { return a.tanggal < b.tanggal ? -1 : a.tanggal > b.tanggal ? 1 : 0; });
  return [['Tanggal', 'Keterangan', 'Jenis', 'Libur']].concat(urut.map(function (h) {
    return [h.tanggal, (h.keterangan || '').trim(), h.jenis, h.libur === true];
  }));
}

function catatanToSheetValues(list) {
  var urut = list.slice().sort(function (a, b) {
    if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? -1 : 1;
    return a.idOb < b.idOb ? -1 : a.idOb > b.idOb ? 1 : 0;
  });
  return [['Tanggal', 'ID_OB', 'Jenis', 'ID_Backup']].concat(urut.map(function (c) {
    return [c.tanggal, c.idOb, c.jenis, c.idBackup || ''];
  }));
}

// Mengganti catatan satu bulan tanpa menyentuh bulan lain.
function mergeCatatan(existing, bulan, baru) {
  return existing.filter(function (c) { return c.tanggal.indexOf(bulan + '-') !== 0; }).concat(baru);
}

function filterCatatan(list, dari, sampai) {
  return list.filter(function (c) { return c.tanggal >= dari && c.tanggal <= sampai; });
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
    sheetValuesToGrid: sheetValuesToGrid,
    normalisasiTanggal: normalisasiTanggal,
    isValidTanggal: isValidTanggal,
    parseOB: parseOB,
    parseLibur: parseLibur,
    parseCatatan: parseCatatan,
    validateOB: validateOB,
    assignObIds: assignObIds,
    validateLibur: validateLibur,
    validateCatatan: validateCatatan,
    obToSheetValues: obToSheetValues,
    liburToSheetValues: liburToSheetValues,
    catatanToSheetValues: catatanToSheetValues,
    mergeCatatan: mergeCatatan,
    filterCatatan: filterCatatan
  };
}
