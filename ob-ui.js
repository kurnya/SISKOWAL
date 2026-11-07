// Tab OB: kalender bulanan untuk mencatat pengecualian. Aturan dasarnya ada di ob.js:
// hari kerja = masuk, Sabtu/Minggu/tanggal merah = libur, sisanya dicatat di sini.

const obState = {
  tahun: new Date().getFullYear(),
  bulan0: new Date().getMonth(),
  catatan: [], // catatan bulan yang sedang tampil (salinan kerja)
  siap: false, // true setelah catatan bulan ini selesai dimuat; sebelum itu penyimpanan dikunci
  kotor: false, // ada perubahan yang sedang menunggu autosave atau percobaan ulang
  dimuatSekali: false,
  menunggu: false, // tab dibuka sebelum master data selesai dimuat
  token: 0, // menandai permintaan terbaru agar hasil yang basi diabaikan
  hari: null // tanggal (ISO) yang sedang dibuka di jendela catatan
};

const obEl = {
  bulan: document.getElementById("obBulan"),
  tahun: document.getElementById("obTahun"),
  kalender: document.getElementById("obKalender"),
  wrap: document.getElementById("obKalenderWrap"),
  status: document.getElementById("obStatus"),
  dialog: document.getElementById("obDialog"),
  nama: document.getElementById("obNama"),
  jenis: document.getElementById("obJenis"),
  backup: document.getElementById("obBackup")
};

let obAutoSaveTimer = null;
let obSaveQueue = Promise.resolve();
let obRevision = 0;
const obSaveLatest = new Map();
const obSaveQueued = new Set();

bulanNama.forEach((b, i) => {
  const opt = document.createElement("option");
  opt.value = i;
  opt.textContent = b;
  obEl.bulan.appendChild(opt);
});

function obStatusMsg(teks, tipe, tampilkanToast = true) {
  obEl.status.textContent = teks;
  obEl.status.className = "status-line " + (tipe === "error" ? "status-error" : tipe === "ok" ? "status-ok" : "");
  if (tipe === "error" && tampilkanToast) tampilToast(teks, tipe);
}

const obAdaMaster = () => Boolean(masterData && Array.isArray(masterData.ob) && Array.isArray(masterData.libur));
const obPerId = () => Object.fromEntries(masterData.ob.map((o) => [o.id, o]));
const obKunciBulan = () => `${obState.tahun}-${String(obState.bulan0 + 1).padStart(2, "0")}`;
const obNamaBulan = () => `${bulanNama[obState.bulan0]} ${obState.tahun}`;
const obNamaPendek = (nama) => String(nama).split(" ")[0];

function obPesanBackendLama() {
  obStatusMsg("Kalender OB butuh Apps Script versi terbaru. Tempel Code.gs dan Logic.gs yang baru, jalankan setup() sekali, deploy versi baru, lalu muat ulang halaman.", "error");
}

// Penyimpanan hanya aktif bila catatan bulan ini sudah dimuat DAN ada perubahan. Tanpa kunci ini, menyimpan
// saat catatan belum selesai dimuat (atau gagal dimuat) akan menimpa catatan lama dengan daftar kosong.
function obSetSiap(siap) {
  obState.siap = siap;
  obEl.wrap.classList.toggle("memuat", !siap);
  obEl.wrap.setAttribute("aria-busy", String(!siap));
}

function obSnapshotSimpan() {
  return {
    bulan: obKunciBulan(),
    namaBulan: obNamaBulan(),
    revisi: ++obRevision,
    catatan: obState.catatan.map((c) => ({ ...c })),
    percobaan: 0
  };
}

