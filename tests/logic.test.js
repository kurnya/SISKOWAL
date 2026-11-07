const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../apps-script/Logic.gs");
const { createApi } = require("../api.js");

test("isValidBulan & daysInMonth", () => {
  assert.equal(L.isValidBulan("2026-01"), true);
  assert.equal(L.isValidBulan("2026-13"), false);
  assert.equal(L.isValidBulan("2026-1"), false);
  assert.equal(L.daysInMonth("2026-02"), 28);
  assert.equal(L.daysInMonth("2028-02"), 29);
  assert.equal(L.daysInMonth("2026-12"), 31);
});

test("parsePetugas: hanya aktif, urut menurut Urutan", () => {
  const v = [["Nama", "Aktif", "Urutan"], ["B", true, 2], ["A", "TRUE", 1], ["C", false, 3], ["", true, 4], ["D", true, ""]];
  assert.deepEqual(L.parsePetugas(v), ["A", "B", "D"]);
});

test("parseShift & parseConfig", () => {
  assert.deepEqual(L.parseShift([["Kode", "Jam", "K"], ["p", "08.00-16.00", "Pagi"]]), [{ kode: "P", jam: "08.00-16.00", keterangan: "Pagi" }]);
  assert.deepEqual(L.parseConfig([["Kunci", "Nilai"], ["lokasi", " X "]]), { lokasi: "X" });
});

test("validateRows", () => {
  const codes = ["P", "S", "X"];
  assert.equal(L.validateRows([{ nama: "A", hari: { 1: "p", 28: "X" } }], codes, 28), null);
  assert.match(L.validateRows([{ nama: "A", hari: { 1: "Z" } }], codes, 28), /Kode shift tidak dikenal "Z" untuk A tanggal 1/);
  assert.match(L.validateRows([{ nama: "A", hari: { 29: "P" } }], codes, 28), /di luar bulan/);
  assert.match(L.validateRows([{ nama: "", hari: {} }], codes, 28), /tidak valid/);
  assert.match(L.validateRows("x", codes, 28), /array/);
});

test("gridToSheetValues <-> sheetValuesToGrid roundtrip", () => {
  const rows = [{ nama: "A", hari: { 1: "p", 3: "S" } }, { nama: "B", hari: {} }];
  const values = L.gridToSheetValues(rows, 3);
  assert.deepEqual(values[0], ["Nama", 1, 2, 3]);
  assert.deepEqual(values[1], ["A", "P", "", "S"]);
  assert.deepEqual(L.sheetValuesToGrid(values), [
    { nama: "A", hari: { 1: "P", 3: "S" } },
    { nama: "B", hari: {} }
  ]);
  assert.deepEqual(L.sheetValuesToGrid([["Nama"]]), []);
});

const resp = (payload) => ({ json: async () => payload });

test("api: sukses", async () => {
  const api = createApi({ getUrl: () => "http://x", fetchImpl: async () => resp({ ok: true, data: { a: 1 } }), baseDelayMs: 0 });
  assert.deepEqual(await api.getMaster(), { a: 1 });
});

test("api: retry pada kegagalan jaringan lalu berhasil", async () => {
  let n = 0;
  const api = createApi({
    getUrl: () => "http://x",
    fetchImpl: async () => { if (++n < 3) throw new Error("network"); return resp({ ok: true, data: 1 }); },
    baseDelayMs: 0
  });
  assert.equal(await api.getJadwal("2026-01"), 1);
  assert.equal(n, 3);
});

test("api: error server tidak di-retry", async () => {
  let n = 0;
  const api = createApi({ getUrl: () => "http://x", fetchImpl: async () => { n++; return resp({ ok: false, error: "kode salah" }); }, baseDelayMs: 0 });
  await assert.rejects(api.simpanJadwal("2026-01", []), /kode salah/);
  assert.equal(n, 1);
});

test("api: respons bukan JSON & URL kosong", async () => {
  const bad = createApi({ getUrl: () => "http://x", fetchImpl: async () => ({ json: async () => { throw new Error("x"); } }), baseDelayMs: 0 });
  await assert.rejects(bad.getMaster(), /tidak bisa dijangkau/);
  const empty = createApi({ getUrl: () => "", fetchImpl: async () => resp({}), baseDelayMs: 0 });
  await assert.rejects(empty.getMaster(), /API_URL belum diisi/);
});

// ---------- Pengaturan master ----------
const { deriveJamColumns, pdfFontSize } = require("../columns.js");

