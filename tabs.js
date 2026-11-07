// Tab utama: Jadwal Security | OB | Laporan Absensi. Tab terakhir yang dibuka diingat di browser ini.
const TAB_KEY = "siskowal.tab";
const TAB_UTAMA = ["jadwal", "ob", "absensi"];

function pilihTabUtama(nama, fokus) {
  if (!TAB_UTAMA.includes(nama)) nama = "jadwal";
  document.querySelectorAll(".main-tab").forEach((b) => {
    const aktif = b.dataset.tab === nama;
    b.classList.toggle("active", aktif);
    b.setAttribute("aria-selected", aktif);
    b.tabIndex = aktif ? 0 : -1;
    if (aktif && fokus) b.focus();
  });
  document.getElementById("tabJadwal").classList.toggle("hidden", nama !== "jadwal");
  document.getElementById("tabOB").classList.toggle("hidden", nama !== "ob");
  document.getElementById("tabAbsensi").classList.toggle("hidden", nama !== "absensi");
  if (nama === "ob" && typeof obAktifkan === "function") obAktifkan();
  try {
    localStorage.setItem(TAB_KEY, nama);
  } catch (e) { /* penyimpanan browser tidak tersedia: abaikan */ }
}

document.querySelectorAll(".main-tab").forEach((b, i, semua) => {
  b.addEventListener("click", () => pilihTabUtama(b.dataset.tab));
  // Panah kiri/kanan berpindah tab, sesuai pola tab yang dikenal pembaca layar.
  b.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const arah = e.key === "ArrowRight" ? 1 : -1;
    pilihTabUtama(semua[(i + arah + semua.length) % semua.length].dataset.tab, true);
  });
});

let tabTersimpan = "jadwal";
try {
  tabTersimpan = localStorage.getItem(TAB_KEY) || "jadwal";
} catch (e) { /* abaikan */ }
pilihTabUtama(tabTersimpan);