function obAntrikanSimpan(snapshot) {
  const kunci = `${snapshot.bulan}:${snapshot.revisi}`;
  if (obSaveQueued.has(kunci)) return;
  obSaveQueued.add(kunci);
  obSaveQueue = obSaveQueue.catch(() => {}).then(async () => {
    const terbaru = obSaveLatest.get(snapshot.bulan);
    if (!terbaru || terbaru.revisi > snapshot.revisi) {
      obSaveQueued.delete(kunci);
      return;
    }
    try {
      await api.simpanObCatatan(snapshot.bulan, snapshot.catatan);
      if (obSaveLatest.get(snapshot.bulan)?.revisi === snapshot.revisi) obSaveLatest.delete(snapshot.bulan);
      if (obKunciBulan() === snapshot.bulan && obRevision === snapshot.revisi) {
        obState.kotor = false;
        obStatusMsg(`Catatan ${snapshot.namaBulan} tersimpan otomatis.`, "ok");
      }
    } catch (err) {
      const versiTerbaru = obSaveLatest.get(snapshot.bulan);
      if (versiTerbaru && versiTerbaru.revisi > snapshot.revisi) {
        obAntrikanSimpan(versiTerbaru);
        return;
      }
      if (versiTerbaru && obKunciBulan() === snapshot.bulan) {
        obStatusMsg(`Gagal menyimpan otomatis: ${err.message}. Perubahan tetap di layar; mencoba lagi.`, "error", false);
      }
      if (versiTerbaru) {
        versiTerbaru.percobaan += 1;
        const jeda = Math.min(30000, 1000 * 2 ** Math.min(versiTerbaru.percobaan, 5));
        setTimeout(() => obAntrikanSimpan(versiTerbaru), jeda);
      }
    } finally {
      obSaveQueued.delete(kunci);
    }
  });
}

function obTandaiKotor() {
  if (!obState.siap) return;
  obState.kotor = true;
  const snapshot = obSnapshotSimpan();
  obSaveLatest.set(snapshot.bulan, snapshot);
  clearTimeout(obAutoSaveTimer);
  obStatusMsg(`Menyimpan perubahan ${snapshot.namaBulan} otomatis...`);
  obAutoSaveTimer = setTimeout(() => obAntrikanSimpan(snapshot), 300);
}

function obFlushAutosave() {
  clearTimeout(obAutoSaveTimer);
  const snapshot = obSaveLatest.get(obKunciBulan());
  if (snapshot) obAntrikanSimpan(snapshot);
}

// ---------------------------------------------------------------- memuat & berpindah bulan
async function obMuat() {
  if (!obAdaMaster()) return;
  const token = ++obState.token;
  obSetSiap(false);
  obState.catatan = [];
  obState.kotor = false;
  obRender(); // hari libur sudah bisa terlihat selagi catatan dimuat
  obStatusMsg(`Memuat catatan ${obNamaBulan()}...`);
  try {
    const tahunLibur = String(obState.tahun);
    const dataLibur = await api.getLiburTahun(tahunLibur);
    if (token !== obState.token) return;
    masterData.libur = masterData.libur.filter((h) => !h.tanggal.startsWith(tahunLibur + "-")).concat(dataLibur.libur);
    obRender();
    const jumlahHari = new Date(obState.tahun, obState.bulan0 + 1, 0).getDate();
    const data = await api.getObCatatan(kalenderOb.iso(obState.tahun, obState.bulan0, 1), kalenderOb.iso(obState.tahun, obState.bulan0, jumlahHari));
    if (token !== obState.token) return;
    const pending = obSaveLatest.get(obKunciBulan());
    obState.catatan = pending ? pending.catatan.map((c) => ({ ...c })) : data.catatan;
    obState.kotor = Boolean(pending);
    if (pending) obAntrikanSimpan(pending);
    obSetSiap(true);
    obRender();
    obStatusMsg(pending
      ? `Melanjutkan penyimpanan otomatis ${obNamaBulan()}...`
      : data.catatan.length ? `Catatan ${obNamaBulan()} dimuat.` : `Belum ada catatan untuk ${obNamaBulan()}. Klik sebuah tanggal untuk menambah.`, "ok");
  } catch (err) {
    if (token === obState.token) {
      // Penyimpanan tetap nonaktif supaya catatan lama yang gagal dimuat tidak tertimpa.
      obStatusMsg("Gagal memuat catatan: " + err.message + ". Pilih bulan lagi untuk mencoba ulang; penyimpanan dinonaktifkan agar catatan lama tidak tertimpa.", "error");
    }
  }
}

function obGanti(tahun, bulan0) {
  obFlushAutosave();
  const d = new Date(tahun, bulan0, 1); // menangani limpahan (mis. bulan 12 -> Januari tahun berikutnya)
  obState.tahun = d.getFullYear();
  obState.bulan0 = d.getMonth();
  obMuat();
}

// Dipanggil tabs.js saat tab OB dibuka.
function obAktifkan() {
  if (!obAdaMaster()) {
    if (masterData) obPesanBackendLama();
    else {
      obState.menunggu = true;
      obStatusMsg("Memuat master data...");
    }
    return;
  }
  if (!obState.dimuatSekali) {
    obState.dimuatSekali = true;
    obMuat();
  }
}

