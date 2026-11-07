// Panel "Laporan Absensi": periode 16 bulan lalu s.d. 15 bulan dipilih.
//  - Security: dari jadwal bulanan yang sudah tersimpan.
//  - OB: dibentuk dari kalender OB (aturan hari kerja/libur + catatan) dan masa tugas tiap OB.
// Tidak memakai tabel input di atas, jadi tidak ikut terpengaruh isian yang belum disimpan.

const absBulan = document.getElementById("absBulan");
const absTahun = document.getElementById("absTahun");
let absState = null; // { periode, prev, cur, anggota } setelah "Muat Anggota"
let absToken = 0; // menandai permintaan terbaru agar hasil yang basi diabaikan
let absJenis = "security"; // "security" | "ob"

const SUBJUDUL_ABSENSI = {
  security: "Periode dari tanggal 16 bulan sebelumnya sampai tanggal 15 bulan yang dipilih. Datanya diambil dari jadwal yang sudah tersimpan.",
  ob: "Periode dari tanggal 16 bulan sebelumnya sampai tanggal 15 bulan yang dipilih. Datanya dibentuk dari kalender OB: hari kerja masuk, Sabtu, Minggu, dan tanggal merah libur, ditambah catatan."
};

bulanNama.forEach((b, i) => {
  const opt = document.createElement("option");
  opt.value = i;
  opt.textContent = b;
  absBulan.appendChild(opt);
});

function absSetStatus(teks, tipe) {
  const el = document.getElementById("absStatus");
  el.textContent = teks;
  el.className = "status-line " + (tipe === "error" ? "status-error" : tipe === "ok" ? "status-ok" : "");
  if (tipe === "error") tampilToast(teks, tipe);
}

function absPeriodeTerpilih() {
  const tahun = parseInt(absTahun.value);
  if (!tahun) return null;
  return absensi.periodeAbsensi(tahun, parseInt(absBulan.value));
}

function absTampilkanPeriode() {
  const p = absPeriodeTerpilih();
  document.getElementById("absPeriode").textContent = p ? `Periode: ${p.mulaiLabel} s.d ${p.selesaiLabel}` : "";
}

// Mengganti bulan/tahun membuat daftar anggota sebelumnya tidak berlaku lagi.
function absReset() {
  absToken++;
  absState = null;
  document.getElementById("absPanel").classList.add("hidden");
  absTampilkanPeriode();
}

