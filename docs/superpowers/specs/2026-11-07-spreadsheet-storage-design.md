# SISKOWAL: Penyimpanan Data di Google Spreadsheet

Tanggal: 2026-11-07

## Tujuan
Master data dan jadwal bulanan disimpan di Google Spreadsheet, tidak lagi dikodekan di JavaScript atau hilang saat halaman ditutup. Aplikasi tetap frontend statis. Perantara ke spreadsheet adalah Google Apps Script Web App.

## Keputusan yang sudah disepakati
- Perantara: Google Apps Script (bukan server Node, bukan Sheets API dari browser).
- Tanpa login dan tanpa token. Data hanya jadwal, tidak sensitif. Siapa pun yang tahu URL Web App bisa membaca dan menulis. Risiko ini diterima.
- Master data diedit langsung di spreadsheet, bukan dari aplikasi.

## Struktur spreadsheet
| Sheet | Kolom | Isi |
|---|---|---|
| `Master_Petugas` | `Nama`, `Aktif`, `Urutan` | Daftar petugas. Hanya yang `Aktif` = TRUE tampil, diurutkan menurut `Urutan`. Menggantikan `namaList` di app.js:45. |
| `Master_Shift` | `Kode`, `Jam`, `Keterangan` | P, S, M, PS, SM, X. Menggantikan `shiftMap` di app.js:25. `Jam` = "-" untuk libur. |
| `Master_Config` | `Kunci`, `Nilai` | `perusahaan`, `alamat`, `kontak`, `lokasi`, `keterangan_00_05` (sekarang "AGUS (PAM TNI)"). |
| `YYYY-MM` (mis. `2026-01`) | `Nama`, `1` ... `31` | Satu baris per petugas, sel berisi kode shift. Dibuat otomatis saat bulan itu pertama kali disimpan. |

Nama petugas di sheet bulanan disalin saat menyimpan, jadi jadwal lama tidak berubah kalau master diubah kemudian.

## Apps Script (`apps-script/Code.gs`)
Di-deploy sebagai Web App: execute as pemilik, akses "Anyone".
- `GET ?action=master` mengembalikan `{petugas, shift, config}`.
- `GET ?action=jadwal&bulan=YYYY-MM` mengembalikan `{bulan, rows: [{nama, hari: {1:"P", ...}}]}`, atau `rows: []` bila sheet belum ada.
- `POST` dengan body JSON `{action:"simpan", bulan, rows}` menulis grid ke sheet bulan, membuatnya bila belum ada. Memakai `LockService` agar dua penyimpanan tidak bertabrakan.
- Validasi di server: format `bulan`, kode shift harus ada di `Master_Shift`, panjang `rows` wajar. Respons selalu `{ok:true,data}` atau `{ok:false,error}`.
- `setup()` dijalankan sekali dari editor Apps Script untuk membuat ketiga sheet master beserta isi awal (empat petugas dan enam kode shift yang sekarang).

## Frontend
- `config.js` (baru): `API_URL` Web App.
- `api.js` (baru): `getMaster()`, `getJadwal(bulan)`, `simpanJadwal(bulan, rows)`. Membungkus `fetch`, retry dengan backoff untuk kegagalan jaringan (mengikuti pola `withRetry` di BotSC), dan melempar error berpesan jelas. POST memakai `Content-Type: text/plain` agar tidak memicu preflight CORS yang tidak didukung Apps Script.
- `app.js`:
  - Saat load, panggil `getMaster()` lalu isi `namaList`, `shiftMap`, dan teks PDF dari config.
  - `generateTabel()` mengisi sel dari `getJadwal(bulan)` bila ada data.
  - Tombol **Simpan ke Spreadsheet** memanggil `simpanJadwal`. Saat gagal, input tetap utuh dan pesan error ditampilkan.
  - Teks PDF (perusahaan, alamat, kontak, lokasi, kolom 00.00-05.00) diambil dari config.
  - Bila master gagal dimuat, tampilkan pesan dan nonaktifkan pembuatan tabel. Tidak ada fallback ke data lama.
- `index.html`: tambah tombol simpan, indikator status (memuat/tersimpan/gagal), dan tag script `config.js` serta `api.js`.

## Penanganan error
- Jaringan atau Apps Script gagal: retry maksimal 3 kali, lalu pesan error di UI.
- Kuota Apps Script habis atau respons bukan JSON: pesan "Spreadsheet tidak bisa dijangkau", data input tetap di layar.
- Kode shift tak dikenal saat simpan: server menolak dengan menyebut nama dan tanggalnya.

## Pengujian
- `Code.gs`: fungsi murni (validasi, konversi grid ke baris sheet dan sebaliknya) dipisah dari panggilan `SpreadsheetApp` agar bisa diuji dengan Node.
- `api.js`: diuji dengan `fetch` palsu untuk sukses, retry, dan error.
- Manual: deploy ke spreadsheet uji, buat jadwal, simpan, muat ulang halaman, pastikan data kembali. Ganti bulan, ganti master di sheet, lalu muat ulang.

## Di luar cakupan
Login atau token, riwayat perubahan, edit master dari aplikasi, dan migrasi data lama (tidak ada data lama untuk dimigrasi).

## Spreadsheet yang dipakai
Spreadsheet "Jadwal" (milik dimascound@gmail.com) sudah dibuat dan masih kosong, hanya berisi `Sheet1`. `setup()` mengganti nama `Sheet1` menjadi `Master_Petugas` bila sheet itu kosong, lalu membuat sheet master lainnya. Web App harus di-deploy dari akun pemilik yang sama.

## Langkah manual untuk pengguna
Buat spreadsheet kosong, tempel `Code.gs`, jalankan `setup()`, deploy sebagai Web App, lalu salin URL-nya ke `config.js`. Langkahnya akan ditulis di README.
