// Tab OB: kalender bulanan untuk mencatat pengecualian. Aturan dasarnya ada di ob.js:
// hari kerja = masuk, Sabtu/Minggu/tanggal merah = libur, sisanya dicatat di sini.

const obState = {
  tahun: new Date().getFullYear(),
  bulan0: new Date().getMonth(),
  catatan: [], // catatan bulan yang sedang tampil (salinan kerja)
  siap: false, // true setelah catatan bulan ini selesai dimuat; sebelum itu penyimpanan dikunci
  kotor: false, // ada perubahan yang belum disimpan
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
  simpan: document.getElementById("obSimpan"),
  kotor: document.getElementById("obKotor"),
  status: document.getElementById("obStatus"),
  dialog: document.getElementById("obDialog"),
  nama: document.getElementById("obNama"),
  jenis: document.getElementById("obJenis"),
  backup: document.getElementById("obBackup")
};

bulanNama.forEach((b, i) => {
  const opt = document.createElement("option");
  opt.value = i;
  opt.textContent = b;
  obEl.bulan.appendChild(opt);
});

function obStatusMsg(teks, tipe) {
  obEl.status.textContent = teks;
  obEl.status.className = "status-line " + (tipe === "error" ? "status-error" : tipe === "ok" ? "status-ok" : "");
  if (tipe === "error") tampilToast(teks, tipe);
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
  obPerbaruiTombol();
}

function obPerbaruiTombol() {
  obEl.simpan.disabled = !(obState.siap && obState.kotor);
  obEl.kotor.classList.toggle("hidden", !obState.kotor);
}

function obTandaiKotor() {
  obState.kotor = true;
  obPerbaruiTombol();
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
    const jumlahHari = new Date(obState.tahun, obState.bulan0 + 1, 0).getDate();
    const data = await api.getObCatatan(kalenderOb.iso(obState.tahun, obState.bulan0, 1), kalenderOb.iso(obState.tahun, obState.bulan0, jumlahHari));
    if (token !== obState.token) return;
    obState.catatan = data.catatan;
    obSetSiap(true);
    obRender();
    obStatusMsg(data.catatan.length ? `Catatan ${obNamaBulan()} dimuat.` : `Belum ada catatan untuk ${obNamaBulan()}. Klik sebuah tanggal untuk menambah.`, "ok");
  } catch (err) {
    if (token === obState.token) {
      // Penyimpanan tetap nonaktif supaya catatan lama yang gagal dimuat tidak tertimpa.
      obStatusMsg("Gagal memuat catatan: " + err.message + ". Pilih bulan lagi untuk mencoba ulang; penyimpanan dinonaktifkan agar catatan lama tidak tertimpa.", "error");
    }
  }
}

function obGanti(tahun, bulan0) {
  if (obState.kotor && !confirm(`Catatan ${obNamaBulan()} belum disimpan. Pindah bulan dan buang perubahan itu?`)) {
    obRender(); // kembalikan pilihan bulan/tahun ke bulan yang tampil
    return;
  }
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
    obIsiSelect(obEl.jenis, kalenderOb.JENIS_HARI_KERJA.map((j) => ({ v: j, t: kalenderOb.NAMA_JENIS[j] })), "S");
  }
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
    return;
  }
  const jenis = st.libur ? "LEMBUR" : obEl.jenis.value;
  const sudah = new Set(obCatatanTanggal(iso).map((c) => c.idOb));
  const ids = pilihNama === "*" ? obHariAktif(iso).filter((o) => o.jabatan !== "BACKUP" && !sudah.has(o.id)).map((o) => o.id) : [pilihNama];
  const backup = pilihNama !== "*" && kalenderOb.JENIS_ABSEN.includes(jenis) ? obEl.backup.value : "";

  ids.forEach((id) => obState.catatan.push({ tanggal: iso, idOb: id, jenis, idBackup: backup }));
  obTandaiKotor();
  obRender();
  obIsiDialog();
  obStatusMsg("Catatan ditambahkan. Jangan lupa menekan Simpan catatan bulan ini.");
}

function obHapusCatatan(idOb) {
  const i = obState.catatan.findIndex((c) => c.tanggal === obState.hari && c.idOb === idOb);
  if (i < 0) return;
  obState.catatan.splice(i, 1);
  obTandaiKotor();
  obRender();
  obIsiDialog();
}

// ---------------------------------------------------------------- menyimpan
async function obSimpan() {
  if (!obState.siap) {
    obStatusMsg("Catatan bulan ini belum selesai dimuat, jadi belum bisa disimpan.", "error");
    return;
  }
  const bulan = obKunciBulan();
  const btn = obEl.simpan;
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Menyimpan...';
  obStatusMsg(`Menyimpan catatan ${obNamaBulan()}...`);
  try {
    await api.simpanObCatatan(bulan, obState.catatan);
    obState.kotor = false;
    obStatusMsg(`Catatan ${obNamaBulan()} tersimpan di spreadsheet.`, "ok");
    tampilToast(`Catatan ${obNamaBulan()} tersimpan.`, "ok");
  } catch (err) {
    obStatusMsg("Gagal menyimpan (catatan di layar tetap aman): " + err.message, "error");
  } finally {
    btn.innerHTML = original;
    obPerbaruiTombol();
    lucide.createIcons();
  }
}

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
obEl.simpan.addEventListener("click", obSimpan);

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

// Peringatan bila menutup halaman saat ada catatan yang belum disimpan.
window.addEventListener("beforeunload", (e) => {
  if (obState.kotor) {
    e.preventDefault();
    e.returnValue = "";
  }
});

obRender();