const masterOk = () => ({
  petugas: [{ nama: "A", aktif: true }, { nama: "B", aktif: false }],
  shift: [
    { kode: "P", jam: "08.00-16.00", keterangan: "Pagi" },
    { kode: "X", jam: "-", keterangan: "Libur" }
  ],
  config: { perusahaan: "PT", alamat: "", kontak: "", lokasi: "L", keterangan_00_05: "PAM", pam_aktif: true }
});

test("validateMaster: valid", () => {
  assert.equal(L.validateMaster(masterOk()), null);
});

test("validateMaster: petugas", () => {
  let m = masterOk(); m.petugas = [{ nama: "A", aktif: true }, { nama: " a ", aktif: true }];
  assert.match(L.validateMaster(m), /kembar/);
  m = masterOk(); m.petugas = [{ nama: "  ", aktif: true }];
  assert.match(L.validateMaster(m), /kosong/);
  m = masterOk(); m.petugas = [{ nama: "A", aktif: false }];
  assert.match(L.validateMaster(m), /Minimal satu petugas/);
});

test("validateMaster: shift", () => {
  let m = masterOk(); m.shift.push({ kode: "p", jam: "09.00-17.00", keterangan: "" });
  assert.match(L.validateMaster(m), /kembar/);
  m = masterOk(); m.shift.push({ kode: "Q", jam: "8-16", keterangan: "" });
  assert.match(L.validateMaster(m), /HH\.MM-HH\.MM/);
  m = masterOk(); m.shift.push({ kode: "Q", jam: "25.00-16.00", keterangan: "" });
  assert.match(L.validateMaster(m), /HH\.MM-HH\.MM/);
  m = masterOk(); m.shift.push({ kode: "TOOLONG", jam: "08.00-16.00", keterangan: "" });
  assert.match(L.validateMaster(m), /1-3 huruf/);
  m = masterOk(); m.shift = [{ kode: "P", jam: "08.00-16.00", keterangan: "" }];
  assert.match(L.validateMaster(m), /X \(libur\) wajib/);
  m = masterOk(); m.shift[1].jam = "08.00-16.00";
  assert.match(L.validateMaster(m), /harus berjam "-"/);
  // Kode libur tambahan (mis. O) boleh berjam "-".
  m = masterOk(); m.shift.push({ kode: "O", jam: "-", keterangan: "Libur" });
  assert.equal(L.validateMaster(m), null);
  m = masterOk(); m.shift.push({ kode: "O", jam: "", keterangan: "" });
  assert.match(L.validateMaster(m), /HH\.MM-HH\.MM/);
});

test("validateMaster: config & bentuk data", () => {
  let m = masterOk(); m.config.pam_aktif = "TRUE";
  assert.match(L.validateMaster(m), /pam_aktif/);
  m = masterOk(); m.config.lokasi = "x".repeat(301);
  assert.match(L.validateMaster(m), /terlalu panjang/);
  assert.match(L.validateMaster(null), /tidak valid/);
  assert.match(L.validateMaster({ petugas: [] }), /tidak lengkap/);
});

test("masterToSheetValues", () => {
  const v = L.masterToSheetValues(masterOk());
  assert.deepEqual(v.petugas, [["Nama", "Aktif", "Urutan"], ["A", true, 1], ["B", false, 2]]);
  assert.deepEqual(v.shift[1], ["P", "08.00-16.00", "Pagi"]);
  assert.deepEqual(v.config[v.config.length - 1], ["pam_aktif", "TRUE"]);
  const off = masterOk(); off.config.pam_aktif = false;
  assert.deepEqual(L.masterToSheetValues(off).config.slice(-1)[0], ["pam_aktif", "FALSE"]);
});

test("parsePetugasAll & parseConfig boolean dari Sheets", () => {
  const v = [["Nama", "Aktif", "Urutan"], ["B", false, 2], ["A", true, 1]];
  assert.deepEqual(L.parsePetugasAll(v), [{ nama: "A", aktif: true }, { nama: "B", aktif: false }]);
  assert.equal(L.parseConfig([["Kunci", "Nilai"], ["pam_aktif", false]]).pam_aktif, "FALSE");
  assert.equal(L.parseConfig([["Kunci", "Nilai"], ["pam_aktif", true]]).pam_aktif, "TRUE");
});

