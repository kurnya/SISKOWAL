lucide.createIcons();

const bulanNama = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const selectBulan = document.getElementById("bulan");

bulanNama.forEach((b, i) => {
  const opt = document.createElement("option");
  opt.value = i;
  opt.textContent = b;
  selectBulan.appendChild(opt);
});

window.addEventListener("DOMContentLoaded", () => {
  const now = new Date();
  document.getElementById("bulan").value = now.getMonth();
  document.getElementById("tahun").value = now.getFullYear();
  muatMaster();
});

// Diisi dari spreadsheet (sheet Master_*) oleh muatMaster().
let shiftMap = {};
let shiftList = [];
let namaList = [];
let masterConfig = {};
let masterData = null; // data mentah dari server, dipakai layar pengaturan

// Kolom PAM tampil kecuali pam_aktif secara eksplisit FALSE (default lama: tampil).
function pamAktif() {
  return String(masterConfig.pam_aktif || "TRUE").toUpperCase() !== "FALSE";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Notifikasi singkat di pojok layar. Pesan status tetap tertulis di baris status, jadi tidak ada yang hilang.
let toastTimer = null;
function tampilToast(teks, tipe) {
  const el = document.getElementById("toast");
  el.textContent = teks;
  el.className = "toast " + (tipe === "error" ? "toast-error" : "toast-ok");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), tipe === "error" ? 8000 : 3500);
}

// Toast muncul untuk error, dan untuk keberhasilan bila toast = true (mis. jadwal tersimpan).
function setStatus(teks, tipe, toast) {
  const el = document.getElementById("status");
  el.textContent = teks;
  el.className = "status-line " + (tipe === "error" ? "status-error" : tipe === "ok" ? "status-ok" : "");
  if (tipe === "error" || (tipe === "ok" && toast)) tampilToast(teks, tipe);
}

function kunciBulan() {
  const bulan = parseInt(document.getElementById("bulan").value);
  const tahun = parseInt(document.getElementById("tahun").value);
  return `${tahun}-${String(bulan + 1).padStart(2, "0")}`;
}

// "Keterangan Pengisian": kode dan artinya dari Master_Shift, urut seperti di sheet.
// Kode berjam "-" ditampilkan dengan keterangannya (mis. "Libur"), selain itu dengan jamnya.
function renderPetunjuk() {
  const el = document.getElementById("petunjukIsi");
  el.innerHTML = shiftList.length
    ? shiftList
        .map((s) => `<span class="legend-chip"><b>${escapeHtml(s.kode)}</b> ${escapeHtml(s.jam === "-" ? s.keterangan || "Libur" : s.jam)}</span>`)
        .join("")
    : "Belum ada kode shift.";
}

async function muatMaster() {
  const btn = document.getElementById("btnBuatTabel");
  const btnPengaturan = document.getElementById("btnPengaturan");
  btn.disabled = true;
  btnPengaturan.disabled = true;
  document.getElementById("absMuatBtn").disabled = true;
  setStatus("Memuat master data dari spreadsheet...");
  try {
    const m = await api.getMaster();
    masterData = m;
    namaList = m.petugas;
    shiftList = m.shift;
    shiftMap = Object.fromEntries(m.shift.map((s) => [s.kode, s.jam]));
    masterConfig = m.config || {};
    renderPetunjuk();
    // Pengaturan boleh dibuka walau belum ada petugas aktif, supaya bisa diperbaiki dari web.
    btnPengaturan.disabled = false;
    document.getElementById("absMuatBtn").disabled = false;
    if (!namaList.length) throw new Error("Tidak ada petugas aktif. Buka Pengaturan untuk menambah atau mengaktifkan petugas.");
    btn.disabled = false;
    setStatus("Master data dimuat.", "ok");
    muatDaftarBulan();
  } catch (err) {
    setStatus("Gagal memuat master data: " + err.message, "error");
  }
}

const hariSingkat = {
  "SENIN": "SN",
  "SELASA": "SL",
  "RABU": "RB",
  "KAMIS": "KM",
  "JUMAT": "JM",
  "JUM'AT": "JM",
  "SABTU": "SB",
  "MINGGU": "MG"
};

