// Fungsi murni untuk tabel hasil/PDF. Berjalan di browser dan di Node (untuk tes).
(function (root) {
  // Kolom jam = jam unik dari Master_Shift (selain "-"), urut menurut kemunculan
  // pertama di sheet, sehingga urutan kolom bisa diatur dengan menggeser baris shift.
  function deriveJamColumns(shiftList) {
    const seen = new Set();
    const cols = [];
    shiftList.forEach((s) => {
      const jam = (s.jam || "").trim();
      if (jam && jam !== "-" && !seen.has(jam)) {
        seen.add(jam);
        cols.push(jam);
      }
    });
    return cols;
  }

  // Ukuran font PDF menurut jumlah kolom total agar tabel tetap muat di A4 portrait.
  function pdfFontSize(totalColumns) {
    if (totalColumns <= 8) return 8;
    if (totalColumns <= 10) return 7;
    return 6;
  }

  const api = { deriveJamColumns, pdfFontSize };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.columns = api;
})(typeof window !== "undefined" ? window : globalThis);
