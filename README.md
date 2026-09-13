# Website NOMAD LAW FIRM (Versi MySQL)

Website profil kantor hukum lengkap dengan panel admin (CMS) untuk mengelola
tim, artikel/berita, galeri kegiatan, dan mitra perusahaan — semuanya tanpa
perlu mengedit kode di VSCode.

Versi ini menyimpan seluruh data di **database MySQL** (bukan file JSON),
supaya kontennya tetap aman meski server di-restart atau di-deploy ulang —
cocok untuk hosting seperti Hostinger, Railway, atau VPS mana pun.

Tema warna: **navy blue & putih**. Logo yang terpasang adalah logo resmi
NOMAD LAW FIRM. Data tim, alamat, kontak, dan galeri sudah diisi sesuai
firma Anda, dan bisa diubah kapan saja lewat panel admin.

## Fitur

- Desain premium bertema navy blue & putih dengan sentuhan **app-like** (bottom
  navigation bar di HP, panel "quick actions", chat bubble) supaya pengalaman
  membuka website terasa seperti membuka aplikasi
- Halaman: Beranda, Tentang Kami, Layanan, Tim Kami, Berita, Galeri, Mitra, Kontak
- **Akun Klien (`/daftar`, `/masuk`, `/akun-saya`)** — klien bisa membuat akun
  pakai email ATAU nomor HP + kata sandi. Setelah masuk, riwayat Konsultasi
  Chat dan Pengajuan Kasus otomatis tersimpan ke akun mereka dan bisa dicek
  kapan saja dari perangkat mana pun, lengkap dengan status (Sedang
  Berlangsung/Selesai untuk konsultasi; Baru/Diproses/Selesai untuk kasus)
  dan catatan dari tim. Tetap boleh dipakai tanpa akun (tamu) bila klien
  tidak ingin daftar.
- **Konsultasi Chat (`/konsultasi`)** — klien bisa memulai obrolan singkat
  (nama, no. WhatsApp, topik, pertanyaan) dengan atau tanpa akun. Kalau
  sedang masuk ke akun, percakapan otomatis tersimpan di akun tersebut;
  kalau sebagai tamu, tersimpan lewat cookie khusus klien (bukan session
  admin), jadi klien tetap bisa kembali membuka halaman yang sama untuk
  melihat balasan advokat. Halaman ini otomatis mengecek balasan baru tiap
  beberapa detik (polling), tanpa perlu reload manual.
- **Ajukan Kasus (`/ajukan-kasus`)** — formulir untuk klien mengirim ringkasan
  kasus (kategori, kronologi) yang langsung masuk ke panel admin untuk
  ditinjau. Kalau klien sedang masuk ke akun, kasus ini otomatis tertaut ke
  akun mereka dan statusnya bisa dipantau di halaman Akun Saya.
- Tombol WhatsApp mengambang + tautan Instagram
- Panel admin (`/admin`) untuk:
  - Tambah/edit/hapus anggota tim beserta foto
  - Kelola daftar layanan hukum
  - Tulis & publikasikan artikel berita beserta gambar sampul
  - Unggah foto/video kegiatan ke galeri
  - Tambah mitra perusahaan beserta logo
  - Lihat pesan masuk dari formulir kontak
  - **Balas Konsultasi Klien** — lihat semua percakapan masuk, buka satu per
    satu, balas langsung dari panel admin, dan tandai selesai bila sudah
    tuntas ditangani
  - **Tinjau Pengajuan Kasus** — lihat daftar kasus yang masuk, ubah status
    (Baru / Diproses / Selesai), tambahkan catatan internal, atau hapus
  - Ubah info kantor, kontak, sosial media, statistik perkara, foto latar
    Beranda, foto Managing Partner, dan password admin
- **Data disimpan di database MySQL** — aman dari kehilangan data saat
  redeploy di platform apa pun
- Favicon & apple-touch-icon dari logo resmi
- **Bisa di-"Add to Home Screen"** (PWA) — tampil dengan ikon sendiri di HP
  dan tetap bisa dibuka meski koneksi lambat/terputus sebentar

## Menjalankan di Komputer (VSCode)

### 1. Siapkan MySQL