async function generateTabel() {
  const bulan = parseInt(document.getElementById("bulan").value);
  const tahun = parseInt(document.getElementById("tahun").value);
  const daysInMonth = new Date(tahun, bulan + 1, 0).getDate();
  const hariRow = document.getElementById("hariRow");
  const tanggalRow = document.getElementById("tanggalRow");
  const tbody = document.getElementById("inputBody");

  hariRow.innerHTML = "<th rowspan='2' class='border px-2 py-2 font-semibold'>Nama</th>";
  tanggalRow.innerHTML = "";
  tbody.innerHTML = namaList.map((n) => `<tr><td class="border px-2 py-1 font-semibold">${escapeHtml(n)}</td></tr>`).join("");

  for (let t = 1; t <= daysInMonth; t++) {
    const tanggal = new Date(tahun, bulan, t);
    const hariPenuh = tanggal.toLocaleDateString("id-ID", { weekday: "long" }).toUpperCase();
    const hari = hariSingkat[hariPenuh] || hariPenuh.slice(0, 2);
    const akhirPekan = tanggal.getDay() === 0 || tanggal.getDay() === 6 ? " akhir-pekan" : "";
    hariRow.innerHTML += `<th class="border px-2 py-1${akhirPekan}">${hari}</th>`;
    tanggalRow.innerHTML += `<th class="border px-2 py-1${akhirPekan}">${t}</th>`;

    document.querySelectorAll("#inputTable tbody tr").forEach((tr) => {
      const td = document.createElement("td");
      td.className = "border px-1 py-1" + akhirPekan;
      const nama = tr.cells[0].textContent.trim();
      const id = `${nama}_${t}`;
      td.innerHTML = `<input type='text' maxlength='3' class='border rounded text-center' id='${escapeHtml(id)}' data-nama='${escapeHtml(nama)}' data-tgl='${t}' />`;
      tr.appendChild(td);
    });
  }

  document.getElementById("emptyState").classList.add("hidden");
  document.getElementById("tabelSection").classList.remove("hidden");
  document.getElementById("judulTabel").textContent = `Jadwal ${bulanNama[bulan]} ${tahun}`;
  document.getElementById("inputContainer").classList.remove("hidden");
  document.getElementById("btnConvert").classList.remove("hidden");
  document.getElementById("hasil").classList.add("hidden");
  document.getElementById("inputContainer").classList.add("fade-in");
  document.getElementById("btnConvert").classList.add("fade-in");
  aktifkanNavigasi();
  bulanTabel = kunciBulan();
  tabelKotor = false;
  setJadwalSiap(false); // sampai jadwal tersimpan bulan ini selesai dimuat
  await isiDariSpreadsheet();
}

// Bulan (YYYY-MM) yang dipakai saat tabel input terakhir dibuat. Simpan/konversi memakai ini,
// bukan dropdown, supaya mengganti dropdown tanpa membuat ulang tabel tidak menimpa bulan lain.
let bulanTabel = null;

function tabelSesuaiPilihan() {
  if (bulanTabel && bulanTabel === kunciBulan()) return true;
  setStatus("Pilihan bulan/tahun berbeda dengan tabel yang tampil. Klik Buat Tabel lagi.", "error");
  return false;
}

// true bila ada isian di tabel yang belum tersimpan ke spreadsheet.
let tabelKotor = false;
document.getElementById("inputTable").addEventListener("input", () => {
  tabelKotor = true;
});

// Meminta konfirmasi hanya bila membuang tabel sekarang akan menghilangkan isian yang belum disimpan.
function konfirmasiBuang(aksi) {
  if (!tabelKotor) return true;
  return confirm(`Ada isian di tabel ${bulanTabel} yang belum disimpan. Tetap lanjut ${aksi} dan buang isian itu?`);
}

// Mengosongkan tabel lalu mengisinya dari rows. Mengembalikan jumlah sel berkode tidak dikenal.
function isiTabel(rows) {
  document.querySelectorAll("#inputTable input").forEach((input) => {
    input.value = "";
    input.style.borderColor = "";
    input.title = "";
  });
  let kodeAsing = 0;
  rows.forEach((row) => {
    Object.entries(row.hari).forEach(([tgl, kode]) => {
      const input = document.getElementById(`${row.nama}_${tgl}`);
      if (!input) return; // petugas tak aktif/tidak ada, atau tanggal di luar bulan ini
      input.value = kode;
      // Kode yang sudah tidak ada di master (mis. dihapus lewat Pengaturan).
      if (!(kode.toUpperCase() in shiftMap)) {
        input.style.borderColor = "#dc2626";
        input.title = `Kode "${kode}" tidak ada di master shift`;
        kodeAsing++;
      }
    });
  });
  return kodeAsing;
}

// Tabel baru boleh disimpan hanya setelah jadwal tersimpan bulan itu selesai dimuat. Tanpa ini, menekan
// Simpan saat tabel masih kosong (memuat lambat, atau gagal) akan menimpa jadwal lama di spreadsheet.
let jadwalSiap = false;

