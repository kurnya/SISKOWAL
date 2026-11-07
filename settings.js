// Layar Pengaturan: ubah petugas security, kode shift, OB, hari libur, dan data umum/PAM langsung dari web.
// Perubahan dikerjakan pada salinan (draft) dan baru dikirim saat "Simpan Pengaturan".

let draft = null;
let tabAktif = "petugas";
let liburTahun = "semua"; // filter tahun di tab Hari Libur
const JENIS_LIBUR_URUT = ["Nasional", "Cuti Bersama", "Lainnya"];

function settingsMsg(teks, tipe) {
  const el = document.getElementById("settingsStatus");
  el.textContent = teks;
  el.className = "text-sm " + (tipe === "error" ? "text-red-600" : tipe === "ok" ? "text-green-600" : "muted-copy");
}

function hariIniIso() {
  const d = new Date();
  return kalenderOb.iso(d.getFullYear(), d.getMonth(), d.getDate());
}

function bukaPengaturan() {
  if (!masterData || !masterData.petugasSemua) {
    setStatus("Apps Script belum diperbarui: tempel Code.gs & Logic.gs terbaru lalu deploy versi baru.", "error");
    return;
  }
  draft = {
    petugas: masterData.petugasSemua.map((p) => ({ nama: p.nama, aktif: p.aktif })),
    shift: masterData.shift.map((s) => ({ kode: s.kode, jam: s.jam, keterangan: s.keterangan })),
    config: {
      perusahaan: masterConfig.perusahaan || "",
      alamat: masterConfig.alamat || "",
      kontak: masterConfig.kontak || "",
      lokasi: masterConfig.lokasi || "",
      keterangan_00_05: masterConfig.keterangan_00_05 || "",
      pam_aktif: pamAktif(),
      ...Object.fromEntries(
        Object.keys(absensi.DEFAULT_CONFIG).map((k) => [k, absensi.configLaporan(masterConfig)[k]])
      )
    }
  };
  // OB dan hari libur hanya ada bila Apps Script sudah versi terbaru. Bila tidak, tidak dikirim (sheet dibiarkan).
  if (Array.isArray(masterData.ob)) draft.ob = masterData.ob.map((o) => ({ ...o }));
  if (Array.isArray(masterData.libur)) draft.libur = masterData.libur.map((h) => ({ ...h }));

  const tahunIni = String(new Date().getFullYear());
  liburTahun = (draft.libur || []).some((h) => h.tanggal.startsWith(tahunIni)) ? tahunIni : "semua";

  settingsMsg("");
  pilihTab("petugas");
  const modal = document.getElementById("settingsModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.querySelector("#settingsModal .settings-tab").focus();
}

function tutupPengaturan() {
  const modal = document.getElementById("settingsModal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  draft = null;
}

function pilihTab(nama) {
  tabAktif = nama;
  document.querySelectorAll("#settingsModal .settings-tab").forEach((b) => {
    const aktif = b.dataset.tab === nama;
    b.classList.toggle("active", aktif);
    b.setAttribute("aria-selected", aktif);
  });
  renderTab();
}

function tombolBaris(i, total, bisaHapus) {
  return `
    <button type="button" class="row-btn" data-action="up" data-i="${i}" aria-label="Naikkan" ${i === 0 ? "disabled" : ""}>↑</button>
    <button type="button" class="row-btn" data-action="down" data-i="${i}" aria-label="Turunkan" ${i === total - 1 ? "disabled" : ""}>↓</button>
    ${bisaHapus ? `<button type="button" class="row-btn row-btn-del" data-action="hapus" data-i="${i}" aria-label="Hapus">✕</button>` : `<span class="row-btn-spacer"></span>`}`;
}

const PESAN_BACKEND_LAMA =
  '<p class="text-sm text-red-600">Bagian ini butuh Apps Script versi terbaru. Tempel <b>Code.gs</b> dan <b>Logic.gs</b> yang baru, jalankan <b>setup</b> sekali, lalu deploy versi baru dan muat ulang halaman.</p>';

function renderOB(body) {
  if (!draft.ob) {
    body.innerHTML = PESAN_BACKEND_LAMA;
    return;
  }
  const hariIni = hariIniIso();
  body.innerHTML = `
    <p class="text-sm muted-copy mb-3">Daftar OB untuk kalender dan laporan. OB yang sudah tersimpan <b>tidak dihapus</b>: bila sudah berhenti, klik <b>Berhenti</b> (mengisi tanggal Selesai) agar laporan periode lama tetap memuatnya. Mengganti nama berarti orang yang sama; untuk orang baru, tambahkan baris baru.</p>
    <div class="settings-list">
      ${draft.ob.map((o, i) => {
        const berhenti = o.selesai && o.selesai < hariIni;
        const belumMulai = o.mulai && o.mulai > hariIni;
        const status = berhenti ? "Sudah berhenti" : belumMulai ? "Belum mulai" : "";
        return `
        <div class="settings-row settings-row-ob">
          <input type="text" class="ob-nama" data-field="nama" data-i="${i}" value="${escapeHtml(o.nama)}" maxlength="100" placeholder="Nama OB" aria-label="Nama OB" />
          <button type="button" class="pill ${o.jabatan === "BACKUP" ? "pill-backup" : ""}" data-action="jabatan" data-i="${i}" title="Klik untuk mengganti jabatan">${o.jabatan === "BACKUP" ? "Backup" : "Anggota"}</button>
          <label class="ob-tgl"><span>Mulai</span><input type="date" data-field="mulai" data-i="${i}" value="${escapeHtml(o.mulai || "")}" /></label>
          <label class="ob-tgl"><span>Selesai</span><input type="date" data-field="selesai" data-i="${i}" value="${escapeHtml(o.selesai || "")}" /></label>
          <div class="ob-aksi">
            ${tombolBaris(i, draft.ob.length, !o.id)}
            ${o.id ? (o.selesai
              ? `<button type="button" class="btn-secondary btn-compact" data-action="aktifkan" data-i="${i}">Aktifkan lagi</button>`
              : `<button type="button" class="btn-secondary btn-compact" data-action="berhenti" data-i="${i}">Berhenti</button>`) : ""}
          </div>
          ${status ? `<span class="ob-status">${status}</span>` : ""}
        </div>`;
      }).join("")}
    </div>
    <button type="button" class="btn-secondary px-4 py-2 mt-3" data-action="tambah">+ Tambah OB</button>`;
}

function renderLibur(body) {
  if (!draft.libur) {
    body.innerHTML = PESAN_BACKEND_LAMA;
    return;
  }
  const tahun = [...new Set(draft.libur.map((h) => h.tanggal.slice(0, 4)).filter(Boolean))].sort();
  const chip = (nilai, label) =>
    `<button type="button" class="pill ${liburTahun === nilai ? "pill-aktif" : ""}" data-action="tahun" data-tahun="${nilai}">${label}</button>`;
  const baris = draft.libur
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => liburTahun === "semua" || !h.tanggal || h.tanggal.startsWith(liburTahun));
  body.innerHTML = `
    <p class="text-sm muted-copy mb-3">Hanya <b>Sabtu, Minggu, dan baris dengan centang "Otomatis libur"</b> yang dianggap libur di kalender OB. Libur nasional sudah dicentang; <b>cuti bersama tidak</b> (kebijakan tiap perusahaan), jadi hanya tampil sebagai pengingat dan hari itu tetap masuk kecuali dicatat. Centang bila perusahaan meliburkannya. Tambahkan hari libur tahun berikutnya di sini.</p>
    <div class="pill-group mb-3" role="group" aria-label="Filter tahun">
      ${tahun.map((t) => chip(t, t)).join("")}${chip("semua", "Semua")}
    </div>
    <div class="settings-list">
      ${baris.length ? baris.map(({ h, i }) => `
        <div class="settings-row settings-row-libur">
          <input type="date" data-field="tanggal" data-i="${i}" value="${escapeHtml(h.tanggal)}" aria-label="Tanggal" />
          <input type="text" class="libur-ket" data-field="keterangan" data-i="${i}" value="${escapeHtml(h.keterangan)}" maxlength="100" placeholder="Keterangan" aria-label="Keterangan" />
          <button type="button" class="pill pill-${h.jenis === "Nasional" ? "nasional" : h.jenis === "Cuti Bersama" ? "cuti" : "lain"}" data-action="jenis" data-i="${i}" title="Klik untuk mengganti jenis">${escapeHtml(h.jenis)}</button>
          <label class="settings-check-lg libur-centang"><input type="checkbox" data-field="libur" data-i="${i}" ${h.libur ? "checked" : ""} /><span class="text-sm">Otomatis libur</span></label>
          <button type="button" class="row-btn row-btn-del" data-action="hapus" data-i="${i}" aria-label="Hapus">✕</button>
        </div>`).join("") : '<p class="text-sm muted-copy">Belum ada hari libur untuk tahun ini.</p>'}
    </div>
    <button type="button" class="btn-secondary px-4 py-2 mt-3" data-action="tambah">+ Tambah hari libur</button>`;
}

function renderTab() {
  const body = document.getElementById("settingsBody");

  if (tabAktif === "petugas") {
    body.innerHTML = `
      <p class="text-sm muted-copy mb-3">Petugas <b>aktif</b> muncul di tabel jadwal. Petugas non aktif disembunyikan tanpa menghapus datanya. Urutan di sini menjadi urutan di tabel.</p>
      <div class="settings-list">
        ${draft.petugas.map((p, i) => `
          <div class="settings-row">
            <label class="settings-check" title="Aktif">
              <input type="checkbox" data-field="aktif" data-i="${i}" ${p.aktif ? "checked" : ""} aria-label="Aktif" />
            </label>
            <input type="text" data-field="nama" data-i="${i}" value="${escapeHtml(p.nama)}" maxlength="100" placeholder="Nama petugas" aria-label="Nama petugas" />
            ${tombolBaris(i, draft.petugas.length, true)}
          </div>`).join("")}
      </div>
      <button type="button" class="btn-secondary px-4 py-2 mt-3" data-action="tambah">+ Tambah petugas</button>`;
  }

  if (tabAktif === "shift") {
    const kolom = columns.deriveJamColumns(draft.shift);
    body.innerHTML = `
      <p class="text-sm muted-copy mb-3">Jam berformat <b>HH.MM-HH.MM</b> (contoh 08.00-16.00). Setiap jam yang berbeda menjadi satu kolom di tabel hasil dan PDF, urut menurut kemunculan pertama di daftar ini. Kode <b>X</b> (libur) wajib ada.</p>
      <div class="settings-list">
        ${draft.shift.map((s, i) => {
          const libur = s.kode.trim().toUpperCase() === "X";
          return `
          <div class="settings-row">
            <input type="text" class="w-kode" data-field="kode" data-i="${i}" value="${escapeHtml(s.kode)}" maxlength="3" placeholder="Kode" aria-label="Kode" ${libur ? "readonly" : ""} />
            <input type="text" class="w-jam" data-field="jam" data-i="${i}" value="${escapeHtml(s.jam)}" maxlength="11" placeholder="08.00-16.00" aria-label="Jam" ${libur ? "readonly" : ""} />
            <input type="text" data-field="keterangan" data-i="${i}" value="${escapeHtml(s.keterangan)}" maxlength="100" placeholder="Keterangan" aria-label="Keterangan" />
            ${tombolBaris(i, draft.shift.length, !libur)}
          </div>`;
        }).join("")}
      </div>
      <button type="button" class="btn-secondary px-4 py-2 mt-3" data-action="tambah">+ Tambah kode shift</button>
      <p id="kolomInfo" class="text-sm muted-copy mt-3"></p>`;
    infoKolom(kolom);
  }

  if (tabAktif === "ob") renderOB(body);
  if (tabAktif === "libur") renderLibur(body);

  if (tabAktif === "umum") {
    const c = draft.config;
    const f = (key, label) => `
      <label class="field-label" for="cfg_${key}">${label}</label>
      <input type="text" id="cfg_${key}" data-cfg="${key}" value="${escapeHtml(c[key])}" maxlength="300" class="mb-3" />`;
    const area = (key, label) => `
      <label class="field-label" for="cfg_${key}">${label}</label>
      <textarea id="cfg_${key}" data-cfg="${key}" rows="3" maxlength="300" class="settings-textarea mb-3">${escapeHtml(c[key])}</textarea>`;
    body.innerHTML = `
      ${f("perusahaan", "Nama perusahaan")}
      ${f("alamat", "Alamat")}
      ${f("kontak", "Kontak")}
      ${f("lokasi", "Lokasi")}
      <div class="hint-box px-4 py-4 mt-2">
        <label class="settings-check-lg">
          <input type="checkbox" id="cfg_pam_aktif" data-cfg-bool="pam_aktif" ${c.pam_aktif ? "checked" : ""} />
          <span><b>Kolom PAM aktif</b><br><span class="text-sm muted-copy">Bila aktif, kolom 00.00-05.00 dan nama PAM tampil di tabel hasil dan PDF. Bila non aktif, kolom itu disembunyikan.</span></span>
        </label>
        <div class="mt-3">
          ${f("keterangan_00_05", "Nama PAM")}
        </div>
      </div>

      <div class="section-title mt-6 mb-1">Laporan Absensi</div>
      <p class="text-sm muted-copy mb-3">Teks yang tercetak di PDF laporan absensi (security dan OB). Nama PAM di atas juga dipakai pada baris PAM. Nama dan tanda tangan penanda tangan ada pada gambar assets/ttd-blok.png.</p>
      ${f("absensi_kota", "Kota (tanggal tanda tangan)")}
      ${f("absensi_jam_kerja", "Teks jam kerja (legenda)")}
      ${f("absensi_legenda", "Legenda keterangan (H, L, I, S, TK, CT)")}
      ${area("absensi_catatan", "Catatan laporan security (kotak NOTE)")}

      <div class="section-title mt-6 mb-1">Laporan OB</div>
      ${f("ob_jam_masuk", "Jam masuk OB (HH.MM-HH.MM)")}
      ${area("ob_catatan", "Catatan laporan OB (kotak NOTE)")}`;
  }
}

function infoKolom(kolom) {
  const el = document.getElementById("kolomInfo");
  if (!el) return;
  const total = 2 + kolom.length + (draft.config.pam_aktif ? 1 : 0);
  el.textContent = `Kolom jam di hasil: ${kolom.length ? kolom.join(", ") : "(belum ada)"}.` +
    (total > 10 ? " Peringatan: lebih dari 10 kolom akan sangat sempit di PDF A4." : "");
}

// Daftar yang sedang diedit pada tab aktif.
function daftarAktif() {
  return draft[tabAktif];
}

const BARIS_BARU = {
  petugas: () => ({ nama: "", aktif: true }),
  shift: () => ({ kode: "", jam: "", keterangan: "" }),
  ob: () => ({ id: "", nama: "", jabatan: "ANGGOTA", mulai: "", selesai: "" }),
  libur: () => ({ tanggal: "", keterangan: "", jenis: "Lainnya", libur: true })
};

// Satu pendengar untuk semua kontrol di dalam layar pengaturan.
document.getElementById("settingsBody").addEventListener("input", (e) => {
  const t = e.target;
  if (!draft) return;
  if (t.dataset.cfg) draft.config[t.dataset.cfg] = t.value;
  if (t.dataset.cfgBool) draft.config[t.dataset.cfgBool] = t.checked;
  if (t.dataset.field) {
    const item = daftarAktif()[Number(t.dataset.i)];
    item[t.dataset.field] = t.type === "checkbox" ? t.checked : t.value;
    if (tabAktif === "shift") infoKolom(columns.deriveJamColumns(draft.shift));
  }
});

document.getElementById("settingsBody").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn || !draft) return;
  const aksi = btn.dataset.action;
  const list = daftarAktif();
  const i = Number(btn.dataset.i);

  if (aksi === "tambah") {
    list.push(BARIS_BARU[tabAktif]());
    if (tabAktif === "libur") liburTahun = "semua"; // baris baru tanpa tanggal tetap terlihat
  } else if (aksi === "hapus") {
    list.splice(i, 1);
  } else if (aksi === "up" && i > 0) {
    [list[i - 1], list[i]] = [list[i], list[i - 1]];
  } else if (aksi === "down" && i < list.length - 1) {
    [list[i + 1], list[i]] = [list[i], list[i + 1]];
  } else if (aksi === "jabatan") {
    list[i].jabatan = list[i].jabatan === "BACKUP" ? "ANGGOTA" : "BACKUP";
  } else if (aksi === "berhenti") {
    list[i].selesai = hariIniIso(); // hari terakhir bertugas = hari ini
  } else if (aksi === "aktifkan") {
    list[i].selesai = "";
  } else if (aksi === "jenis") {
    const sekarang = JENIS_LIBUR_URUT.indexOf(list[i].jenis);
    list[i].jenis = JENIS_LIBUR_URUT[(sekarang + 1) % JENIS_LIBUR_URUT.length];
  } else if (aksi === "tahun") {
    liburTahun = btn.dataset.tahun;
  }
  renderTab();
  // Baris baru: langsung fokus ke kolom pertamanya.
  if (aksi === "tambah") {
    const rows = document.querySelectorAll("#settingsBody .settings-row");
    const last = rows[rows.length - 1];
    if (last) last.querySelector("input").focus();
  }
});