// Dipanggil app.js setiap master selesai dimuat (juga setelah menyimpan Pengaturan).
function obSetelahMasterDimuat() {
  if (!obAdaMaster()) {
    if (obState.menunggu) obPesanBackendLama();
    return;
  }
  if (obState.menunggu) {
    obState.menunggu = false;
    obState.dimuatSekali = true;
    obMuat();
  } else if (obState.dimuatSekali) {
    obRender();
  }
}

// ---------------------------------------------------------------- tampilan kalender
function obRender() {
  obEl.bulan.value = obState.bulan0;
  obEl.tahun.value = obState.tahun;
  if (!obAdaMaster()) {
    obEl.kalender.innerHTML = "";
    return;
  }
  const peta = kalenderOb.catatanPerTanggal(obState.catatan);
  const perId = obPerId();
  const hariIni = hariIniIso();

  obEl.kalender.innerHTML = kalenderOb
    .selKalender(obState.tahun, obState.bulan0)
    .map((sel) => {
      if (!sel) return '<div class="cal-kosong"></div>';
      const st = kalenderOb.statusHari(sel.iso, masterData.libur);
      const dow = kalenderOb.hariKe(sel.iso);
      const catatan = peta[sel.iso] || [];
      const bukanNamaHari = st.libur && st.alasan !== "Sabtu" && st.alasan !== "Minggu";
      const kelas = ["cal-day", st.libur ? "libur" : "", dow === 6 ? "sabtu" : "", sel.iso === hariIni ? "hari-ini" : ""].join(" ");
      const chips = catatan
        .map((c) => {
          const nama = obNamaPendek((perId[c.idOb] || { nama: "?" }).nama);
          const kode = c.jenis === "LEMBUR" ? "Lembur" : c.jenis;
          const backup = c.idBackup && perId[c.idBackup] ? `<span class="chip chip-backup">Backup ${escapeHtml(obNamaPendek(perId[c.idBackup].nama))}</span>` : "";
          return `<span class="chip chip-${c.jenis}">${escapeHtml(kode)} ${escapeHtml(nama)}</span>${backup}`;
        })
        .join("");
      const label =
        `${kalenderOb.NAMA_HARI[dow]} ${sel.tgl} ${bulanNama[obState.bulan0]} ${obState.tahun}` +
        (st.libur ? `, libur: ${st.alasan}` : "") +
        (st.info ? `, ${st.info}` : "") +
        (catatan.length ? `, ${catatan.length} catatan` : "");
      return `
        <button type="button" class="${kelas}" data-iso="${sel.iso}" aria-label="${escapeHtml(label)}">
          <span class="cal-num">${sel.tgl}</span>
          ${bukanNamaHari ? `<span class="cal-ket">${escapeHtml(st.alasan)}</span>` : ""}
          ${st.info ? `<span class="cal-info">${escapeHtml(st.info)}</span>` : ""}
          ${chips}
        </button>`;
    })
    .join("");
}

// ---------------------------------------------------------------- jendela catatan satu tanggal
function obHariAktif(iso) {
  return masterData.ob.filter((o) => kalenderOb.aktifPada(o, iso));
}

function obCatatanTanggal(iso) {
  return obState.catatan.filter((c) => c.tanggal === iso);
}

function obIsiSelect(select, pilihan, terpilih) {
  select.innerHTML = pilihan.map((p) => `<option value="${escapeHtml(p.v)}">${escapeHtml(p.t)}</option>`).join("");
  select.value = pilihan.some((p) => p.v === terpilih) ? terpilih : pilihan[0].v;
}

function obBukaDialog(iso) {
  if (!obState.siap) return; // catatan belum selesai dimuat: jangan biarkan mengedit
  obState.hari = iso;
  const [y, m, d] = iso.split("-").map(Number);
  const st = kalenderOb.statusHari(iso, masterData.libur);
  document.getElementById("obDialogJudul").textContent = `${kalenderOb.NAMA_HARI[kalenderOb.hariKe(iso)]}, ${d} ${bulanNama[m - 1]} ${y}`;
  document.getElementById("obDialogStatus").textContent = st.libur
    ? `Libur (${st.alasan}). OB libur kecuali ada yang lembur.`
    : "Hari kerja. OB masuk kecuali ada catatan." +
      (st.info ? ` Info: ${st.info}, bukan libur otomatis. Catat Cuti atau Libur bila perusahaan meliburkan.` : "");
  obIsiDialog();
  obEl.dialog.classList.remove("hidden");
  obEl.dialog.classList.add("flex");
  obEl.nama.focus();
}

