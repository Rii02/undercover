import type { TimeSlot, HouseStatus } from './GameState';

/**
 * Penyimpanan progres di localStorage supaya refresh halaman tidak mengembalikan pemain ke menu awal.
 * Yang disimpan: mode (menu/story/sim), chapter, slot waktu, catatan observasi, status kasus, & apakah briefing sudah dibaca.
 * Yang TIDAK disimpan: posisi pemain/NPC, isi interior, dan progres minigame — pemain kembali ke titik awal peta chapter itu.
 */
export type GameMode = 'menu' | 'story' | 'sim';

export interface SaveData {
  v: 1;
  mode: GameMode;
  chapterIndex: number;
  slotIdx: number;
  observationLog: Record<TimeSlot, HouseStatus | null>;
  caseSolved: boolean;
  briefingSeen: boolean;
  /** Ada Story yang belum tamat (dipakai tombol "Lanjutkan Story" di menu). Opsional utk kompatibilitas simpanan lama. */
  storyInProgress?: boolean;
  /** Nama panggilan pemain (karakter Story). Opsional utk kompatibilitas simpanan lama. */
  playerName?: string;
  /** Jumlah salah menekan EKSEKUSI_BOBOL() per chapter (indeks = chapterIndex). Skor dihitung dari sini. */
  chapterErrors?: number[];
  /** Skor total saat disimpan (hanya catatan; saat dimuat skor dihitung ulang dari chapterErrors). */
  score?: number;
}

const KEY = 'detektifBakso.save.v1';

export const SaveGame = {
  read(): SaveData | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || d.v !== 1 || !['menu', 'story', 'sim'].includes(d.mode)) return null;
      if (!Number.isInteger(d.chapterIndex) || !Number.isInteger(d.slotIdx)) return null;
      return d as SaveData;
    } catch {
      return null; // storage diblokir / data rusak -> mulai dari menu
    }
  },
  write(d: SaveData): void {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* abaikan: mis. mode privat */ }
  },
  clear(): void {
    try { localStorage.removeItem(KEY); } catch { /* abaikan */ }
  }
};