async function muatAnggotaAbsensi() {
  const periode = absPeriodeTerpilih();
  if (!periode) {
    absSetStatus("Isi tahun dengan benar.", "error");
    return;
  }
  const token = ++absToken;
  const btn = document.getElementById("absMuatBtn");
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Memuat...';
  try {
    if (absJenis === "ob") await muatAnggotaOB(periode, token);
    else await muatAnggotaSecurity(periode, token);
  } catch (err) {
    if (token === absToken) absSetStatus("Gagal memuat data: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
    lucide.createIcons();
  }
}

async function muatAnggotaSecurity(periode, token) {
  absSetStatus(`Memuat jadwal ${periode.prevLabel} dan ${periode.curLabel}...`);
  const [prev, cur] = await Promise.all([api.getJadwal(periode.prevKey), api.getJadwal(periode.curKey)]);
  if (token !== absToken) return;
  const belum = [];
  if (!prev.rows.length) belum.push(periode.prevLabel);
  if (!cur.rows.length) belum.push(periode.curLabel);
  if (belum.length) {
    absState = null;
    document.getElementById("absPanel").classList.add("hidden");
    absSetStatus(`Jadwal ${belum.join(" dan ")} belum tersimpan di spreadsheet. Buat dan simpan jadwalnya dulu.`, "error");
    return;
  }
  const urutan = ((masterData && masterData.petugasSemua) || []).map((p) => p.nama);
  absState = { jenis: "security", periode, prev: prev.rows, cur: cur.rows, anggota: absensi.gabungAnggota(prev.rows, cur.rows, urutan) };
  absRenderAnggota();
  absSetStatus(`Jadwal ${periode.prevLabel} dan ${periode.curLabel} dimuat. Pilih anggota yang dimasukkan ke laporan.`, "ok");
}

async function muatAnggotaOB(periode, token) {
  if (!masterData || !Array.isArray(masterData.ob) || !Array.isArray(masterData.libur)) {
    absSetStatus("Data OB belum tersedia. Perbarui Apps Script (Code.gs dan Logic.gs), jalankan setup() sekali, lalu muat ulang halaman.", "error");
    return;
  }
  absSetStatus(`Memuat catatan OB ${periode.mulaiLabel} s.d. ${periode.selesaiLabel}...`);
  const { catatan } = await api.getObCatatan(periode.awalIso, periode.akhirIso);
  if (token !== absToken) return;
  const roster = kalenderOb.anggotaPeriode(masterData.ob, periode);
  if (!roster.length) {
    absState = null;
    document.getElementById("absPanel").classList.add("hidden");
    absSetStatus("Tidak ada OB yang bertugas pada periode ini. Cek tanggal Mulai dan Selesai di Pengaturan, tab OB.", "error");
    return;
  }
  absState = { jenis: "ob", periode, catatan, roster };
  absRenderOB();
  absSetStatus(`Data OB periode ini dimuat (${catatan.length} catatan). Pilih anggota yang dimasukkan ke laporan.`, "ok");
}

function tglPendek(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${kalenderOb.NAMA_BULAN[m - 1].slice(0, 3)} ${y}`;
}

function absRenderOB() {
  const { roster, periode } = absState;
  document.getElementById("absList").innerHTML = roster
    .map((o) => {
      const tag = [];
      if (o.mulai && o.mulai > periode.awalIso) tag.push(`Mulai ${tglPendek(o.mulai)}`);
      if (o.selesai && o.selesai < periode.akhirIso) tag.push(`Berhenti ${tglPendek(o.selesai)}`);
      return `
        <label class="absensi-item">
          <input type="checkbox" data-id="${escapeHtml(o.id)}" checked />
          <span><b>${escapeHtml(o.nama)}</b> <span class="text-sm muted-copy">${o.jabatan === "BACKUP" ? "Backup" : "Anggota"}</span>${tag.length ? `<span class="absensi-tag">${tag.join(" · ")}</span>` : ""}</span>
        </label>`;
    })
    .join("");
  document.getElementById("absPanel").classList.remove("hidden");
}

function absRenderAnggota() {
  const { periode, anggota } = absState;
  document.getElementById("absList").innerHTML = anggota
    .map((a) => {
      const tag = !a.diCur
        ? `Tidak ada di jadwal ${escapeHtml(periode.curLabel)}`
        : !a.diPrev
        ? `Tidak ada di jadwal ${escapeHtml(periode.prevLabel)}`
        : "";
      return `
        <label class="absensi-item">
          <input type="checkbox" data-nama="${escapeHtml(a.nama)}" checked />
          <span><b>${escapeHtml(a.nama)}</b>${tag ? `<span class="absensi-tag">${tag}</span>` : ""}</span>
        </label>`;
    })
    .join("");
  document.getElementById("absPam").checked = pamAktif();
  document.getElementById("absPanel").classList.remove("hidden");
}

// Dokumen jsPDF laporan OB dari pilihan saat ini, atau null (dengan pesan di status).
function absBuatDokumenOB() {
  if (!absState || absState.jenis !== "ob") {
    absSetStatus("Klik Muat Anggota dulu.", "error");
    return null;
  }
  const terpilihIds = [...document.querySelectorAll("#absList input[type=checkbox]")]
    .filter((c) => c.checked)
    .map((c) => c.dataset.id);
  if (!terpilihIds.length) {
    absSetStatus("Pilih minimal satu anggota.", "error");
    return null;
  }
  const cfg = absensi.configLaporan(masterConfig);
  const baris = kalenderOb.barisPeriode({
    periode: absState.periode,
    ob: masterData.ob,
    libur: masterData.libur,
    catatan: absState.catatan,
    terpilihIds
  });
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "l", unit: "mm", format: "a4", compress: true });
  absensiPdf.render(doc, {
    config: cfg,
    periode: absState.periode,
    baris,
    legenda: kalenderOb.legendaOB(cfg),
    judul: "JADWAL ABSENSI OB",
    catatan: cfg.ob_catatan,
    logo: "logo.png",
    ttd: { blok: "assets/ttd-blok.png" } // sama dengan laporan security
  });
  return doc;
}

// Dokumen jsPDF dari pilihan saat ini, atau null (dengan pesan di status) bila belum bisa dibuat.
function absBuatDokumen() {
  if (absJenis === "ob") return absBuatDokumenOB();
  if (!absState || absState.jenis !== "security") {
    absSetStatus("Klik Muat Anggota dulu.", "error");
    return null;
  }
  const terpilih = [...document.querySelectorAll("#absList input[type=checkbox]")]
    .filter((c) => c.checked)
    .map((c) => c.dataset.nama);
  const cfg = absensi.configLaporan(masterConfig);
  const pamDicentang = document.getElementById("absPam").checked;
  const namaPam = (cfg.keterangan_00_05 || "").trim();
  if (pamDicentang && !namaPam) {
    absSetStatus("Nama PAM belum diisi. Isi di Pengaturan, tab Umum & PAM, atau matikan baris PAM.", "error");
    return null;
  }
  if (!terpilih.length && !pamDicentang) {
    absSetStatus("Pilih minimal satu anggota.", "error");
    return null;
  }

  const baris = absensi.bangunBaris({
    periode: absState.periode,
    rowsPrev: absState.prev,
    rowsCur: absState.cur,
    terpilih,
    shiftMap,
    pam: pamDicentang ? { nama: namaPam } : null
  });
  const legenda = absensi.bangunLegenda(baris, shiftList, cfg.absensi_jam_kerja);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "l", unit: "mm", format: "a4", compress: true });
  absensiPdf.render(doc, {
    config: cfg,
    periode: absState.periode,
    baris,
    legenda,
    logo: "logo.png",
    // Satu gambar blok tanda tangan (tanpa tanggal). Ganti file ini untuk memperbaruinya.
    ttd: { blok: "assets/ttd-blok.png" }
  });
  return doc;
}

function previewAbsensi() {
  const doc = absBuatDokumen();
  if (!doc) return;
  document.getElementById("pdfPreview").src = doc.output("bloburl");
  document.getElementById("pdfModalCard").style.width = "min(1200px, 96vw)"; // landscape butuh lebih lebar
  const modal = document.getElementById("pdfModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function downloadAbsensi() {
  const doc = absBuatDokumen();
  if (!doc) return;
  const link = document.createElement("a");
  link.href = doc.output("bloburl");
  link.download = `ABSENSI ${absJenis === "ob" ? "OB" : "SECURITY"} ${absState.periode.mulaiPendek} - ${absState.periode.selesaiPendek}.pdf`;
  link.click();
}

document.getElementById("absList").addEventListener("change", (e) => {
  if (e.target.matches("input[type=checkbox]")) e.target.closest(".absensi-item").classList.toggle("dikecualikan", !e.target.checked);
});
// Pilihan jenis laporan: mengganti jenis membuang daftar anggota yang sudah dimuat.
function absSetJenis(jenis) {
  absJenis = jenis;
  document.querySelectorAll(".seg-btn").forEach((b) => {
    const aktif = b.dataset.jenis === jenis;
    b.classList.toggle("active", aktif);
    b.setAttribute("aria-selected", aktif);
  });
  document.getElementById("absPamWrap").classList.toggle("hidden", jenis === "ob"); // baris PAM hanya untuk security
  document.getElementById("absSubjudul").textContent = SUBJUDUL_ABSENSI[jenis];
  absReset();
  absSetStatus("");
}

document.querySelectorAll(".seg-btn").forEach((b) => b.addEventListener("click", () => absSetJenis(b.dataset.jenis)));
absBulan.addEventListener("change", absReset);
absTahun.addEventListener("input", absReset);

window.addEventListener("DOMContentLoaded", () => {
  const now = new Date();
  absBulan.value = now.getMonth();
  absTahun.value = now.getFullYear();
  absTampilkanPeriode();
});
