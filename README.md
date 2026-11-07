# SISKOWAL

Konversi jadwal security. Master data dan jadwal bulanan disimpan di Google Spreadsheet lewat Apps Script Web App.

## Setup spreadsheet (sekali saja)

1. Buka spreadsheet "Jadwal" dengan akun pemiliknya, lalu **Ekstensi → Apps Script**.
2. Buat dua file di project itu dan tempel isinya: `apps-script/Code.gs` dan `apps-script/Logic.gs`.
3. Pilih fungsi `setup` lalu **Run**, dan setujui izin akses. Ini membuat sheet `Master_Petugas`, `Master_Shift`, `Master_Config` beserta isi awal. Kalau sheet sudah berisi, isinya tidak ditimpa.
4. **Deploy → Deployment baru → Web app**. Execute as: **Me**. Who has access: **Anyone**.
5. Salin URL Web App (berakhiran `/exec`) ke `API_URL` di [config.js](config.js).

Setiap kali `Code.gs` atau `Logic.gs` diubah, buat **versi deployment baru** supaya perubahan dipakai.

## Mengelola data

Semua master diatur dari web lewat tombol **Pengaturan** di header (atau langsung di spreadsheet):

- **Petugas:** tambah, ubah nama, aktif/non aktif, urutkan, hapus. Hanya petugas aktif yang tampil di tabel jadwal.
- **Kode Shift:** tambah, ubah kode, jam (`HH.MM-HH.MM`), keterangan. Tiap jam yang berbeda menjadi satu kolom di tabel hasil dan PDF, urut menurut kemunculan pertama. Kode `X` (libur, jam `-`) wajib ada.
- **Umum & PAM:** nama perusahaan, alamat, kontak, lokasi, serta saklar **Kolom PAM aktif** (kolom 00.00-05.00 dan nama PAM tampil atau disembunyikan di hasil dan PDF).
- **Jadwal:** satu sheet per bulan (`2026-01`, dst.), dibuat otomatis saat menekan **Simpan ke Spreadsheet**. Jadwal lama tidak ikut berubah bila nama petugas atau kode shift diubah: nama lama tidak tampil lagi, dan kode yang sudah dihapus ditandai merah.

Tanpa login: siapa pun yang tahu URL Web App dapat membaca dan menulis jadwal. Jangan menyimpan data sensitif.

## Laporan Absensi

Panel **Laporan Absensi** (bagian bawah halaman) membuat PDF absensi A4 landscape dari jadwal yang sudah tersimpan:

1. Pilih **bulan akhir periode** dan tahun. Periodenya otomatis tanggal 16 bulan sebelumnya sampai tanggal 15 bulan itu.
2. Klik **Muat Anggota**. Daftar anggota adalah gabungan kedua bulan. Hilangkan centang untuk mengecualikan anggota (mis. sudah tidak bertugas). Anggota yang hanya ada di salah satu bulan diberi tanda, dan selnya dikosongkan pada bulan ia tidak ada.
3. Atur baris PAM, lalu **Lihat Preview** atau **Download PDF Absensi**.

Aturan isi: semua kode libur (X, O, atau sel kosong) ditulis **O**; baris PAM berisi `M` setiap hari dengan nama dari Pengaturan (Nama PAM); legenda P/S/M dibuat dari Master_Shift dan hanya memuat kode yang dipakai di periode itu. Kota, teks jam kerja, legenda H/L/I/S/TK/CT, dan catatan NOTE diatur di **Pengaturan → Umum & PAM → Laporan Absensi**.

Tanda tangan: seluruh blok (Dibuat, Diketahui, Korlap beserta garis, nama, tanda tangan, dan stempel) adalah **satu gambar**, `assets/ttd-blok.png`. Hanya tanggal ("Jakarta, 16 September 2026") yang dicetak sebagai teks, karena berubah tiap periode; kota diatur di Pengaturan. Untuk mengganti penanda tangan atau tanda tangan, ganti file itu dengan gambar baru berlatar transparan dan **kosongkan area tanggal** (kanan atas). Tanggal dicetak di titik tengah 82% dari lebar dan 12% dari tinggi gambar (`TTD_TANGGAL` di `absensi-pdf.js`). Bila file tidak ada, PDF tetap dibuat dengan blok teks sederhana tanpa nama dan tanda tangan.

Kedua bulan harus sudah **tersimpan** di spreadsheet. Isian di tabel input yang belum disimpan tidak ikut.

## Tes

```
npm test
```
