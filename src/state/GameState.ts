import { CHAPTERS, ChapterConfig } from './Chapters';

export type TimeSlot = 'Pagi' | 'Siang' | 'Sore' | 'Malam';
export type HouseStatus = 'ada' | 'kosong';
export type Direction = 'up' | 'down' | 'left' | 'right';

export const SLOTS: TimeSlot[] = ['Pagi', 'Siang', 'Sore', 'Malam'];
export const SLOT_ICON: Record<TimeSlot, string> = { Pagi: '🌅', Siang: '☀️', Sore: '🌇', Malam: '🌙' };

/** Berapa lama (ms) satu slot waktu berlangsung. */
export const TIME_INTERVAL_MS = 25_000;

function emptyLog(): Record<TimeSlot, HouseStatus | null> {
  return { Pagi: null, Siang: null, Sore: null, Malam: null };
}

/** State global yang dipakai lintas Scene (lewat game.registry). */
export class GameState {
  chapterIndex = 0;
  slotIdx = 0;
  /** Kecurigaan warga 0..100: naik kalau pemain nongkrong dekat rumah target, turun kalau menjauh. */
  suspicion = 0;
  /** True setelah minigame hacking berhasil (bukti sudah diambil). */
  caseSolved = false;
  observationLog: Record<TimeSlot, HouseStatus | null> = emptyLog();
  nextTimeChange = Date.now() + TIME_INTERVAL_MS;

  get chapter(): ChapterConfig { return CHAPTERS[this.chapterIndex]; }
  get currentSlot(): TimeSlot { return SLOTS[this.slotIdx]; }
  get currentStatus(): HouseStatus { return this.chapter.schedulePattern[this.currentSlot]; }

  advanceTime(): void {
    this.slotIdx = (this.slotIdx + 1) % SLOTS.length;
    this.nextTimeChange = Date.now() + TIME_INTERVAL_MS;
  }

  /** Catat status rumah untuk slot saat ini bila belum pernah diamati. Mengembalikan true kalau baru tercatat. */
  recordObservationIfNew(): boolean {
    const slot = this.currentSlot;
    if (this.observationLog[slot] !== null) return false;
    this.observationLog[slot] = this.currentStatus;
    return true;
  }

  /** Dipanggil dari aksi "Coba Masuk": selalu menimpa catatan slot saat ini (beda dengan pengamatan pasif di peta). */
  setObservation(): void {
    this.observationLog[this.currentSlot] = this.currentStatus;
  }
}

export function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x1 - x2, y1 - y2);
}

export function dirFromDelta(dx: number, dy: number): Direction | null {
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  if (dy !== 0) return dy < 0 ? 'up' : 'down';
  return null;
}
