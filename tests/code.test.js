// Menjalankan Code.gs + Logic.gs apa adanya di atas tiruan SpreadsheetApp (tests/fake-sheets.js), untuk menangkap
// kesalahan di sisi Apps Script (yang tidak bisa diuji tanpa spreadsheet sungguhan) sebelum di-deploy.
const test = require("node:test");
const assert = require("node:assert/strict");
const { buatLingkungan, baru } = require("./fake-sheets.js");

// Payload simpan_master dari data master yang sedang tersimpan (seperti yang dikirim layar Pengaturan).
function payloadDari(master, ubah = {}) {
  const config = { ...master.config, pam_aktif: String(master.config.pam_aktif).toUpperCase() !== "FALSE" };
  return {
    petugas: master.petugasSemua,
    shift: master.shift,
    config,
    ob: master.ob.map((o) => ({ ...o })),
    libur: master.libur.map((h) => ({ ...h })),
    ...ubah
  };
}

test("setup(): membuat sheet OB, mengisi libur 2026, dan aman dijalankan ulang", () => {
  const { ctx, sheets, get } = baru();
  const nama = sheets.map((s) => s.name);
  for (const n of ["Master_Petugas", "Master_Shift", "Master_Config", "Master_OB", "Master_Libur", "OB_Catatan"]) {
    assert.ok(nama.includes(n), "sheet " + n + " ada");
  }
  assert.equal(nama.includes("Sheet1"), false, "Sheet1 kosong dipakai ulang");

  const m = get({ action: "master" }).data;
  assert.equal(m.ob.length, 3);
  assert.deepEqual(m.ob.map((o) => [o.id, o.nama, o.jabatan]), [["OB001", "Firdaus", "ANGGOTA"], ["OB002", "Rahmat Hidayat", "ANGGOTA"], ["OB003", "Zulkarnain", "BACKUP"]]);
  assert.equal(m.libur.length, 25);
  assert.equal(m.libur.filter((h) => h.jenis === "Nasional").length, 17);
  assert.equal(m.libur.filter((h) => h.jenis === "Cuti Bersama").length, 8);
  // Hanya libur nasional yang otomatis libur; cuti bersama = info saja
  assert.ok(m.libur.filter((h) => h.jenis === "Nasional").every((h) => h.libur === true));
  assert.ok(m.libur.filter((h) => h.jenis === "Cuti Bersama").every((h) => h.libur === false));
  assert.equal(m.libur.find((h) => h.tanggal === "2026-08-17").keterangan, "Proklamasi Kemerdekaan");

  // Dijalankan ulang tidak menimpa perubahan pengguna
  sheets.find((s) => s.name === "Master_OB").grid[1][1] = "Firdaus Ahmad";
  ctx.setup();
  assert.equal(get({ action: "master" }).data.ob[0].nama, "Firdaus Ahmad");
  assert.equal(get({ action: "master" }).data.libur.length, 25);
});

