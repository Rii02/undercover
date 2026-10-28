# Undercover: Kasus Kejahatan Siber

Game detektif 2D top-down (TypeScript + [Phaser 3](https://phaser.io) + [Vite](https://vitejs.dev)).
Kamu menyamar sebagai tukang bakso di desa untuk menyelidiki transfer mencurigakan.

## Versi 0.7 — Membobol komputer dan bukti

Fitur sampai versi ini:

1. Proyek Vite + TypeScript + Phaser; peta Tiled Chapter 1 dengan tabrakan (bangunan & pohon jadi tembok); pemain berjalan dengan panah / WASD atau tombol arah di layar sentuh
2. Jam desa Pagi → Siang → Sore → Malam (25 detik per slot); dekati rumah target untuk mencatat apakah ada orang atau kosong; tombol 📋 Catatan menampilkan hasilnya
3. Tiga warga di peta; dekati lalu tekan E / tombol Ajak Bicara untuk ngobrol, E atau ketuk untuk lanjut baris
4. Briefing cerita lewat telepon Bos di awal (E / ketuk untuk lanjut, tombol Mulai Misi di akhir); jam desa berhenti selama briefing
5. Bar kecurigaan: nongkrong dekat rumah target menaikkannya, menjauh menurunkannya, penuh = terusir ke titik awal
6. Tombol Coba Masuk di pintu: rumah kosong = masuk ke interior (jelajah, tangga, petunjuk, keluar lewat pintu); ada orang = ketahuan dan terusir
7. Komputer di dalam rumah bisa dibobol lewat minigame sirkuit gerbang logika; sukses = file manager berisi bukti terbuka

## Menjalankan

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # cek tipe (tsc) + build produksi ke dist/
```

## Kontrol

Panah / WASD = jalan · E = bicara / masuk / lapor · F = taruh atau ambil gerobak (sejak versi 0.10)