function setJadwalSiap(siap) {
  jadwalSiap = siap;
  const kontainer = document.getElementById("inputContainer");
  kontainer.classList.toggle("memuat", !siap);
  kontainer.setAttribute("aria-busy", String(!siap));
  document.getElementById("saveBtn").disabled = !siap;
  document.getElementById("convertBtn").disabled = !siap;
}

function pastikanJadwalSiap() {
  if (jadwalSiap) return true;
  setStatus("Jadwal bulan ini belum selesai dimuat, jadi belum bisa disimpan. Tunggu sebentar, atau klik Buat Tabel lagi bila gagal.", "error");
  return false;
}

async function isiDariSpreadsheet() {
  const bulan = bulanTabel;
  setStatus(`Memuat jadwal ${bulan}...`);
  try {
    const data = await api.getJadwal(bulan);
    // Pengguna mungkin sudah membuat tabel lain saat menunggu; abaikan hasil yang basi.
    if (bulan !== bulanTabel) return;
    const kodeAsing = isiTabel(data.rows);
    setJadwalSiap(true);
    const peringatan = kodeAsing ? ` ${kodeAsing} sel berkode tidak dikenal (bertanda merah).` : "";
    setStatus(
      (data.rows.length ? `Jadwal ${bulan} dimuat dari spreadsheet.` : `Belum ada jadwal tersimpan untuk ${bulan}.`) + peringatan,
      kodeAsing ? "error" : "ok"
    );
  } catch (err) {
    // Penyimpanan tetap nonaktif: menyimpan tabel kosong akan menimpa jadwal lama yang gagal dimuat.
    if (bulan === bulanTabel) {
      setStatus("Gagal memuat jadwal: " + err.message + ". Klik Buat Tabel untuk mencoba lagi; penyimpanan dinonaktifkan agar jadwal lama tidak tertimpa.", "error");
    }
  }
}

function labelBulan(kunci) {
  const [t, b] = kunci.split("-").map(Number);
  return `${bulanNama[b - 1]} ${t}`;
}

// Mengisi dropdown "Buka jadwal tersimpan" dengan bulan yang sudah ada di spreadsheet.
// Pilihan sebelumnya dipertahankan; bila tidak ada, bulan tabel yang tampil (atau yang terbaru).
async function muatDaftarBulan() {
  const select = document.getElementById("bulanSumber");
  const btn = document.getElementById("prevBtn");
  const dipilih = select.value;
  select.disabled = true;
  btn.disabled = true;
  select.innerHTML = "<option>Memuat...</option>";
  try {
    const { bulan } = await api.getDaftarBulan(); // terbaru dulu
    if (!bulan.length) {
      select.innerHTML = "<option>Belum ada jadwal tersimpan</option>";
      return;
    }
    select.innerHTML = bulan.map((k) => `<option value="${k}">${escapeHtml(labelBulan(k))}</option>`).join("");
    select.value = [dipilih, bulanTabel].find((k) => k && bulan.includes(k)) || bulan[0];
    select.disabled = false;
    btn.disabled = false;
  } catch (err) {
    select.innerHTML = "<option>Gagal memuat daftar</option>";
    setStatus("Gagal memuat daftar bulan: " + err.message, "error");
  }
}

// Membuka jadwal yang sudah tersimpan: tabel diganti seluruhnya menjadi bulan itu, dengan
// datanya sendiri. Tidak ada data bulan lain yang bercampur atau tertimpa.
async function bukaJadwalTersimpan() {
  const sumber = document.getElementById("bulanSumber").value;
  if (!/^\d{4}-\d{2}$/.test(sumber)) return;
  if (!konfirmasiBuang(`membuka jadwal ${labelBulan(sumber)}`)) return;
  const [t, b] = sumber.split("-").map(Number);
  document.getElementById("bulan").value = b - 1;
  document.getElementById("tahun").value = t;
  await generateTabel();
}

// Tombol "Buat Tabel": untuk jadwal baru (atau membuka bulan yang dipilih di atas).
async function buatTabelBaru() {
  if (!konfirmasiBuang("membuat tabel baru")) return;
  await generateTabel();
}

// Mengirim isi tabel ke spreadsheet. Mengembalikan true bila berhasil.
async function kirimJadwal() {
  if (!tabelSesuaiPilihan() || !pastikanJadwalSiap()) return false;
  const bulan = bulanTabel;
  const rows = namaList.map((nama) => {
    const hari = {};
    document.querySelectorAll("#inputTable input").forEach((input) => {
      if (input.dataset.nama === nama && input.value.trim()) hari[input.dataset.tgl] = input.value.trim().toUpperCase();
    });
    return { nama, hari };
  });
  setStatus(`Menyimpan jadwal ${bulan}...`);
  try {
    await api.simpanJadwal(bulan, rows);
    tabelKotor = false;
    setStatus(`Jadwal ${bulan} tersimpan di spreadsheet.`, "ok", true);
    muatDaftarBulan(); // bulan ini mungkin baru muncul di daftar jadwal tersimpan
    return true;
  } catch (err) {
    setStatus("Gagal menyimpan (data di layar tetap aman): " + err.message, "error");
    return false;
  }
}

