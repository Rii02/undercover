import Phaser from 'phaser';
import { CHAPTERS } from '../state/Chapters';
import { CHAR_W, CHAR_H, CART_W, CART_H } from '../state/Sprites';

/** Memuat semua aset, lalu langsung masuk ke MapScene. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // Karakter: 6 kolom x 9 baris, frame 16x16 (susunan dijelaskan di Sprites.ts).
    this.load.spritesheet('sheet', 'assets/characters/karakter_sheet.png', { frameWidth: CHAR_W, frameHeight: CHAR_H });

    // Gerobak bakso milik pemain (2 frame animasi).
    this.load.spritesheet('gerobak', 'assets/characters/gerobak_bakso.png', { frameWidth: CART_W, frameHeight: CART_H });

    // Peta Tiled tiap chapter (key & file didefinisikan di CHAPTERS[i].map).
    for (const ch of CHAPTERS) {
      this.load.tilemapTiledJSON(ch.map.key, ch.map.file);
      this.load.tilemapTiledJSON(ch.interiorMap.key, ch.interiorMap.file);   // peta interior
    }

    // Tileset dipakai bersama oleh semua peta. Nama di Tiled dipetakan ke key ini lewat TILESETS di MapScene.ts.
    this.load.image('tiles_city', 'assets/tilesets/city.png');
    this.load.image('tiles_tiny', 'assets/tilesets/tiny-town.png');
    this.load.image('tiles_town', 'assets/tilesets/buildings-country_town_clean.png');
    this.load.image('tiles_overlay', 'assets/tilesets/overlay.png');
    this.load.image('tiles_interior', 'assets/tilesets/interior.png');   // tileset 'interior-kustom', hanya dipakai peta interior

    // Kalau ada file yang gagal dimuat (path salah / typo), tampilkan jelas di Console.
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error(`[Boot] Gagal memuat "${file.key}" dari "${file.src}" — cek path & nama file di public/assets/`);
    });
  }

  create(): void {
    if (!this.anims.exists('gerobak_idle')) {
      this.anims.create({ key: 'gerobak_idle', frames: this.anims.generateFrameNumbers('gerobak', { start: 0, end: 1 }), frameRate: 3, repeat: -1 });
    }
    this.scene.start('Map');
  }
}
