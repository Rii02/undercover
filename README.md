# Undercover: Kasus Kejahatan Siber

Game detektif 2D top-down (TypeScript + [Phaser 3](https://phaser.io) + [Vite](https://vitejs.dev)).
Kamu menyamar sebagai tukang bakso di desa untuk menyelidiki transfer mencurigakan.

## Versi 0.3 — Warga desa dan dialog

Fitur sampai versi ini:

1. Proyek Vite + TypeScript + Phaser; peta Tiled Chapter 1 dengan tabrakan (bangunan & pohon jadi tembok); pemain berjalan dengan panah / WASD atau tombol arah di layar sentuh
2. Jam desa Pagi → Siang → Sore → Malam (25 detik per slot); dekati rumah target untuk mencatat apakah ada orang atau kosong; tombol 📋 Catatan menampilkan hasilnya
3. Tiga warga di peta; dekati lalu tekan E / tombol Ajak Bicara untuk ngobrol, E atau ketuk untuk lanjut baris

## Menjalankan

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # cek tipe (tsc) + build produksi ke dist/
```

## Kontrol

Panah / WASD = jalan · E = bicara / masuk / lapor · F = taruh atau ambil gerobak (sejak versi 0.10)