async function simpanKeSpreadsheet() {
  const btn = document.getElementById("saveBtn");
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Menyimpan...';
  try {
    await kirimJadwal();
  } finally {
    btn.disabled = !jadwalSiap;
    btn.innerHTML = original;
    lucide.createIcons();
  }
}

function aktifkanNavigasi() {
  const inputs = document.querySelectorAll("#inputTable input");
  const matrix = {};

  namaList.forEach((nama) => {
    matrix[nama] = {};
  });
  inputs.forEach((input) => {
    matrix[input.dataset.nama][parseInt(input.dataset.tgl) - 1] = input;
  });

  inputs.forEach((input) => {
    input.addEventListener("keydown", (e) => {
      const nama = input.dataset.nama;
      const tgl = parseInt(input.dataset.tgl);
      const col = tgl - 1;
      const row = namaList.indexOf(nama);

      if (["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        let nextInput;

        if (e.key === "ArrowRight" && col + 1 < Object.keys(matrix[nama]).length) nextInput = matrix[nama][col + 1];
        if (e.key === "ArrowLeft" && col - 1 >= 0) nextInput = matrix[nama][col - 1];
        if (e.key === "ArrowDown" && row + 1 < namaList.length) nextInput = matrix[namaList[row + 1]][col];
        if (e.key === "ArrowUp" && row - 1 >= 0) nextInput = matrix[namaList[row - 1]][col];
        if (nextInput) nextInput.focus();
      }
    });
  });
}

// Konversi otomatis menyimpan jadwal ke spreadsheet lebih dulu. Bila penyimpanan gagal,
// hasil konversi tetap ditampilkan dan pesan gagalnya tetap terlihat di status.
async function konversiJadwal() {
  if (!tabelSesuaiPilihan() || !pastikanJadwalSiap()) return;
  const btn = document.getElementById("convertBtn");
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span class="spinner"></span> Menyimpan & memproses...';
  btn.disabled = true;

  try {
    const tersimpan = await kirimJadwal();
    runKonversiJadwal();
    document.getElementById("hasil").classList.add("slide-in");
    if (tersimpan) setStatus(`Jadwal ${bulanTabel} tersimpan di spreadsheet dan sudah dikonversi.`, "ok", true);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = !jadwalSiap;
  }
}

function runKonversiJadwal() {
  const bulan = parseInt(document.getElementById("bulan").value);
  const tahun = parseInt(document.getElementById("tahun").value);
  const daysInMonth = new Date(tahun, bulan + 1, 0).getDate();
  const tbody = document.getElementById("tabelHasil");

  const jamKolom = columns.deriveJamColumns(shiftList);
  const pam = pamAktif();

  document.getElementById("outputHead").innerHTML =
    ["Hari", "Tanggal", ...jamKolom, ...(pam ? ["00.00-05.00"] : [])]
      .map((h) => `<th class="border px-2 py-3">${escapeHtml(h)}</th>`)
      .join("");

  tbody.innerHTML = "";

  for (let tgl = 1; tgl <= daysInMonth; tgl++) {
    const tanggal = new Date(tahun, bulan, tgl);
    const hari = tanggal.toLocaleDateString("id-ID", { weekday: "long" });
    const hariUpper = hari.toUpperCase();
    const weekend = hari === "Sabtu" || hari === "Minggu";
    const shift = Object.fromEntries(jamKolom.map((j) => [j, []]));

    namaList.forEach((nama) => {
      const input = document.getElementById(`${nama}_${tgl}`);
      const kode = (input ? input.value : "").toUpperCase() || "X";
      const jam = shiftMap[kode];
      if (jam && jam !== "-" && shift[jam]) shift[jam].push(escapeHtml(nama));
    });

    const sel = (isi) => `<td class="border px-2 py-1">${isi}</td>`;
    tbody.innerHTML += `
      <tr class="${weekend ? "sabtu-minggu" : ""}">
        <td class="border px-2 py-1 font-medium">${hariUpper}</td>
        ${sel(tgl)}
        ${jamKolom.map((j) => sel(shift[j].join("<br>") || "-")).join("")}
        ${pam ? sel(escapeHtml(masterConfig.keterangan_00_05 || "-")) : ""}
      </tr>`;
  }

  document.getElementById("hasil").classList.remove("hidden");
}

function generatePDFBlob() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
  const bulan = parseInt(document.getElementById("bulan").value);
  const tahun = parseInt(document.getElementById("tahun").value);
  const namaBulan = new Date(tahun, bulan).toLocaleDateString("id-ID", { month: "long" }).toUpperCase();
  const daysInMonth = new Date(tahun, bulan + 1, 0).getDate();

  function rgbToArray(rgbString) {
    const match = rgbString.match(/\d+/g);
    return match ? match.map(Number) : [255, 255, 255];
  }

  const isDarkMode = document.documentElement.hasAttribute("data-theme");
  const headerColor = isDarkMode ? [75, 85, 99] : rgbToArray(getComputedStyle(document.querySelector("#outputTable thead")).backgroundColor);
  const weekendColor = [228, 238, 249];

  doc.addImage("logo.png", "PNG", 18, 10, 23, 23);
  doc.setFontSize(10);
  doc.text("JADWAL SECURITY", 105, 22, { align: "center" });
  doc.setFontSize(12);
  doc.text(masterConfig.perusahaan || "", 105, 29, { align: "center" });
  doc.setFontSize(9);
  doc.text(masterConfig.alamat || "", 105, 35, { align: "center" });
  doc.text(masterConfig.kontak || "", 105, 40, { align: "center" });
  doc.setFontSize(10);
  doc.text(`Periode : 1 ${namaBulan} s.d ${daysInMonth} ${namaBulan} ${tahun}`, 105, 49, { align: "center" });
  doc.text(`Lokasi  : ${masterConfig.lokasi || ""}`, 15, 55);

  const rows = [];
  document.querySelectorAll("#tabelHasil tr").forEach((tr) => {
    const cells = [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/\n/g, " "));
    rows.push(cells);
  });

  const head = ["HARI", "TGL", ...[...document.querySelectorAll("#outputHead th")].slice(2).map((th) => th.innerText)];

  doc.autoTable({
    startY: 60,
    head: [head],
    body: rows,
    styles: { fontSize: columns.pdfFontSize(head.length), halign: "center", valign: "middle", lineWidth: 0.2 },
    headStyles: { fillColor: headerColor, textColor: 0, fontStyle: "bold" },
    didParseCell(data) {
      const hari = data.row.raw[0];
      if (hari && (hari.includes("SABTU") || hari.includes("MINGGU"))) {
        data.cell.styles.fillColor = weekendColor;
      }
    },
    margin: { left: 10, right: 10 },
    theme: "grid",
  });

  return doc.output("bloburl");
}