test("deriveJamColumns: unik, urut kemunculan, tanpa '-'", () => {
  const shift = [
    { kode: "P", jam: "08.00-16.00" }, { kode: "S", jam: "16.00-00.00" },
    { kode: "P2", jam: "08.00-16.00" }, { kode: "X", jam: "-" }, { kode: "Z", jam: " 19.00-08.00 " }
  ];
  assert.deepEqual(deriveJamColumns(shift), ["08.00-16.00", "16.00-00.00", "19.00-08.00"]);
  assert.deepEqual(deriveJamColumns([]), []);
});

test("pdfFontSize mengecil seiring jumlah kolom", () => {
  assert.equal(pdfFontSize(8), 8);
  assert.equal(pdfFontSize(10), 7);
  assert.equal(pdfFontSize(12), 6);
});

test("api.simpanMaster mengirim aksi simpan_master", async () => {
  let sent;
  const api = createApi({
    getUrl: () => "http://x",
    fetchImpl: async (url, opt) => { sent = JSON.parse(opt.body); return resp({ ok: true, data: 1 }); },
    baseDelayMs: 0
  });
  await api.simpanMaster({ a: 1 });
  assert.deepEqual(sent, { action: "simpan_master", master: { a: 1 } });
});

test("listBulan: hanya sheet YYYY-MM, terbaru dulu", () => {
  assert.deepEqual(
    L.listBulan(["Master_Petugas", "2026-01", "2025-12", "2026-11", "Sheet1", "2026-13", "2026-2"]),
    ["2026-11", "2026-01", "2025-12"]
  );
  assert.deepEqual(L.listBulan(["Master_Config"]), []);
});

test("api.getDaftarBulan memanggil action=bulan", async () => {
  let url;
  const api = createApi({ getUrl: () => "http://x", fetchImpl: async (u) => { url = u; return resp({ ok: true, data: { bulan: [] } }); }, baseDelayMs: 0 });
  assert.deepEqual(await api.getDaftarBulan(), { bulan: [] });
  assert.equal(url, "http://x?action=bulan");
});

// ---------- Laporan absensi ----------
const A = require("../absensi.js");

test("periodeAbsensi: 16 bulan lalu s.d. 15 bulan dipilih", () => {
  const p = A.periodeAbsensi(2026, 8); // September
  assert.equal(p.prevKey, "2026-08");
  assert.equal(p.curKey, "2026-09");
  assert.equal(p.hari.length, 31); // 16-31 Agu (16) + 1-15 Sep (15)
  assert.deepEqual(p.hari[0], { tgl: 16, bulan: "prev" });
  assert.deepEqual(p.hari[15], { tgl: 31, bulan: "prev" });
  assert.deepEqual(p.hari[16], { tgl: 1, bulan: "cur" });
  assert.equal(p.mulaiLabel, "16 AGUSTUS 2026");
  assert.equal(p.selesaiLabel, "15 SEPTEMBER 2026");
  assert.equal(p.tanggalLaporan, "16 September 2026");
  assert.equal(p.mulaiPendek, "16 AGU 2026");
});

test("periodeAbsensi: Januari -> Desember tahun lalu; Maret -> Februari 28 hari", () => {
  const jan = A.periodeAbsensi(2026, 0);
  assert.equal(jan.prevKey, "2025-12");
  assert.equal(jan.mulaiLabel, "16 DESEMBER 2025");
  assert.equal(jan.hari.length, 16 + 15);
  const mar = A.periodeAbsensi(2026, 2);
  assert.equal(mar.prevKey, "2026-02");
  assert.equal(mar.hari.length, 13 + 15); // 16-28 Feb + 1-15 Mar
});

test("gabungAnggota: 5 di bulan lalu, 4 di bulan ini", () => {
  const prev = ["A", "B", "C", "D", "E"].map((nama) => ({ nama, hari: {} }));
  const cur = ["A", "B", "C", "D"].map((nama) => ({ nama, hari: {} }));
  const hasil = A.gabungAnggota(prev, cur, ["A", "B", "C", "D", "E"]);
  assert.deepEqual(hasil.map((h) => h.nama), ["A", "B", "C", "D", "E"]);
  assert.deepEqual(hasil[4], { nama: "E", diPrev: true, diCur: false });
  assert.deepEqual(hasil[0], { nama: "A", diPrev: true, diCur: true });
});

