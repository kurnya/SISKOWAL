// Pembuat PDF "Jadwal Absensi Security" (A4 landscape). Tidak menyentuh DOM, jadi bisa dites di Node.
// doc = instance jsPDF dengan plugin autoTable terpasang (doc.autoTable).
(function (root) {
  const MARGIN = 10;
  const KOLOM_KET = ["M", "L", "I", "S", "TK", "CT"];
  // Posisi tanggal pada gambar blok tanda tangan (pecahan dari lebar/tinggi gambar):
  // titik tengah teks, dan garis dasarnya. Sesuai area yang dikosongkan di assets/ttd-blok.png.
  const TTD_TANGGAL = { x: 0.8214, y: 0.118 };

  function render(doc, data) {
    const { config: c, periode, baris, legenda, logo } = data;
    const tengah = doc.internal.pageSize.getWidth() / 2;
    const lebarHalaman = doc.internal.pageSize.getWidth();

    // ----- Kop -----
    if (logo) {
      try { doc.addImage(logo, "PNG", 13, 14, 26, 26); } catch (e) { /* logo gagal dimuat: kop tetap dibuat */ }
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(data.judul || "JADWAL ABSENSI SECURITY", tengah, 16, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(c.perusahaan || "", tengah, 24, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(c.alamat || "", tengah, 31, { align: "center" });
    doc.text(c.kontak || "", tengah, 37, { align: "center" });
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.text(`Periode :     ${periode.mulaiLabel}     / ${periode.selesaiLabel}`, tengah, 43, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(`LOKASI ${(c.lokasi || "").toUpperCase()}`, MARGIN, 61);

    // ----- Tabel -----
    const nHari = periode.hari.length;
    const lebarTersedia = lebarHalaman - MARGIN * 2;
    const wNo = 6, wNama = 38, wJabatan = 21, wJml = 8, wKet = 5.5;
    const wTgl = (lebarTersedia - wNo - wNama - wJabatan - wJml - wKet * KOLOM_KET.length) / nHari;

    const head = [
      [
        { content: "NO", rowSpan: 2 },
        { content: "NAMA", rowSpan: 2 },
        { content: "JABATAN", rowSpan: 2 },
        { content: "TANGGAL", colSpan: nHari },
        { content: "JML", rowSpan: 2 },
        { content: "KETERANGAN", colSpan: KOLOM_KET.length }
      ],
      [...periode.hari.map((h) => String(h.tgl)), ...KOLOM_KET]
    ];
    const body = baris.map((b, i) => [String(i + 1), b.nama, b.jabatan, ...b.kode, "", ...KOLOM_KET.map(() => "")]);

    const columnStyles = { 0: { cellWidth: wNo }, 1: { cellWidth: wNama, halign: "left" }, 2: { cellWidth: wJabatan } };
    for (let i = 0; i < nHari; i++) columnStyles[3 + i] = { cellWidth: wTgl };
    columnStyles[3 + nHari] = { cellWidth: wJml };
    for (let i = 0; i < KOLOM_KET.length; i++) columnStyles[4 + nHari + i] = { cellWidth: wKet };

    doc.autoTable({
      startY: 64,
      head,
      body,
      theme: "grid",
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: lebarTersedia,
      styles: { font: "times", fontStyle: "bold", fontSize: 7, cellPadding: 0.6, halign: "center", valign: "middle", lineColor: 0, lineWidth: 0.2, textColor: 0, fillColor: false },
      headStyles: { fillColor: false, textColor: 0, fontStyle: "bold" },
      columnStyles
    });

    // ----- Legenda & catatan -----
    let y = doc.lastAutoTable.finalY + 9;
    const ruang = (tinggi) => {
      if (y + tinggi > doc.internal.pageSize.getHeight() - 10) {
        doc.addPage();
        y = 20;
      }
    };
    ruang(70);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("KETERANGAN :", 76, y);
    doc.setFont("helvetica", "italic");
    doc.text(c.absensi_legenda || "", 100, y);

    const baris2 = Math.max(legenda.kiri.length, legenda.kanan.length);
    for (let i = 0; i < baris2; i++) {
      y += 5.3;
      doc.setFont("helvetica", "italic");
      if (legenda.kiri[i]) doc.text(legenda.kiri[i], 100, y);
      doc.setFont("helvetica", "bolditalic");
      if (legenda.kanan[i]) doc.text(legenda.kanan[i], 162, y);
    }

    y += 8;
    doc.setFont("helvetica", "normal");
    doc.text("NOTE :", 80, y + 4);
    const catatan = doc.splitTextToSize((data.catatan !== undefined ? data.catatan : c.absensi_catatan) || "", 160);
    const tinggiKotak = Math.max(10, catatan.length * 4.6 + 4);
    doc.setLineWidth(0.2);
    doc.rect(100, y - 2, 168, tinggiKotak);
    doc.setFontSize(9);
    doc.text(catatan, 102, y + 2.5);
    y += tinggiKotak;

    // ----- Tanda tangan -----
    // Seluruh blok (Dibuat / Diketahui / Korlap beserta garis, nama, tanda tangan, stempel) adalah
    // satu gambar. Hanya tanggal yang dicetak sebagai teks karena berubah tiap periode; area tanggal
    // pada gambar sudah dikosongkan. Posisi tanggal = pecahan lebar/tinggi gambar (TTD_TANGGAL).
    const ttdSrc = data.ttd && data.ttd.blok;
    let ttd = null;
    if (ttdSrc) {
      try {
        const p = doc.getImageProperties(ttdSrc);
        const lebar = 262;
        ttd = { src: ttdSrc, lebar, tinggi: (lebar * p.height) / p.width };
      } catch (e) { /* file tidak ada: pakai blok teks sederhana di bawah */ }
    }
    const tinggiBlok = ttd ? ttd.tinggi : 30;
    y = Math.max(y + 6, 148);
    ruang(tinggiBlok + 2);
    const teksTanggal = `${c.absensi_kota || ""}, ${periode.tanggalLaporan}`;

    if (ttd) {
      const x0 = (lebarHalaman - ttd.lebar) / 2;
      doc.addImage(ttd.src, "PNG", x0, y, ttd.lebar, ttd.tinggi);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.text(teksTanggal, x0 + ttd.lebar * TTD_TANGGAL.x, y + ttd.tinggi * TTD_TANGGAL.y, { align: "center" });
    } else {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Dibuat,", 14, y);
      doc.text("Diketahui,", 108, y);
      doc.text(teksTanggal, 197, y);
      doc.setLineWidth(0.3);
      doc.line(14, y + 24, 60, y + 24);
      doc.line(108, y + 24, 154, y + 24);
      doc.line(197, y + 24, 262, y + 24);
      doc.setFont("helvetica", "normal");
      doc.text(`KORLAP OPS ${c.perusahaan || ""}`, 197, y + 28.5);
    }

    return doc;
  }

  const api = { render };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.absensiPdf = api;
})(typeof window !== "undefined" ? window : globalThis);
