// Panel "Laporan Absensi": periode 16 bulan lalu s.d. 15 bulan dipilih, dari jadwal yang sudah tersimpan.
// Tidak memakai tabel input di atas, jadi tidak ikut terpengaruh isian yang belum disimpan.

const absBulan = document.getElementById("absBulan");
const absTahun = document.getElementById("absTahun");
let absState = null; // { periode, prev, cur, anggota } setelah "Muat Anggota"
let absToken = 0; // menandai permintaan terbaru agar hasil yang basi diabaikan

bulanNama.forEach((b, i) => {
  const opt = document.createElement("option");
  opt.value = i;
  opt.textContent = b;
  absBulan.appendChild(opt);
});

function absSetStatus(teks, tipe) {
  const el = document.getElementById("absStatus");
  el.textContent = teks;
  el.className = "text-sm mt-1 " + (tipe === "error" ? "text-red-600" : tipe === "ok" ? "text-green-600" : "muted-copy");
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
  absSetStatus(`Memuat jadwal ${periode.prevLabel} dan ${periode.curLabel}...`);
  try {
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
    absState = { periode, prev: prev.rows, cur: cur.rows, anggota: absensi.gabungAnggota(prev.rows, cur.rows, urutan) };
    absRenderAnggota();
    absSetStatus(`Jadwal ${periode.prevLabel} dan ${periode.curLabel} dimuat. Pilih anggota yang dimasukkan ke laporan.`, "ok");
  } catch (err) {
    if (token === absToken) absSetStatus("Gagal memuat jadwal: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
    lucide.createIcons();
  }
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

// Dokumen jsPDF dari pilihan saat ini, atau null (dengan pesan di status) bila belum bisa dibuat.
function absBuatDokumen() {
  if (!absState) {
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
  link.download = `ABSENSI SECURITY ${absState.periode.mulaiPendek} - ${absState.periode.selesaiPendek}.pdf`;
  link.click();
}

document.getElementById("absList").addEventListener("change", (e) => {
  if (e.target.matches("input[type=checkbox]")) e.target.closest(".absensi-item").classList.toggle("dikecualikan", !e.target.checked);
});
absBulan.addEventListener("change", absReset);
absTahun.addEventListener("input", absReset);

window.addEventListener("DOMContentLoaded", () => {
  const now = new Date();
  absBulan.value = now.getMonth();
  absTahun.value = now.getFullYear();
  absTampilkanPeriode();
});
