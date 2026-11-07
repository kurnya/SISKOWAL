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

Tab **Laporan Absensi** (di bagian atas halaman, di samping tab Jadwal) membuat PDF absensi A4 landscape dari jadwal yang sudah tersimpan:

1. Pilih **bulan akhir periode** dan tahun. Periodenya otomatis tanggal 16 bulan sebelumnya sampai tanggal 15 bulan itu.
2. Klik **Muat Anggota**. Daftar anggota adalah gabungan kedua bulan. Hilangkan centang untuk mengecualikan anggota (mis. sudah tidak bertugas). Anggota yang hanya ada di salah satu bulan diberi tanda, dan selnya dikosongkan pada bulan ia tidak ada.
3. Atur baris PAM, lalu **Lihat Preview** atau **Download PDF Absensi**.

Aturan isi: semua kode libur (X, O, atau sel kosong) dan cuti bersama (CB) ditulis **O**; cuti biasa tetap **CT**. Baris PAM berisi `M` setiap hari dengan nama dari Pengaturan (Nama PAM); legenda P/S/M dibuat dari Master_Shift dan hanya memuat kode yang dipakai di periode itu. Kota, teks jam kerja, legenda H/L/I/S/TK/CT/CB, dan catatan NOTE diatur di **Pengaturan → Umum & PAM → Laporan Absensi**. PDF juga menyediakan kolom keterangan `CB` tersendiri.

Jika spreadsheet sudah memiliki teks legenda absensi lama, perbarui nilainya di **Pengaturan → Umum & PAM → Laporan Absensi** agar menjelaskan `CT : Cuti biasa` dan `CB : Cuti bersama (O)`.

Tanda tangan: seluruh blok (Dibuat, Diketahui, Korlap beserta garis, nama, tanda tangan, dan stempel) adalah **satu gambar**, `assets/ttd-blok.png`. Hanya tanggal ("Jakarta, 16 September 2026") yang dicetak sebagai teks, karena berubah tiap periode; kota diatur di Pengaturan. Untuk mengganti penanda tangan atau tanda tangan, ganti file itu dengan gambar baru berlatar transparan dan **kosongkan area tanggal** (kanan atas). Tanggal dicetak di titik tengah 82% dari lebar dan 12% dari tinggi gambar (`TTD_TANGGAL` di `absensi-pdf.js`). Bila file tidak ada, PDF tetap dibuat dengan blok teks sederhana tanpa nama dan tanda tangan.

Kedua bulan harus sudah **tersimpan** di spreadsheet. Isian di tabel input yang belum disimpan tidak ikut.

## OB (kalender catatan)

Tab **OB** berisi kalender bulanan. Aturan dasarnya:

- **Hari kerja:** kosong berarti OB **masuk (P)**.
- **Sabtu, Minggu, libur nasional, dan cuti bersama:** otomatis **libur (O)**.
- **Libur lain:** mengikuti centang **Otomatis libur** di Pengaturan.

Klik sebuah tanggal untuk menambah catatan. Tekan **Selesai** untuk menerapkan pilihan; setiap penambahan atau penghapusan kemudian disimpan otomatis ke spreadsheet:

- **Hari kerja:** pilih OB dan keterangan: **Sakit (S), Izin (I), Tanpa keterangan (TK), Cuti biasa (CT), dan Libur lain (O)**. Untuk Sakit/Izin/TK/Cuti biasa, boleh memilih **Backup** (pengganti). Cuti bersama tidak perlu dicatat per orang: tanggalnya otomatis libur dan seluruh anggota mendapat **O**. Pilihan "Semua anggota" tersedia untuk jenis catatan lainnya.
- **Hari libur:** catatannya adalah **siapa yang lembur** (OB itu dihitung masuk).

Laporan OB dibuat di tab **Laporan Absensi** dengan memilih **OB** (periode 16 bulan lalu sampai 15 bulan ini, bisa mengecualikan anggota). Format dan tanda tangan sama dengan laporan security; baris PAM tidak ada.

**Mengelola OB dan hari libur** ada di **Pengaturan → OB** dan **Hari Libur**:

- OB yang sudah tersimpan **tidak bisa dihapus**; klik **Berhenti** (mengisi tanggal Selesai) agar laporan periode lama tetap memuatnya. Mengganti nama berarti orang yang sama; untuk orang baru, tambahkan baris baru.
- Daftar hari libur disinkronkan otomatis saat aplikasi dibuka dan saat kalender membuka tahun lain, lalu disimpan ke `Master_Libur`. Aplikasi memeriksa sumber [Indonesian Holidays API](https://indonesian-holidays.ahrulsyamil.com/) paling sering sekali sehari; sumber itu menyatakan datanya berasal dari SKB 3 Menteri. Data 2027 tersedia dari [pengumuman resmi Kemenko PMK](https://www.kemenkopmk.go.id/node/6444) sebagai cadangan. Tahun selanjutnya akan terisi otomatis setelah data resminya diterbitkan dan tersedia pada sumber. Cuti bersama otomatis libur (O), sedangkan libur khusus perusahaan dapat ditambahkan di Pengaturan.

Sheet baru di spreadsheet: `Master_OB`, `Master_Libur`, dan `OB_Catatan`. Setelah memperbarui `Code.gs`, `Logic.gs`, `ob.js`, `api.js`, `app.js`, `ob-ui.js`, dan `settings.js`, jalankan **`setup`** sekali lagi (aman: sheet yang sudah ada isinya tidak ditimpa), lalu deploy Apps Script versi baru dan muat ulang aplikasi. Apps Script akan meminta izin akses HTTP untuk mengambil data kalender.

## Tes

```
npm test
```