function obTutupDialog() {
  obEl.dialog.classList.add("hidden");
  obEl.dialog.classList.remove("flex");
  obState.hari = null;
}

function obSelesaiDialog() {
  // Bila form masih terisi, terapkan langsung sebelum dialog ditutup.
  if (obEl.nama.value && !obTambahCatatan()) return;
  obTutupDialog();
}

function obIsiDialog() {
  const iso = obState.hari;
  const st = kalenderOb.statusHari(iso, masterData.libur);
  const perId = obPerId();
  const catatan = obCatatanTanggal(iso);

  // daftar catatan yang sudah ada
  document.getElementById("obCatatanHari").innerHTML = catatan.length
    ? catatan
        .map(
          (c) => `
        <li class="catatan-item">
          <span>${escapeHtml(kalenderOb.labelCatatan(c, perId))}</span>
          <button type="button" class="row-btn row-btn-del" data-hapus="${escapeHtml(c.idOb)}" aria-label="Hapus catatan ${escapeHtml((perId[c.idOb] || { nama: "" }).nama)}">✕</button>
        </li>`
        )
        .join("")
    : '<li class="muted-copy text-sm">Belum ada catatan.</li>';

  // pilihan nama: OB yang bertugas pada tanggal ini dan belum punya catatan
  const sudah = new Set(catatan.map((c) => c.idOb));
  const tersedia = obHariAktif(iso).filter((o) => !sudah.has(o.id));
  const pilihanNama = [{ v: "", t: tersedia.length ? "Pilih nama..." : "Semua OB sudah punya catatan" }].concat(
    tersedia.map((o) => ({ v: o.id, t: o.nama + (o.jabatan === "BACKUP" ? " (backup)" : "") }))
  );
  if (tersedia.filter((o) => o.jabatan !== "BACKUP").length > 1) pilihanNama.push({ v: "*", t: "Semua anggota" });
  obIsiSelect(obEl.nama, pilihanNama, "");

  // bentuk formulir tergantung jenis hari
  document.getElementById("obFormJudul").textContent = st.libur ? "Tambah catatan lembur" : "Tambah catatan";
  document.getElementById("obNamaLabel").textContent = st.libur ? "Siapa yang lembur?" : "Nama OB";
  document.getElementById("obJenisWrap").classList.toggle("hidden", st.libur);
  if (!st.libur) {
    const cutiBersama = st.jenisInfo === "Cuti Bersama";
    obIsiSelect(obEl.jenis, kalenderOb.JENIS_HARI_KERJA.map((j) => ({ v: j, t: kalenderOb.NAMA_JENIS[j] })), cutiBersama ? "CB" : "S");
  }
  // Tombol pintas hanya di tanggal cuti bersama (hari kerja yang tercatat sebagai cuti bersama di Hari Libur).
  const tawarkan = !st.libur && st.jenisInfo === "Cuti Bersama";
  document.getElementById("obCutiBersamaWrap").classList.toggle("hidden", !tawarkan);
  if (tawarkan) document.getElementById("obCutiBersamaKet").textContent = st.info;
  obIsiBackup();
  document.getElementById("obFormPesan").textContent = "";
}

// Backup hanya relevan untuk Sakit/Izin/TK/Cuti pada satu OB tertentu.
function obIsiBackup() {
  const iso = obState.hari;
  const st = kalenderOb.statusHari(iso, masterData.libur);
  const relevan = !st.libur && kalenderOb.JENIS_ABSEN.includes(obEl.jenis.value) && obEl.nama.value !== "*" && obEl.nama.value !== "";
  document.getElementById("obBackupWrap").classList.toggle("hidden", !relevan);
  if (!relevan) return;
  const pilihan = [{ v: "", t: "Tanpa backup" }].concat(
    obHariAktif(iso)
      .filter((o) => o.id !== obEl.nama.value)
      .map((o) => ({ v: o.id, t: o.nama + (o.jabatan === "BACKUP" ? " (backup)" : "") }))
  );
  obIsiSelect(obEl.backup, pilihan, obEl.backup.value);
}