test("gabungAnggota: urutan master dulu, yang tak dikenal di akhir; anggota baru", () => {
  const prev = [{ nama: "Z", hari: {} }, { nama: "B", hari: {} }];
  const cur = [{ nama: "A", hari: {} }, { nama: "B", hari: {} }, { nama: "Y", hari: {} }];
  const hasil = A.gabungAnggota(prev, cur, ["A", "B"]);
  assert.deepEqual(hasil.map((h) => h.nama), ["A", "B", "Z", "Y"]);
  assert.equal(hasil[0].diPrev, false);
});

test("bangunBaris: libur jadi O, anggota yang tak ada di bulan itu kosong, PAM semua M", () => {
  const periode = A.periodeAbsensi(2026, 8);
  const shiftMap = { P: "08.00-16.00", X: "-", O: "-" };
  const prev = [{ nama: "Ani", hari: { 16: "p", 17: "X", 18: "O" } }]; // 19 dst kosong -> libur
  const cur = [{ nama: "Budi", hari: { 1: "P" } }];
  const [ani, budi, pam] = A.bangunBaris({
    periode, rowsPrev: prev, rowsCur: cur, terpilih: ["Ani", "Budi"], shiftMap, pam: { nama: "Dwi (PAM)" }
  });
  assert.deepEqual(ani.kode.slice(0, 4), ["P", "O", "O", "O"]); // p -> P; X, O, kosong -> O
  assert.equal(ani.kode[16], ""); // tgl 1 Sep: Ani tidak ada di jadwal September
  assert.equal(budi.kode[0], ""); // tgl 16 Agu: Budi tidak ada di jadwal Agustus
  assert.equal(budi.kode[16], "P");
  assert.equal(budi.kode[17], "O"); // ada di sheet tapi tanggal 2 kosong -> libur
  assert.equal(ani.nama, "ANI");
  assert.equal(ani.jabatan, "ANGGOTA");
  assert.equal(pam.jabatan, "TNI PAM");
  assert.ok(pam.kode.every((k) => k === "M") && pam.kode.length === 31);
});

test("bangunBaris: anggota dikecualikan tidak ikut; tanpa PAM bila pam null", () => {
  const periode = A.periodeAbsensi(2026, 8);
  const rows = [{ nama: "A", hari: {} }, { nama: "E", hari: {} }];
  const baris = A.bangunBaris({ periode, rowsPrev: rows, rowsCur: rows, terpilih: ["A"], shiftMap: {}, pam: null });
  assert.deepEqual(baris.map((b) => b.nama), ["A"]);
});

test("bangunLegenda: hanya kode yang dipakai, urut master, libur di akhir", () => {
  const shiftList = [
    { kode: "P", jam: "08.00-16.00", keterangan: "Pagi" },
    { kode: "S", jam: "16.00-00.00", keterangan: "Sore" },
    { kode: "M", jam: "00.00-08.00", keterangan: "Malam" },
    { kode: "X", jam: "-", keterangan: "Libur" }
  ];
  const baris = [{ kode: ["M", "P", "O", ""] }]; // S tidak dipakai
  const l = A.bangunLegenda(baris, shiftList, "Jam Kerja 8 Jam");
  assert.deepEqual(l.kiri, ["P : Jadwal Masuk Pagi", "M : Jadwal Masuk Malam", "O : Off/Libur"]);
  assert.deepEqual(l.kanan, ["Jam Kerja 8 Jam", "Masuk Pagi Pukul 08.00 WIB – 16.00 WIB", "Masuk Malam Pukul 00.00 WIB – 08.00 WIB"]);
});

test("configLaporan: bawaan untuk kunci yang belum ada, kosong yang disengaja dipertahankan", () => {
  const c = A.configLaporan({ absensi_kota: "", perusahaan: "PT" });
  assert.equal(c.absensi_kota, ""); // sengaja dikosongkan
  assert.equal(c.absensi_jam_kerja, "Jam Kerja 8 Jam"); // belum ada -> bawaan
  assert.equal(c.perusahaan, "PT");
});

test("masterToSheetValues menyertakan kolom config laporan", () => {
  const m = masterOk(); m.config.absensi_kota = "Depok";
  const kunci = L.masterToSheetValues(m).config.map((r) => r[0]);
  assert.ok(kunci.includes("absensi_catatan") && kunci.includes("absensi_kota"));
  assert.deepEqual(L.masterToSheetValues(m).config.find((r) => r[0] === "absensi_kota"), ["absensi_kota", "Depok"]);
  assert.equal(L.validateMaster(m), null);
});
