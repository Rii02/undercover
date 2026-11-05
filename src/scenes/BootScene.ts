import Phaser from 'phaser';
import { CHAPTERS } from '../state/Chapters';
import { CHAR_W, CHAR_H, CART_W, CART_H } from '../state/Sprites';
import { GameState } from '../state/GameState';
import { SaveGame } from '../state/SaveGame';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // Karakter: 6 kolom x 9 baris, frame 16x16 (susunan dijelaskan di Sprites.ts).
    this.load.spritesheet('sheet', 'assets/characters/karakter_sheet.png', { frameWidth: CHAR_W, frameHeight: CHAR_H });
    // Gerobak bakso: 2 frame 32x32 (animasi uap).
    this.load.spritesheet('gerobak', 'assets/characters/gerobak_bakso.png', { frameWidth: CART_W, frameHeight: CART_H });

    // Peta Tiled tiap chapter (key & file didefinisikan di CHAPTERS[i].map pada Chapters.ts).
    for (const ch of CHAPTERS) {
      this.load.tilemapTiledJSON(ch.map.key, ch.map.file);
      this.load.tilemapTiledJSON(ch.interiorMap.key, ch.interiorMap.file); // peta interior
    }
    // Gambar tileset — dipakai bersama oleh SEMUA peta. Nama di Tiled ('city', 'tiny-town',
    // 'buildings-country_town', 'overlay-suasana') dipetakan ke key ini lewat TILESETS di MapScene.ts.
    this.load.image('tiles_city', 'assets/tilesets/city.png');                          // 592x448
    this.load.image('tiles_tiny', 'assets/tilesets/tiny-town.png');                     // 192x176
    this.load.image('tiles_town', 'assets/tilesets/buildings-country_town_clean.png');  // 320x1088
    this.load.image('tiles_overlay', 'assets/tilesets/overlay.png');                    // 128x32
    this.load.image('tiles_interior', 'assets/tilesets/interior.png');                  // 256x144 (tileset 'interior-kustom', hanya dipakai peta interior)

    // Kalau ada file yang gagal dimuat (path salah / typo), tampilkan jelas di Console.
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error(`[Boot] Gagal memuat "${file.key}" dari "${file.src}" — cek path & nama file di public/assets/`);
    });
  }

  create(): void {
    if (!this.anims.exists('gerobak_idle')) {
      this.anims.create({ key: 'gerobak_idle', frames: this.anims.generateFrameNumbers('gerobak', { start: 0, end: 1 }), frameRate: 3, repeat: -1 });
    }
    // Ada simpanan (refresh halaman)? Lanjutkan langsung ke mode terakhir, jangan balik ke menu awal.
    const save = SaveGame.read();
    const state = this.registry.get('state') as GameState;
    if (save) state.restore(save);   // progres selalu dimuat ke memori (dipakai juga tombol "Lanjutkan Story" di menu)
    if (save && (save.mode === 'story' || save.mode === 'sim')) {
      document.getElementById('modeOverlay')?.classList.remove('show');
      if (save.mode === 'story') this.scene.start('Map');             // briefing tidak diputar ulang kalau sudah dibaca
      else this.scene.start('Hacking', { mode: 'sim' });
      return;
    }
    // Tidak ada simpanan / terakhir di menu: tampilkan popup pilih mode (Story / Simulasi).
    this.scene.start('Menu');
  }
}