function obTambahCatatan() {
  const iso = obState.hari;
  const pesan = document.getElementById("obFormPesan");
  const st = kalenderOb.statusHari(iso, masterData.libur);
  const pilihNama = obEl.nama.value;
  if (!pilihNama) {
    pesan.textContent = "Pilih nama OB dulu.";
    return false;
  }
  const jenis = st.libur ? "LEMBUR" : obEl.jenis.value;
  const sudah = new Set(obCatatanTanggal(iso).map((c) => c.idOb));
  const ids = pilihNama === "*" ? obHariAktif(iso).filter((o) => o.jabatan !== "BACKUP" && !sudah.has(o.id)).map((o) => o.id) : [pilihNama];
  if (!ids.length) {
    pesan.textContent = "Semua anggota sudah punya catatan pada tanggal ini.";
    return false;
  }
  const backup = pilihNama !== "*" && kalenderOb.JENIS_ABSEN.includes(jenis) ? obEl.backup.value : "";

  ids.forEach((id) => obState.catatan.push({ tanggal: iso, idOb: id, jenis, idBackup: backup }));
  obTandaiKotor();
  obRender();
  obIsiDialog();
  obStatusMsg("Catatan ditambahkan dan sedang disimpan otomatis.");
  return true;
}

// Menerapkan cuti bersama (dihitung O) ke semua anggota yang bertugas dan belum punya catatan pada tanggal ini.
function obCutiBersamaSemua() {
  const iso = obState.hari;
  const sudah = new Set(obCatatanTanggal(iso).map((c) => c.idOb));
  const ids = obHariAktif(iso).filter((o) => o.jabatan !== "BACKUP" && !sudah.has(o.id)).map((o) => o.id);
  if (!ids.length) {
    document.getElementById("obFormPesan").textContent = "Semua anggota sudah punya catatan pada tanggal ini.";
    return;
  }
  ids.forEach((id) => obState.catatan.push({ tanggal: iso, idOb: id, jenis: "CB", idBackup: "" }));
  obTandaiKotor();
  obRender();
  obIsiDialog();
  obStatusMsg(`Cuti bersama diterapkan ke ${ids.length} anggota dan sedang disimpan otomatis.`);
}

function obHapusCatatan(idOb) {
  const i = obState.catatan.findIndex((c) => c.tanggal === obState.hari && c.idOb === idOb);
  if (i < 0) return;
  obState.catatan.splice(i, 1);
  obTandaiKotor();
  obRender();
  obIsiDialog();
  obStatusMsg("Catatan dihapus dan perubahan sedang disimpan otomatis.");
}

// ---------------------------------------------------------------- menyimpan
// ---------------------------------------------------------------- pendengar
obEl.kalender.addEventListener("click", (e) => {
  const sel = e.target.closest(".cal-day");
  if (sel) obBukaDialog(sel.dataset.iso);
});
document.getElementById("obCatatanHari").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-hapus]");
  if (btn) obHapusCatatan(btn.dataset.hapus);
});
obEl.dialog.addEventListener("change", (e) => {
  if (e.target === obEl.nama || e.target === obEl.jenis) obIsiBackup();
});
document.getElementById("obTambah").addEventListener("click", obTambahCatatan);
document.getElementById("obSelesai").addEventListener("click", obSelesaiDialog);
obEl.bulan.addEventListener("change", () => obGanti(obState.tahun, parseInt(obEl.bulan.value)));
obEl.tahun.addEventListener("change", () => {
  const t = parseInt(obEl.tahun.value);
  if (t >= 2000 && t <= 2100) obGanti(t, obState.bulan0);
  else obRender();
});
document.getElementById("obPrev").addEventListener("click", () => obGanti(obState.tahun, obState.bulan0 - 1));
document.getElementById("obNext").addEventListener("click", () => obGanti(obState.tahun, obState.bulan0 + 1));
document.getElementById("obHariIni").addEventListener("click", () => {
  const now = new Date();
  obGanti(now.getFullYear(), now.getMonth());
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && obState.hari) obTutupDialog();
});

// Peringatan jika halaman ditutup sebelum autosave selesai.
window.addEventListener("beforeunload", (e) => {
  if (obState.kotor || obSaveLatest.size) {
    e.preventDefault();
    e.returnValue = "";
  }
});

obRender();