test("master tetap terbaca bila sheet OB belum ada (aplikasi lama sebelum setup ulang)", () => {
  const env = buatLingkungan();
  env.ctx.setup();
  const idx = env.sheets.findIndex((s) => s.name === "Master_OB");
  env.sheets.splice(idx, 1);
  env.sheets.splice(env.sheets.findIndex((s) => s.name === "Master_Libur"), 1);
  const r = env.get({ action: "master" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.ob, []);
  assert.deepEqual(r.data.libur, []);
});

test("catatan kalender: simpan, baca per rentang, ganti satu bulan tanpa menyentuh bulan lain", () => {
  const { get, post } = baru();
  const agu = [
    { tanggal: "2026-08-17", idOb: "OB001", jenis: "LEMBUR", idBackup: "" },
    { tanggal: "2026-08-17", idOb: "OB002", jenis: "LEMBUR", idBackup: "" },
    { tanggal: "2026-08-26", idOb: "OB001", jenis: "S", idBackup: "OB003" },
    { tanggal: "2026-08-27", idOb: "OB001", jenis: "S", idBackup: "OB003" }
  ];
  assert.equal(post({ action: "simpan_ob_catatan", bulan: "2026-08", catatan: agu }).ok, true);
  const sep = [{ tanggal: "2026-09-02", idOb: "OB002", jenis: "I", idBackup: "" }];
  assert.equal(post({ action: "simpan_ob_catatan", bulan: "2026-09", catatan: sep }).ok, true);

  const semua = get({ action: "ob_catatan", dari: "2026-08-16", sampai: "2026-09-15" }).data.catatan;
  assert.equal(semua.length, 5);
  assert.deepEqual(semua.find((c) => c.tanggal === "2026-08-26"), { tanggal: "2026-08-26", idOb: "OB001", jenis: "S", idBackup: "OB003" });

  const hanyaSep = get({ action: "ob_catatan", dari: "2026-09-01", sampai: "2026-09-30" }).data.catatan;
  assert.deepEqual(hanyaSep.map((c) => c.tanggal), ["2026-09-02"]);

  // Mengosongkan Agustus tidak menghapus September
  assert.equal(post({ action: "simpan_ob_catatan", bulan: "2026-08", catatan: [] }).ok, true);
  const sisa = get({ action: "ob_catatan", dari: "2026-01-01", sampai: "2026-12-31" }).data.catatan;
  assert.deepEqual(sisa.map((c) => c.tanggal), ["2026-09-02"]);
});

test("catatan kalender: validasi menolak data yang salah", () => {
  const { post } = baru();
  const coba = (catatan, bulan = "2026-08") => post({ action: "simpan_ob_catatan", bulan, catatan });
  const dasar = { tanggal: "2026-08-10", idOb: "OB001", jenis: "S", idBackup: "" };

  assert.match(coba([{ ...dasar, idOb: "OB999" }]).error, /OB tidak ditemukan/);
  assert.match(coba([{ ...dasar, tanggal: "2026-09-01" }]).error, /di luar bulan/);
  assert.match(coba([{ ...dasar, tanggal: "2026-08-32" }]).error, /di luar bulan/);
  assert.match(coba([{ ...dasar, jenis: "X" }]).error, /Jenis catatan/);
  assert.match(coba([dasar, { ...dasar, jenis: "I" }]).error, /Catatan ganda/);
  assert.match(coba([{ ...dasar, jenis: "LEMBUR", idBackup: "OB003" }]).error, /Backup hanya untuk/);
  assert.match(coba([{ ...dasar, idBackup: "OB001" }]).error, /backup untuk dirinya sendiri/);
  assert.match(coba([{ ...dasar, idBackup: "OB777" }]).error, /Backup tidak ditemukan/);
  assert.match(coba([dasar], "2026-8").error, /Format bulan/);
  assert.equal(coba([dasar]).ok, true);
});

test("ob_catatan: parameter tanggal divalidasi", () => {
  const { get } = baru();
  assert.match(get({ action: "ob_catatan", dari: "kemarin", sampai: "2026-08-01" }).error, /Format tanggal/);
  assert.match(get({ action: "ob_catatan", dari: "2026-09-01", sampai: "2026-08-01" }).error, /sebelum/);
});

test("Pengaturan OB: rename tetap orang yang sama, orang baru dapat ID baru, tidak boleh dihapus", () => {
  const { get, post } = baru();
  const m = get({ action: "master" }).data;

  // rename + berhenti + orang baru
  const ob = m.ob.map((o) => ({ ...o }));
  ob[0].nama = "Firdaus Ahmad";
  ob[2].selesai = "2026-10-31";
  ob.push({ id: "", nama: "Budi Santoso", jabatan: "ANGGOTA", mulai: "2026-11-01", selesai: "" });
  const r = post({ action: "simpan_master", master: payloadDari(m, { ob }) });
  assert.equal(r.ok, true, r.error);

  const setelah = get({ action: "master" }).data.ob;
  assert.deepEqual(setelah.map((o) => o.id), ["OB001", "OB002", "OB003", "OB004"]);
  assert.equal(setelah[0].nama, "Firdaus Ahmad");
  assert.equal(setelah[2].selesai, "2026-10-31");
  assert.equal(setelah[3].mulai, "2026-11-01");

  // riwayat: catatan lama tetap menunjuk OB001 walau nama berubah
  assert.equal(post({ action: "simpan_ob_catatan", bulan: "2026-08", catatan: [{ tanggal: "2026-08-26", idOb: "OB001", jenis: "S", idBackup: "OB003" }] }).ok, true);

  // menghapus OB lama ditolak
  const tanpaZul = setelah.filter((o) => o.id !== "OB003");
  const gagal = post({ action: "simpan_master", master: payloadDari(get({ action: "master" }).data, { ob: tanpaZul }) });
  assert.equal(gagal.ok, false);
  assert.match(gagal.error, /Zulkarnain.*tidak boleh dihapus/);
  assert.equal(get({ action: "master" }).data.ob.length, 4, "data tidak berubah setelah ditolak");

  // nama kembar ditolak
  const kembar = setelah.map((o) => ({ ...o }));
  kembar[1].nama = "firdaus ahmad";
  assert.match(post({ action: "simpan_master", master: payloadDari(get({ action: "master" }).data, { ob: kembar }) }).error, /Nama OB kembar/);
});

test("Pengaturan hari libur: ubah, tambah tahun baru, tolak tanggal salah/kembar", () => {
  const { get, post } = baru();
  const m = get({ action: "master" }).data;

  const libur = m.libur.map((h) => ({ ...h }));
  libur.find((h) => h.tanggal === "2026-03-23").libur = true; // perusahaan memutuskan cuti bersama = libur
  libur.push({ tanggal: "2027-01-01", keterangan: "Tahun Baru 2027 Masehi", jenis: "Nasional", libur: true });
  assert.equal(post({ action: "simpan_master", master: payloadDari(m, { libur }) }).ok, true);
  const setelah = get({ action: "master" }).data.libur;
  assert.equal(setelah.length, 26);
  assert.equal(setelah.find((h) => h.tanggal === "2026-03-23").libur, true);
  assert.equal(setelah[setelah.length - 1].tanggal, "2027-01-01", "terurut menurut tanggal");

  const salah = (l) => post({ action: "simpan_master", master: payloadDari(get({ action: "master" }).data, { libur: l }) }).error;
  assert.match(salah([{ tanggal: "2026-02-30", keterangan: "", jenis: "Nasional", libur: true }]), /tidak valid/);
  assert.match(salah([{ tanggal: "2026-05-01", keterangan: "", jenis: "Nasional", libur: true }, { tanggal: "2026-05-01", keterangan: "", jenis: "Lainnya", libur: true }]), /kembar/);
  assert.match(salah([{ tanggal: "2026-05-01", keterangan: "", jenis: "Aneh", libur: true }]), /Jenis libur/);
});

test("klien lama (tanpa ob/libur) menyimpan master tanpa merusak sheet OB", () => {
  const { get, post } = baru();
  const m = get({ action: "master" }).data;
  const lama = payloadDari(m);
  delete lama.ob;
  delete lama.libur;
  lama.config.lokasi = "LOKASI BARU";
  assert.equal(post({ action: "simpan_master", master: lama }).ok, true);
  const setelah = get({ action: "master" }).data;
  assert.equal(setelah.config.lokasi, "LOKASI BARU");
  assert.equal(setelah.ob.length, 3);
  assert.equal(setelah.libur.length, 25);
});

test("jam masuk OB divalidasi", () => {
  const { get, post } = baru();
  const m = get({ action: "master" }).data;
  const p = payloadDari(m);
  p.config.ob_jam_masuk = "8-17";
  assert.match(post({ action: "simpan_master", master: p }).error, /Jam masuk OB/);
  p.config.ob_jam_masuk = "07.30-16.30";
  assert.equal(post({ action: "simpan_master", master: p }).ok, true);
  assert.equal(get({ action: "master" }).data.config.ob_jam_masuk, "07.30-16.30");
});

test("tanggal yang diketik manual di Sheets (berubah jadi Date) tetap terbaca", () => {
  const { sheets, get } = baru();
  const sh = sheets.find((s) => s.name === "Master_OB");
  sh.grid[2][3] = new Date(2026, 7, 1); // Mulai Rahmat, diubah manual jadi tanggal
  sh.grid[2][4] = new Date(2026, 11, 31); // Selesai
  const rahmat = get({ action: "master" }).data.ob.find((o) => o.id === "OB002");
  assert.equal(rahmat.mulai, "2026-08-01");
  assert.equal(rahmat.selesai, "2026-12-31");
});

test("aksi lama (jadwal bulanan) tidak terganggu", () => {
  const { get, post } = baru();
  const rows = [{ nama: "Agus Sudirman", hari: { 1: "P", 2: "X" } }];
  assert.equal(post({ action: "simpan", bulan: "2026-11", rows }).ok, true);
  assert.deepEqual(get({ action: "bulan" }).data.bulan, ["2026-11"]);
  assert.deepEqual(get({ action: "jadwal", bulan: "2026-11" }).data.rows, [{ nama: "Agus Sudirman", hari: { 1: "P", 2: "X" } }]);
});

test("catatan cuti bersama (CB): diterima, tanpa backup", () => {
  const { get, post } = baru();
  const cb = { tanggal: "2026-03-20", idOb: "OB001", jenis: "CB", idBackup: "" };
  assert.equal(post({ action: "simpan_ob_catatan", bulan: "2026-03", catatan: [cb, { ...cb, idOb: "OB002" }] }).ok, true);
  assert.deepEqual(get({ action: "ob_catatan", dari: "2026-03-01", sampai: "2026-03-31" }).data.catatan.map((c) => c.jenis), ["CB", "CB"]);
  assert.match(post({ action: "simpan_ob_catatan", bulan: "2026-03", catatan: [{ ...cb, idBackup: "OB003" }] }).error, /Backup hanya untuk/);
});
