# Undercover: Kasus Kejahatan Siber — versi TypeScript + Phaser

Port dari `index.html` (canvas manual) ke proyek TypeScript + [Phaser 3](https://phaser.io)
memakai [Vite](https://vitejs.dev) sebagai bundler/dev-server.

## Struktur

```
src/
  main.ts              # entry point, daftar Scene, setup Phaser.Game
  state/
    GameState.ts       # state global (slot waktu, kecurigaan, log observasi)
    Hud.ts             # helper untuk elemen DOM (toast, log, tombol aksi)
  scenes/
    BootScene.ts        # preload aset
    MapScene.ts          # peta dunia, NPC, day/night cycle, aksi
    InteriorScene.ts     # eksplorasi dalam rumah tersangka
    HackingScene.ts      # minigame sirkuit logika (bobol komputer)
index.html             # markup + CSS (toast, dpad, tombol aksi, panel hacking)
```

Tiap "mode" di kode HTML lama (`map` / `interior` / `hacking`) sekarang jadi
Phaser `Scene` terpisah, dikelola lewat `scene.pause()/launch()/resume()`
supaya transisinya mulus dan gampang dikembangkan (mis. nambah Scene
`Chapter2Scene` tinggal daftarkan di `main.ts`).

## Menjalankan

```bash
npm install
npm run dev       # buka http://localhost:5173
```

Build untuk produksi:

```bash
npm run build      # hasil di dist/
npm run preview
```

## Menyiapkan spritesheet (opsional)

Game ini jalan tanpa spritesheet (tampilan pakai bentuk geometris/warna,
seperti di `MapScene.ts` sekarang). Kalau mau pakai sprite karakter asli
dari file HTML lama kamu, ekstrak base64-nya jadi file PNG:

```bash
# di terminal, dari folder yang ada index.html LAMA kamu:
node -e "
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const match = html.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/);
fs.writeFileSync('public/assets/spritesheet.png', Buffer.from(match[1], 'base64'));
"
```

Lalu di `MapScene.ts` / `InteriorScene.ts`, ganti `this.add.circle(...)` untuk
avatar/NPC dengan `this.add.sprite(x, y, 'sheet', frameIndex)` — daftar frame
mengikuti urutan grid 16×16 di spritesheet (lihat komentar `SPRITES` di
`index.html` lama untuk peta nama→koordinat).

## Kesetiaan terhadap versi HTML asli

Versi ini disusun ulang supaya **sama persis** secara visual & perilaku dengan
`index.html` lama kamu, bukan cuma "terinspirasi dari":

- **Spritesheet asli** (Kenney "RPG Urban Pack") di-embed langsung di
  `BootScene.ts` sebagai data URI — karakter (`A`/pemain, `B` Rina, `C` Bu Siti,
  `D` Pak Budi, `E` pemilik rumah, `F` Bos), tile tanah, jalan, pohon, dinding,
  pintu, jendela — semuanya sprite yang sama, bukan bentuk geometris.
- **3 panel terpisah** (`mapView` / `interiorView` / `hackView`) dengan id,
  class, dan teks CSS yang identik dengan HTML lama — termasuk tombol
  (`baksoBtn`, `enterBtn`, `reportBtn`, `computerBtn`, `checkBtn`, dst),
  dpad (`btnUp`.../`i_btnUp`...), dan copy hacking terminal
  ("&gt; Menyusup ke rumah target...", dsb).
- **Nilai logika identik**: radius `nearHouse` (75), `nearDoor` (34),
  `nearNPC` (44), `nearBoss` (40); kenaikan/penurunan kecurigaan
  (+0.35 / -0.15 per frame); interval waktu 25 detik + countdown
  `(ganti dlm Xs)`; kecepatan NPC (1.0), pemilik rumah (1.4), pemain (3
  di peta / 2.6 di interior); semua teks toast & pesan hasil hacking
  (termasuk detail "Rp 500.000.000 ke rekening luar negeri...").
- **Pola observasi** (`observationLog`) meniru perbedaan asli: pengamatan
  pasif di peta hanya mencatat sekali per slot (`recordObservationIfNew`),
  sedangkan aksi "Coba Masuk" selalu menimpa catatan (`setObservation`) —
  persis seperti `tryEnter()` vs `mapLoop()` di kode lama.
- Interior rumah: sofa, meja, kompor 2 tungku, meja dapur, meja komputer,
  monitor berkedip tiap 500ms, garis lantai kayu — semua posisi & warna
  disalin dari `drawInterior()` asli.

## Perbedaan implementasi (bukan perilaku) dari versi HTML asli

- Kamera Map Scene otomatis mengikuti pemain lewat `cameras.main.startFollow`
  Phaser (dulu manual `camX/camY` per frame) — hasil akhirnya sama:
  viewport 360×300 mengikuti pemain dengan batas dunia 700×600.
- Transisi antar mode pakai `Scene.pause()/launch()/resume()` Phaser,
  bukan show/hide `<div>` manual — tapi tetap menoggle `display` panel yang
  sama supaya DOM-nya terlihat identik.
- Minigame hacking tetap memakai `<canvas id="circuit">` mentah + Canvas 2D
  API (persis kode aslinya), hanya dibungkus siklus hidup `HackingScene`
  Phaser untuk pause/resume yang rapi saat masuk/keluar minigame.

## Langkah lanjutan yang disarankan

- Pindahkan `GATES`/`HACK_TARGET` di `HackingScene.ts` ke file level baru
  kalau mau tambah beberapa "chapter" hacking dengan pola berbeda.
- Tambahkan `Phaser.Sound` untuk SFX (klik gerbang, firewall bobol, dll).
- Simpan progres (`GameState`) ke `localStorage` supaya chapter tidak reset
  saat refresh.

## Riwayat versi

- **0.1** — Fondasi: peta dan pemain berjalan
- **0.2** — Jam desa dan catatan pengamatan
- **0.3** — Warga desa dan dialog
- **0.4** — Briefing Bos
- **0.5** — Kecurigaan warga
- **0.6** — Masuk rumah target
- **0.7** — Membobol komputer dan bukti
- **0.8** — Lapor ke Bos dan Mission Complete
- **0.9** — Warga hidup
- **0.10** — Gerobak bakso
- **0.11** — Pemilik rumah
- **0.12** — Chapter 2–6
- **0.13** — Stealth: CCTV dan penjaga
- **1.0** — Menu, simpan progres, simulasi, layar penuh
