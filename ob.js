// Logika murni modul OB (kalender catatan dan laporan absensi). Berjalan di browser dan di Node (untuk tes).
//
// Aturan dasar:
//  - Hari kerja: kosong = masuk (P).
//  - Sabtu, Minggu, libur nasional, dan cuti bersama: kosong = libur (O).
//  - Libur lain mengikuti centang otomatis-libur; hari kerja lainnya kosong = masuk (P).
//  - Catatan hari kerja: Sakit S, Izin I, Tanpa keterangan TK, Cuti biasa CT, Cuti bersama (tampil O), Libur lain O,
//    dengan backup (pengganti) opsional untuk S/I/TK/CT.
//  - Catatan hari libur: Lembur = OB itu masuk (P).
(function (root) {
  const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const NAMA_JENIS = { S: "Sakit", I: "Izin", TK: "Tanpa keterangan", CT: "Cuti biasa", CB: "Cuti bersama", O: "Libur lain", LEMBUR: "Lembur" };
  // Pilihan catatan pada hari kerja. CB (cuti bersama) dan O (libur lain) sama-sama tampil "O" di laporan; CT (cuti biasa) tampil "CT".
  const JENIS_HARI_KERJA = ["S", "I", "TK", "CT", "CB", "O"];
  const JENIS_ABSEN = ["S", "I", "TK", "CT"]; // yang boleh punya backup
  const KODE_MASUK = "P";
  const KODE_LIBUR = "O";
  const KODE_TIDAK_BEKERJA = "-";

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (tahun, bulan0, tgl) => `${tahun}-${pad(bulan0 + 1)}-${pad(tgl)}`;

  // 0 = Minggu ... 6 = Sabtu
  function hariKe(isoStr) {
    const [y, m, d] = isoStr.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
  }

  // Status bawaan sebuah tanggal. info = keterangan tambahan untuk hari yang BUKAN libur otomatis
  // (mis. cuti bersama), supaya kalender bisa mengingatkan bahwa perlu dicatat bila perusahaan meliburkan.
  function statusHari(isoStr, libur) {
    const baris = (libur || []).find((h) => h.tanggal === isoStr);
    if (baris && (baris.libur || baris.jenis === "Cuti Bersama")) {
      return { libur: true, alasan: baris.keterangan || baris.jenis, info: "", jenisInfo: "" };
    }
    const dow = hariKe(isoStr);
    if (dow === 0) return { libur: true, alasan: "Minggu", info: "", jenisInfo: "" };
    if (dow === 6) return { libur: true, alasan: "Sabtu", info: "", jenisInfo: "" };
    return { libur: false, alasan: "", info: baris ? baris.keterangan : "", jenisInfo: baris ? baris.jenis : "" };
  }

  // OB berstatus aktif pada tanggal tertentu bila tanggal itu di dalam masa Mulai–Selesai (batas boleh kosong).
  function aktifPada(ob, isoStr) {
    return (!ob.mulai || isoStr >= ob.mulai) && (!ob.selesai || isoStr <= ob.selesai);
  }

  // Kode sel laporan untuk satu OB pada satu tanggal. catatanHari = semua catatan pada tanggal itu.
  function kodeOB(ob, isoStr, status, catatanHari) {
    if (!aktifPada(ob, isoStr)) return KODE_TIDAK_BEKERJA;
    const sendiri = catatanHari.find((c) => c.idOb === ob.id);
    if (sendiri) {
      if (sendiri.jenis === "LEMBUR") return KODE_MASUK;
      if (sendiri.jenis === "CB") return KODE_LIBUR; // cuti bersama dihitung O di laporan
      return sendiri.jenis;
    }
    if (catatanHari.some((c) => c.idBackup === ob.id)) return KODE_MASUK; // menggantikan rekan yang absen
    if (ob.jabatan === "BACKUP") return KODE_TIDAK_BEKERJA;
    return status.libur ? KODE_LIBUR : KODE_MASUK;
  }

  function catatanPerTanggal(catatan) {
    const peta = {};
    catatan.forEach((c) => (peta[c.tanggal] = peta[c.tanggal] || []).push(c));
    return peta;
  }

  // ANGGOTA dulu, lalu BACKUP; urutan di dalam masing-masing tetap seperti di master.
  function urutkanOB(list) {
    return [...list.filter((o) => o.jabatan !== "BACKUP"), ...list.filter((o) => o.jabatan === "BACKUP")];
  }

  // OB yang masa tugasnya beririsan dengan periode. sebagian = hanya bertugas pada sebagian periode.
  function anggotaPeriode(ob, periode) {
    return urutkanOB(
      ob
        .filter((o) => (!o.mulai || o.mulai <= periode.akhirIso) && (!o.selesai || o.selesai >= periode.awalIso))
        .map((o) => ({ ...o, sebagian: Boolean((o.mulai && o.mulai > periode.awalIso) || (o.selesai && o.selesai < periode.akhirIso)) }))
    );
  }

  // Baris laporan untuk OB terpilih sepanjang periode (periode.hari[].iso).
  function barisPeriode({ periode, ob, libur, catatan, terpilihIds }) {
    const perTanggal = catatanPerTanggal(catatan);
    const pilih = new Set(terpilihIds);
    return urutkanOB(ob.filter((o) => pilih.has(o.id))).map((o) => ({
      nama: o.nama.toUpperCase(),
      jabatan: o.jabatan,
      kode: periode.hari.map((h) => kodeOB(o, h.iso, statusHari(h.iso, libur), perTanggal[h.iso] || []))
    }));
  }

  function jamWib(jam) {
    const [a, b] = jam.split("-");
    return `${a} WIB – ${b} WIB`;
  }

  // Legenda laporan OB seperti contoh: "P : Jadwal Masuk", baris kosong, "O : Off/Libur" di kiri;
  // jam kerja dan jam masuk di kanan.
  function legendaOB(config) {
    return {
      kiri: [`${KODE_MASUK} : Jadwal Masuk`, "", `${KODE_LIBUR} : Off/Libur`],
      kanan: [config.absensi_jam_kerja, config.ob_jam_masuk ? `Masuk Pagi Pukul ${jamWib(config.ob_jam_masuk)}` : ""].filter(Boolean)
    };
  }

  // Teks ringkas catatan untuk label di kalender: "Sakit · Firdaus → Zulkarnain".
  function labelCatatan(c, obPerId) {
    const nama = (obPerId[c.idOb] || { nama: "?" }).nama;
    const backup = c.idBackup && obPerId[c.idBackup] ? ` → ${obPerId[c.idBackup].nama}` : "";
    return `${NAMA_JENIS[c.jenis] || c.jenis} · ${nama}${backup}`;
  }

  // Sel-sel kalender satu bulan, dimulai hari Senin. null = sel kosong di awal/akhir minggu.
  function selKalender(tahun, bulan0) {
    const jumlah = new Date(tahun, bulan0 + 1, 0).getDate();
    const offset = (new Date(tahun, bulan0, 1).getDay() + 6) % 7; // Senin = 0
    const sel = Array(offset).fill(null);
    for (let d = 1; d <= jumlah; d++) sel.push({ tgl: d, iso: iso(tahun, bulan0, d) });
    while (sel.length % 7 !== 0) sel.push(null);
    return sel;
  }

  const api = {
    NAMA_BULAN, NAMA_HARI, NAMA_JENIS, JENIS_HARI_KERJA, JENIS_ABSEN, KODE_MASUK, KODE_LIBUR, KODE_TIDAK_BEKERJA,
    iso, hariKe, statusHari, aktifPada, kodeOB, catatanPerTanggal, urutkanOB, anggotaPeriode, barisPeriode,
    legendaOB, labelCatatan, selKalender
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.kalenderOb = api;
})(typeof window !== "undefined" ? window : globalThis);
