import type { TimeSlot, HouseStatus } from './GameState';

/** Peta Tiled milik satu chapter + titik-titik pentingnya (px dunia). */
export interface MapConfig {
  /** Key Phaser untuk tilemap ini (di-load di BootScene). */
  key: string;
  /** Path file peta (relatif ke folder public/). */
  file: string;
  spawn: { x: number; y: number };
  /** Persegi bangunan rumah target. */
  house: { x: number; y: number; w: number; h: number };
}

/** Satu chapter = satu objek konfigurasi. Chapter baru cukup menambah entri di CHAPTERS. */
export interface ChapterConfig {
  id: number;
  title: string;
  /** Tujuan chapter, ditampilkan sebagai toast saat game mulai. */
  objective: string;
  suspectName: string;
  map: MapConfig;
  /** Jadwal rumah target: kapan ada orang / kosong. */
  schedulePattern: Record<TimeSlot, HouseStatus>;
}

export const CHAPTERS: ChapterConfig[] = [
  {
    id: 1,
    title: 'Jejak Pertama',
    objective: 'Cari tahu kapan rumah Pak Herman kosong. Dekati rumahnya di tiap waktu dan catat hasilnya.',
    suspectName: 'Pak Herman',
    map: {
      key: 'map1', file: 'assets/maps/ch1.json',
      spawn: { x: 440, y: 408 },
      house: { x: 800, y: 192, w: 112, h: 128 }
    },
    schedulePattern: { Pagi: 'ada', Siang: 'ada', Sore: 'kosong', Malam: 'ada' }
  }
];
