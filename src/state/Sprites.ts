import type { Direction } from './GameState';

/**
 * Karakter memakai spritesheet buatan sendiri: public/assets/characters/karakter_sheet.png
 *   96 x 144 px = 6 kolom x 9 baris, tiap frame 16x16 px.
 *   Kolom (kiri->kanan): 0 depan, 1 belakang, 2 samping | 3 depan(langkah), 4 belakang(langkah), 5 samping(langkah)
 *   Sprite "samping" menghadap KANAN; arah kiri memakai flipX.
 *   Baris -> charKey (dipakai di Chapters.ts & MapScene.ts), lihat CHAR_ROW:
 *     A = topi merah (pemain)     B = seragam putih/dasi merah    C = hijab pink
 *     D = rompi cokelat           F = seragam hijau (Bos)         G = ikat kepala merah, baju biru
 *     H = kemeja ungu             I = kakek rompi oranye          E = berkerudung gelap (pemilik rumah)
 * Gerobak bakso: public/assets/characters/gerobak_bakso.png (64x32 = 2 frame 32x32, animasi uap).
 */
export const CHAR_COLS = 6;
export const CHAR_ROWS = 9;
/** URL spritesheet karakter (sama dgn yang di-load BootScene) — dipakai potret dialog di Hud.ts. */
export const CHAR_SHEET_URL = 'assets/characters/karakter_sheet.png';
export const CHAR_W = 16;
export const CHAR_H = 16;
export const CART_W = 32;
export const CART_H = 32;

/** Skala tampilan karakter & gerobak di dunia (karakter 16px -> 24px, gerobak 32px -> 48px). Ubah angka ini kalau mau lebih besar/kecil. */
export const CHAR_SCALE_MAP = 1.5;
/** Tinggi karakter di dunia (px) — dipakai utk posisi emoji/label di atas kepala. */
export const CHAR_HEIGHT_MAP = CHAR_H * CHAR_SCALE_MAP;

const CHAR_ROW: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, F: 4, G: 5, H: 6, I: 7, E: 8 };
const DIR_COL: Record<string, number> = { down: 0, up: 1, side: 2 };

/**
 * Mengembalikan index frame spritesheet 'sheet' + apakah perlu di-flip horizontal
 * (arah kiri me-reuse sprite "samping" yang menghadap kanan). walkFrame 1 = frame langkah (kolom +3).
 */
export function charFrame(charKey: string, dir: Direction | null, walkFrame: 0 | 1): { frame: number; flipX: boolean } {
  const d = dir || 'down';
  const flipX = d === 'left';
  const key = d === 'left' || d === 'right' ? 'side' : d;
  const row = CHAR_ROW[charKey] ?? 0;
  return { frame: row * CHAR_COLS + DIR_COL[key] + walkFrame * 3, flipX };
}