function previewPDF() {
  const pdfUrl = generatePDFBlob();
  document.getElementById("pdfPreview").src = pdfUrl;
  document.getElementById("pdfModalCard").style.width = ""; // kembali ke lebar portrait bawaan
  const modal = document.getElementById("pdfModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closePreview() {
  const modal = document.getElementById("pdfModal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

function downloadPDF() {
  const bulan = parseInt(document.getElementById("bulan").value);
  const tahun = parseInt(document.getElementById("tahun").value);
  const namaBulan = new Date(tahun, bulan).toLocaleDateString("id-ID", { month: "long" }).toUpperCase();
  const docBlob = generatePDFBlob();
  const link = document.createElement("a");
  link.href = docBlob;
  link.download = `JADWAL BULAN ${namaBulan} ${tahun}.pdf`;
  link.click();
}

const themeToggle = document.getElementById("themeToggle");
const html = document.documentElement;

function toggleTheme() {
  const currentTheme = html.getAttribute("data-theme");
  if (currentTheme === "dark") {
    html.removeAttribute("data-theme");
    localStorage.setItem("theme", "light");
    themeToggle.innerHTML = '<i data-lucide="moon" class="icon" style="margin-right: 0;"></i>';
  } else {
    html.setAttribute("data-theme", "dark");
    localStorage.setItem("theme", "dark");
    themeToggle.innerHTML = '<i data-lucide="sun" class="icon" style="margin-right: 0;"></i>';
  }
  lucide.createIcons();
}

const savedTheme = localStorage.getItem("theme");
if (savedTheme === "dark") {
  html.setAttribute("data-theme", "dark");
  themeToggle.innerHTML = '<i data-lucide="sun" class="icon" style="margin-right: 0;"></i>';
} else {
  themeToggle.innerHTML = '<i data-lucide="moon" class="icon" style="margin-right: 0;"></i>';
}

themeToggle.addEventListener("click", toggleTheme);
lucide.createIcons();