Anda butuh server MySQL/MariaDB yang menyala. Cara termudah di Windows:
pasang **[XAMPP](https://www.apachefriends.org/)** atau **[Laragon](https://laragon.org/)**,
nyalakan modul MySQL-nya, lalu buat database baru bernama `nomad_lawfirm`
lewat phpMyAdmin (klik "New", ketik nama database, tidak perlu bikin tabel
apa pun — nanti otomatis dibuat sendiri oleh aplikasi saat pertama dijalankan).

### 2. Atur file `.env`

File `.env` sudah disiapkan dengan nilai default. Untuk penggunaan
produksi, sesuaikan bagian database:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=nomad_lawfirm
```

(Kalau pakai XAMPP/Laragon default, biasanya `DB_USER=root` dan
`DB_PASSWORD` dikosongkan saja seperti contoh di atas.)

### 3. Install & jalankan

```
npm install
npm start
```

Buka **http://localhost:3000** untuk website, dan
**http://localhost:3000/admin/login** untuk panel admin.

### Login Admin Pertama Kali

Saat pertama kali dijalankan (database masih kosong), sistem otomatis
mengisi data awal dan membuat akun admin dengan:

```
Username : admin
Password : nomad@admin123
```

Password ini muncul juga di terminal saat server pertama kali dijalankan.
**Segera login dan ganti password** melalui menu **Pengaturan** di panel admin.

## Mengelola Konten Tanpa Coding

| Kebutuhan | Menu Admin |
|---|---|
| Tambah advokat/anggota baru + foto | Tim Kami |
| Kelola daftar layanan hukum | Layanan Hukum |
| Tulis berita/artikel baru | Artikel & Berita |
| Unggah foto/video kegiatan | Galeri Kegiatan |
| Tambah mitra perusahaan | Mitra Perusahaan |
| Update jumlah total perkara & perkara berjalan | Pengaturan |
| Ganti foto latar Beranda | Pengaturan → Foto Latar Beranda |
| Ganti foto Managing Partner (Tentang Kami & Profil Firma) | Pengaturan → Foto Managing Partner |
| Ganti nomor HP, email, alamat, IG, Google Maps | Pengaturan |
| Ganti password admin | Pengaturan |
| Lihat pesan dari formulir kontak | Pesan Masuk |

Foto/video yang diunggah tersimpan otomatis di folder `storage/uploads/...`
dan langsung tampil di website.

---

## Deploy ke Hostinger

Cara deploy berbeda tergantung paket Hostinger yang Anda pakai, karena
aplikasi ini butuh Node.js yang berjalan terus-menerus (bukan cuma file HTML statis).

### Cek dulu: paket Hostinger Anda mendukung Node.js?

Fitur **"Setup Node.js App"** di hPanel Hostinger saat ini tersedia di
paket **Business Hosting** ke atas dan **Cloud Hosting/VPS** — belum tentu
ada di paket shared/single yang paling murah. Buka hPanel → cari menu
**"Node.js"** di bagian Advanced/Website. Kalau menu ini tidak ada di
paket Anda, opsi paling gampang adalah upgrade ke paket yang mendukungnya,
atau pindah ke **Hostinger VPS**.

### A. Deploy via hPanel "Setup Node.js App" (Business/Cloud Hosting)

1. **Buat database MySQL** dulu: hPanel → **Databases → MySQL Databases**.
   Buat database baru + user baru, catat: nama database, username,
   password, dan host (biasanya `localhost`).
2. **Upload project**: kompres folder project ini (kecuali `node_modules`)
   jadi `.zip`, lalu upload lewat **File Manager** hPanel ke folder
   aplikasi Anda, atau gunakan Git jika Hostinger mendukung.
3. Buka menu **Node.js** di hPanel → **Create Application**:
   - Node.js version: pilih 18 ke atas
   - Application root: folder tempat Anda upload project
   - Application startup file: `server.js`
4. Di bagian **Environment Variables** pada aplikasi Node.js tadi, isi:
   ```
   SESSION_SECRET=teks-acak-yang-panjang-dan-unik
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=(username database yang dibuat tadi)
   DB_PASSWORD=(password database tadi)
   DB_NAME=(nama database tadi)
   ADMIN_DEFAULT_USERNAME=admin
   ADMIN_DEFAULT_PASSWORD=(ganti dengan password kuat pilihan Anda)
   ```
   `PORT` biasanya sudah diatur otomatis oleh Hostinger, tidak perlu diisi manual.
5. Klik **Run NPM Install** dari panel Node.js Hostinger (atau jalankan
   `npm install` lewat terminal SSH kalau tersedia).
6. **Start/Restart** aplikasinya dari panel Node.js.
7. Arahkan domain Anda ke aplikasi ini lewat pengaturan domain di hPanel.
8. Buka `namadomainanda.com/admin/login`, login pakai kredensial admin
   yang tadi diisi, lalu segera ganti password lewat menu Pengaturan.

### B. Deploy via Hostinger VPS

1. Login SSH ke VPS Anda.
2. Install Node.js 18+ dan MySQL server jika belum ada:
   ```
   sudo apt update
   sudo apt install -y nodejs npm mysql-server
   ```
3. Buat database:
   ```
   sudo mysql -u root -e "CREATE DATABASE nomad_lawfirm;"
   ```
4. Upload project ke VPS (lewat `scp`, `git clone`, atau FileZilla/SFTP),
   lalu masuk ke folder project.
5. Salin `.env.example` menjadi `.env` dan isi kredensial database serta
   `SESSION_SECRET` dengan teks acak.
6. `npm install --production`
7. Jalankan pakai **PM2** supaya tetap hidup setelah SSH ditutup:
   ```
   npm install -g pm2
   pm2 start server.js --name nomad-law-firm
   pm2 save
   pm2 startup
   ```
8. Pasang **Nginx** sebagai reverse proxy dari domain Anda ke port aplikasi
   (default 3000), lalu aktifkan SSL gratis dengan **Certbot**.

### Penting sebelum go-live (berlaku untuk kedua cara di atas)

- **Wajib** ganti `SESSION_SECRET` ke teks acak yang panjang — jangan
  pakai nilai contoh dari `.env.example`.
- **Wajib** ganti password admin default setelah login pertama kali.
- Backup database MySQL secara berkala (lewat phpMyAdmin: Export, atau
  `mysqldump`) — di situlah seluruh konten yang Anda kelola tersimpan.
- Folder `storage/uploads/` (tempat foto/video yang diunggah) juga perlu
  ikut di-backup dan dipastikan berada di disk yang permanen.

## Website Ini Sudah Bisa Jadi "Aplikasi" (PWA)

Website ini sudah dilengkapi **PWA (Progressive Web App)**, artinya
pengunjung bisa menambahkannya ke home screen HP mereka dan website akan
tampil & terasa seperti aplikasi asli: buka full-screen tanpa address bar
browser, pakai ikon logo NOMAD LAW FIRM sendiri, dan bagian yang sudah
pernah dibuka tetap bisa diakses walau koneksi lambat/terputus sebentar.

**Cara pengunjung menginstalnya** (tidak perlu Anda lakukan apa-apa, ini
otomatis begitu website online):
- **Android (Chrome)**: akan muncul notifikasi "Tambahkan ke layar Utama",
  atau lewat menu titik tiga lalu pilih "Add to Home screen" / "Install app"
- **iPhone (Safari)**: tombol Share (kotak dengan panah ke atas), lalu pilih
  "Add to Home Screen"

**Perlu diketahui:** ini bukan aplikasi native yang didaftarkan ke Google
Play Store / App Store, itu proyek terpisah dengan effort jauh lebih
besar (perlu dibungkus ulang, submit ke masing-masing store, proses
review, dsb). PWA ini adalah cara **paling cepat dan hemat biaya** untuk
memberi pengalaman "seperti aplikasi" ke pengunjung, memakai 100% kode
website yang sama persis. Kalau nanti Anda memang butuh aplikasi native
di Play Store/App Store, beri tahu saya, itu bisa dikerjakan sebagai
tahap lanjutan (banyak juga yang dibungkus langsung dari PWA ini memakai
tool seperti Capacitor/TWA, jadi pekerjaan yang sudah ada di sini tetap terpakai).

File terkait fitur ini: `public/manifest.json` (nama, ikon, warna tema
aplikasi) dan `public/sw.js` (service worker, atur logika cache offline).

## Struktur Folder

```
nomad-law-firm-mysql/
├── server.js              # Server utama Express (routing & logic)
├── db.js                   # Modul koneksi & query MySQL
├── package.json
├── data/
│   └── db.seed.json        # Data awal/template (dipakai saat database masih kosong)
├── storage/
│   └── uploads/            # Foto/video yang diupload lewat admin
├── public/
│   ├── css/                # style.css (website), admin.css (panel admin)
│   ├── js/                 # main.js, admin.js
│   ├── images/logo.png     # Logo resmi NOMAD LAW FIRM
│   ├── icons/               # Ikon PWA (untuk Add to Home Screen)
│   ├── manifest.json        # Konfigurasi PWA (nama, ikon, warna tema)
│   └── sw.js                # Service worker (cache offline)
└── views/                  # Template halaman (EJS)
    ├── admin/               # Halaman panel admin
    └── partials/            # Header, footer, ikon
```

## Kalau Sebelumnya Sudah Pakai Versi Tanpa Database (JSON)

Kalau Anda sempat menjalankan versi sebelumnya (yang menyimpan data di
`data/db.json`) secara lokal dan sudah mengisi data asli lewat panel admin
(tim, artikel, galeri, dll), Anda tidak perlu mengetik ulang semuanya:

1. Salin file `data/db.json` dari project versi lama ke folder `data/`
   project MySQL ini (letakkan berdampingan dengan `db.seed.json`).
2. Salin juga isi folder `public/uploads/` dari project lama (versi JSON) ke folder
   `storage/uploads/` project MySQL ini (bukan folder `public/uploads/`), supaya foto-fotonya tidak hilang.
3. Jalankan `npm install` lalu `npm start` seperti biasa — aplikasi akan
   otomatis mendeteksi `data/db.json` dan memindahkan semua isinya ke
   MySQL secara otomatis saat pertama kali dijalankan.

## Catatan Keamanan

- Ganti `SESSION_SECRET` di `.env` sebelum digunakan secara publik/produksi.
- Segera ganti password admin default setelah instalasi pertama.
- Jangan pernah commit file `.env` ke Git (sudah otomatis diabaikan lewat `.gitignore`).
- File yang diunggah dibatasi maksimal 300MB untuk video dan 6MB untuk foto,
  hanya menerima format umum (JPG, PNG, WEBP, GIF, SVG untuk foto; MP4, WEBM,
  MOV, MKV, AVI untuk video).
