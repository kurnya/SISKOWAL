// Logika murni laporan absensi: periode 16 bulan lalu s.d. 15 bulan dipilih.
// Berjalan di browser dan di Node (untuk tes).
(function (root) {
  const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const KODE_LIBUR = "O"; // di laporan, semua kode libur (X, O, kosong) ditulis "O"
  const KODE_PAM = "M"; // baris PAM diisi kode ini setiap hari
  const JABATAN = "ANGGOTA";
  const JABATAN_PAM = "TNI PAM";

  const pad = (n) => String(n).padStart(2, "0");
  const hariDalamBulan = (tahun, bulan0) => new Date(tahun, bulan0 + 1, 0).getDate();

  // bulan0 = indeks bulan terpilih (0-11) = bulan tempat tanggal 15 berakhir.
  function periodeAbsensi(tahun, bulan0) {
    const prev = new Date(tahun, bulan0 - 1, 1);
    const prevTahun = prev.getFullYear();
    const prevBulan0 = prev.getMonth();
    const iso = (y, m0, d) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
    const hari = [];
    for (let d = 16; d <= hariDalamBulan(prevTahun, prevBulan0); d++) hari.push({ tgl: d, bulan: "prev", iso: iso(prevTahun, prevBulan0, d) });
    for (let d = 1; d <= 15; d++) hari.push({ tgl: d, bulan: "cur", iso: iso(tahun, bulan0, d) });
    return {
      prevKey: `${prevTahun}-${pad(prevBulan0 + 1)}`,
      curKey: `${tahun}-${pad(bulan0 + 1)}`,
      prevLabel: `${NAMA_BULAN[prevBulan0]} ${prevTahun}`,
      curLabel: `${NAMA_BULAN[bulan0]} ${tahun}`,
      mulaiLabel: `16 ${NAMA_BULAN[prevBulan0].toUpperCase()} ${prevTahun}`,
      selesaiLabel: `15 ${NAMA_BULAN[bulan0].toUpperCase()} ${tahun}`,
      mulaiPendek: `16 ${NAMA_BULAN[prevBulan0].slice(0, 3).toUpperCase()} ${prevTahun}`,
      selesaiPendek: `15 ${NAMA_BULAN[bulan0].slice(0, 3).toUpperCase()} ${tahun}`,
      tanggalLaporan: `16 ${NAMA_BULAN[bulan0]} ${tahun}`,
      awalIso: hari[0].iso,
      akhirIso: hari[hari.length - 1].iso,
      hari
    };
  }

  // Gabungan anggota dari kedua bulan. Urutan: menurut master, lalu sisanya menurut kemunculan.
  function gabungAnggota(rowsPrev, rowsCur, urutanMaster) {
    const inPrev = new Set(rowsPrev.map((r) => r.nama));
    const inCur = new Set(rowsCur.map((r) => r.nama));
    const semua = [...new Set([...rowsPrev.map((r) => r.nama), ...rowsCur.map((r) => r.nama)])];
    const dikenal = urutanMaster.filter((n) => semua.includes(n));
    const lainnya = semua.filter((n) => !urutanMaster.includes(n));
    return [...dikenal, ...lainnya].map((nama) => ({ nama, diPrev: inPrev.has(nama), diCur: inCur.has(nama) }));
  }

  // Satu baris per anggota terpilih. Sel kosong ("") berarti anggota itu tidak ada di jadwal bulan tsb.
  function bangunBaris({ periode, rowsPrev, rowsCur, terpilih, shiftMap, pam }) {
    const peta = { prev: new Map(rowsPrev.map((r) => [r.nama, r])), cur: new Map(rowsCur.map((r) => [r.nama, r])) };
    const baris = terpilih.map((nama) => ({
      nama: nama.toUpperCase(),
      jabatan: JABATAN,
      kode: periode.hari.map((h) => {
        const r = peta[h.bulan].get(nama);
        if (!r) return "";
        const v = String(r.hari[h.tgl] || "").trim().toUpperCase();
        if (!v || shiftMap[v] === "-") return KODE_LIBUR;
        return v;
      })
    }));
    if (pam && pam.nama) {
      baris.push({ nama: pam.nama.toUpperCase(), jabatan: JABATAN_PAM, kode: periode.hari.map(() => KODE_PAM) });
    }
    return baris;
  }

  // "08.00-16.00" -> "08.00 WIB – 16.00 WIB"
  function jamWib(jam) {
    const [a, b] = jam.split("-");
    return `${a} WIB – ${b} WIB`;
  }

  // Legenda kode yang benar-benar dipakai, urut seperti Master_Shift. Libur ("O") di akhir.
  function bangunLegenda(baris, shiftList, jamKerjaTeks) {
    const dipakai = new Set(baris.flatMap((b) => b.kode).filter(Boolean));
    const kiri = [];
    const kanan = [jamKerjaTeks].filter(Boolean);
    shiftList.forEach((s) => {
      if (s.jam === "-" || !dipakai.has(s.kode)) return;
      const nama = s.keterangan || s.kode;
      kiri.push(`${s.kode} : Jadwal Masuk ${nama}`);
      kanan.push(`Masuk ${nama} Pukul ${jamWib(s.jam)}`);
    });
    if (dipakai.has(KODE_LIBUR)) kiri.push(`${KODE_LIBUR} : Off/Libur`);
    return { kiri, kanan };
  }

  // Nilai bawaan kolom Master_Config untuk laporan, dipakai bila kolomnya belum ada di spreadsheet.
  const DEFAULT_CONFIG = {
    absensi_kota: "Jakarta",
    absensi_jam_kerja: "Jam Kerja 8 Jam",
    absensi_legenda: "H : hadir     L :          I : Izin     S : sakit     TK : Tanpa Keterangan     CT : Cuti",
    absensi_catatan: "",
    ob_jam_masuk: "08.00-17.00",
    ob_catatan: ""
  };

  // Config dari spreadsheet + bawaan untuk kunci yang belum ada (kunci kosong yang disengaja tetap kosong).
  function configLaporan(config) {
    const out = { ...config };
    Object.entries(DEFAULT_CONFIG).forEach(([k, v]) => {
      if (out[k] === undefined) out[k] = v;
    });
    return out;
  }

  const api = { periodeAbsensi, gabungAnggota, bangunBaris, bangunLegenda, jamWib, configLaporan, DEFAULT_CONFIG, KODE_LIBUR, KODE_PAM, NAMA_BULAN };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.absensi = api;
})(typeof window !== "undefined" ? window : globalThis);
