lucide.createIcons();

function togglePetunjuk() {
  const box = document.getElementById("petunjuk");
  box.classList.toggle("hidden");
  lucide.createIcons();
}

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
});

const shiftMap = {
  "P": "08.00-16.00",
  "S": "16.00-00.00",
  "M": "00.00-08.00",
  "PS": "08.00-19.00",
  "SM": "19.00-08.00",
  "X": "-"
};

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

const namaList = ["Agus Sudirman", "Parwono", "Dimas Kurniawan", "Deddy Supriyadi"];

function generateTabel() {
  const bulan = parseInt(document.getElementById("bulan").value);
  const tahun = parseInt(document.getElementById("tahun").value);
  const daysInMonth = new Date(tahun, bulan + 1, 0).getDate();
  const hariRow = document.getElementById("hariRow");
  const tanggalRow = document.getElementById("tanggalRow");
  const tbody = document.getElementById("inputBody");

  hariRow.innerHTML = "<th rowspan='2' class='border px-2 py-2 bg-slate-100 font-semibold'>Nama</th>";
  tanggalRow.innerHTML = "";
  tbody.innerHTML = namaList.map((n) => `<tr><td class="border px-2 py-1 font-semibold">${n}</td></tr>`).join("");

  for (let t = 1; t <= daysInMonth; t++) {
    const tanggal = new Date(tahun, bulan, t);
    const hariPenuh = tanggal.toLocaleDateString("id-ID", { weekday: "long" }).toUpperCase();
    const hari = hariSingkat[hariPenuh] || hariPenuh.slice(0, 2);
    hariRow.innerHTML += `<th class="border px-2 py-1">${hari}</th>`;
    tanggalRow.innerHTML += `<th class="border px-2 py-1">${t}</th>`;

    document.querySelectorAll("#inputTable tbody tr").forEach((tr) => {
      const td = document.createElement("td");
      td.className = "border px-1 py-1";
      const nama = tr.cells[0].textContent.trim();
      const id = `${nama}_${t}`;
      td.innerHTML = `<input type='text' maxlength='3' class='border rounded text-center' id='${id}' data-nama='${nama}' data-tgl='${t}' />`;
      tr.appendChild(td);
    });
  }

  document.getElementById("inputContainer").classList.remove("hidden");
  document.getElementById("btnConvert").classList.remove("hidden");
  document.getElementById("hasil").classList.add("hidden");
  document.getElementById("inputContainer").classList.add("fade-in");
  document.getElementById("btnConvert").classList.add("fade-in");
  aktifkanNavigasi();
}

function aktifkanNavigasi() {
  const inputs = document.querySelectorAll("#inputTable input");
  const matrix = {};

  namaList.forEach((nama) => {
    matrix[nama] = {};
    document.querySelectorAll(`#inputTable input[data-nama='${nama}']`).forEach((input, colIdx) => {
      matrix[nama][colIdx] = input;
    });
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

function konversiJadwal() {
  const btn = document.getElementById("convertBtn");
  const originalText = btn.innerHTML;
  btn.innerHTML = '<span class="spinner"></span> Memproses...';
  btn.disabled = true;

  setTimeout(() => {
    runKonversiJadwal();
    btn.innerHTML = originalText;
    btn.disabled = false;
    document.getElementById("hasil").classList.add("slide-in");
  }, 1000);
}

function runKonversiJadwal() {
  const bulan = parseInt(document.getElementById("bulan").value);
  const tahun = parseInt(document.getElementById("tahun").value);
  const daysInMonth = new Date(tahun, bulan + 1, 0).getDate();
  const tbody = document.getElementById("tabelHasil");

  tbody.innerHTML = "";

  for (let tgl = 1; tgl <= daysInMonth; tgl++) {
    const tanggal = new Date(tahun, bulan, tgl);
    const hari = tanggal.toLocaleDateString("id-ID", { weekday: "long" });
    const hariUpper = hari.toUpperCase();
    const weekend = hari === "Sabtu" || hari === "Minggu";
    const shift = {
      "08.00-16.00": [],
      "16.00-00.00": [],
      "00.00-08.00": [],
      "08.00-19.00": [],
      "19.00-08.00": []
    };

    namaList.forEach((nama) => {
      const kode = document.getElementById(`${nama}_${tgl}`).value.toUpperCase() || "X";
      const jam = shiftMap[kode];
      if (jam && jam !== "-") shift[jam].push(nama);
    });

    tbody.innerHTML += `
      <tr class="${weekend ? "sabtu-minggu" : ""}">
        <td class="border px-2 py-1 font-medium">${hariUpper}</td>
        <td class="border px-2 py-1">${tgl}</td>
        <td class="border px-2 py-1">${shift["08.00-16.00"].join("<br>") || "-"}</td>
        <td class="border px-2 py-1">${shift["16.00-00.00"].join("<br>") || "-"}</td>
        <td class="border px-2 py-1">${shift["00.00-08.00"].join("<br>") || "-"}</td>
        <td class="border px-2 py-1">${shift["08.00-19.00"].join("<br>") || "-"}</td>
        <td class="border px-2 py-1">${shift["19.00-08.00"].join("<br>") || "-"}</td>
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
  doc.text("PT. CAMPA PUTRA SILIWANGI", 105, 29, { align: "center" });
  doc.setFontSize(9);
  doc.text("JL. GAMA SETIA RAYA BLOK B3 No.6A Komplek Pelni Kel. Bakti Jaya Kec. Sukma Jaya Depok - 16418", 105, 35, { align: "center" });
  doc.text("Tlp: 021 - 87728378 / email: support@campasiliwangi.com", 105, 40, { align: "center" });
  doc.setFontSize(10);
  doc.text(`Periode : 1 ${namaBulan} s.d ${daysInMonth} ${namaBulan} ${tahun}`, 105, 49, { align: "center" });
  doc.text("Lokasi  : OSCARMAS PONTIANAK", 15, 55);

  const rows = [];
  document.querySelectorAll("#tabelHasil tr").forEach((tr) => {
    const cells = [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/\n/g, " "));
    rows.push(cells);
  });

  doc.autoTable({
    startY: 60,
    head: [["HARI", "TGL", "08.00-16.00", "16.00-00.00", "00.00-08.00", "08.00-19.00", "19.00-08.00"]],
    body: rows,
    styles: { fontSize: 8, halign: "center", valign: "middle", lineWidth: 0.2 },
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