document.querySelectorAll("#settingsModal .settings-tab").forEach((b) => {
  b.addEventListener("click", () => pilihTab(b.dataset.tab));
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && draft) tutupPengaturan();
});

async function simpanPengaturan() {
  const btn = document.getElementById("settingsSaveBtn");
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Menyimpan...';
  settingsMsg("Menyimpan pengaturan...");
  try {
    await api.simpanMaster(draft);
  } catch (err) {
    settingsMsg("Gagal menyimpan: " + err.message, "error");
    btn.disabled = false;
    btn.innerHTML = original;
    return;
  }
  btn.disabled = false;
  btn.innerHTML = original;
  tutupPengaturan();
  await muatMaster();

  const tabelTampil = !document.getElementById("inputContainer").classList.contains("hidden");
  if (tabelTampil && namaList.length) {
    const ulang = confirm(
      "Pengaturan tersimpan. Tabel input perlu dibuat ulang agar sesuai pengaturan baru.\n\n" +
      "Isian yang belum disimpan ke spreadsheet akan hilang. Buat ulang sekarang?"
    );
    if (ulang) await generateTabel();
    else setStatus("Pengaturan tersimpan. Klik Buat Tabel untuk memakai pengaturan baru.", "ok");
  } else {
    setStatus("Pengaturan tersimpan.", "ok");
  }
}
