import Phaser from 'phaser';
import { CHAPTERS } from '../state/Chapters';
import { CHAR_W, CHAR_H } from '../state/Sprites';

/** Memuat semua aset, lalu langsung masuk ke MapScene. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // Karakter: 6 kolom x 9 baris, frame 16x16 (susunan dijelaskan di Sprites.ts).
    this.load.spritesheet('sheet', 'assets/characters/karakter_sheet.png', { frameWidth: CHAR_W, frameHeight: CHAR_H });

    // Peta Tiled tiap chapter (key & file didefinisikan di CHAPTERS[i].map).
    for (const ch of CHAPTERS) this.load.tilemapTiledJSON(ch.map.key, ch.map.file);

    // Tileset dipakai bersama oleh semua peta. Nama di Tiled dipetakan ke key ini lewat TILESETS di MapScene.ts.
    this.load.image('tiles_city', 'assets/tilesets/city.png');
    this.load.image('tiles_tiny', 'assets/tilesets/tiny-town.png');
    this.load.image('tiles_town', 'assets/tilesets/buildings-country_town_clean.png');
    this.load.image('tiles_overlay', 'assets/tilesets/overlay.png');

    // Kalau ada file yang gagal dimuat (path salah / typo), tampilkan jelas di Console.
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error(`[Boot] Gagal memuat "${file.key}" dari "${file.src}" — cek path & nama file di public/assets/`);
    });
  }

  create(): void {
    this.scene.start('Map');
  }
}
