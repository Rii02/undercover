import type { Direction } from './GameState';

/**
 * Spritesheet karakter: public/assets/characters/karakter_sheet.png
 *   96 x 144 px = 6 kolom x 9 baris, tiap frame 16x16 px.
 *   Kolom: 0 depan, 1 belakang, 2 samping | 3 depan(langkah), 4 belakang(langkah), 5 samping(langkah)
 *   Sprite "samping" menghadap KANAN; arah kiri memakai flipX.
 *   Baris (charKey): A = pemain (topi merah); B, C, D, F, G, H, I, E = NPC (dipakai di commit berikutnya)
 */
export const CHAR_COLS = 6;
export const CHAR_W = 16;
export const CHAR_H = 16;
/** Skala tampilan karakter di dunia (16px -> 24px). */
export const CHAR_SCALE_MAP = 1.5;
/** Tinggi karakter di dunia (px), dipakai untuk menaruh emoji/label di atas kepala. */
export const CHAR_HEIGHT_MAP = CHAR_H * CHAR_SCALE_MAP;

const CHAR_ROW: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, F: 4, G: 5, H: 6, I: 7, E: 8 };
const DIR_COL: Record<string, number> = { down: 0, up: 1, side: 2 };

/** Index frame + apakah perlu flip horizontal. walkFrame 1 = frame langkah (kolom +3). */
export function charFrame(charKey: string, dir: Direction, walkFrame: 0 | 1): { frame: number; flipX: boolean } {
  const flipX = dir === 'left';
  const key = dir === 'left' || dir === 'right' ? 'side' : dir;
  const row = CHAR_ROW[charKey] ?? 0;
  return { frame: row * CHAR_COLS + DIR_COL[key] + walkFrame * 3, flipX };
}
