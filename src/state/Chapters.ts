/** Peta Tiled milik satu chapter + titik awal pemain (px dunia). */
export interface MapConfig {
  /** Key Phaser untuk tilemap ini (di-load di BootScene). */
  key: string;
  /** Path file peta (relatif ke folder public/). */
  file: string;
  spawn: { x: number; y: number };
}

/** Satu chapter = satu objek konfigurasi. Chapter baru cukup menambah entri di CHAPTERS. */
export interface ChapterConfig {
  id: number;
  title: string;
  map: MapConfig;
}

export const CHAPTERS: ChapterConfig[] = [
  {
    id: 1,
    title: 'Jejak Pertama',
    map: { key: 'map1', file: 'assets/maps/ch1.json', spawn: { x: 440, y: 408 } }
  }
];
