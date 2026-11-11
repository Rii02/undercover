import { CHAPTERS, ChapterConfig } from './Chapters';
import { SaveGame, SaveData, GameMode } from './SaveGame';

export type TimeSlot = 'Pagi' | 'Siang' | 'Sore' | 'Malam';
export type HouseStatus = 'ada' | 'kosong';
export type Direction = 'up' | 'down' | 'left' | 'right';

export const SLOTS: TimeSlot[] = ['Pagi', 'Siang', 'Sore', 'Malam'];
export const SLOT_ICON: Record<TimeSlot, string> = {
  Pagi: '🌅', Siang: '☀️', Sore: '🌇', Malam: '🌙'
};

export const TIME_INTERVAL_MS = 25_000;

/** Skor Story: mulai 100, dikurangi 5 tiap salah menekan EKSEKUSI_BOBOL(), tidak pernah di bawah 0. */
export const SCORE_START = 100;
export const SCORE_PENALTY = 5;

/** Nama bawaan karakter kalau pemain belum mengisi nama (mis. simpanan lama). */
export const DEFAULT_PLAYER_NAME = 'Aku';
export const MAX_PLAYER_NAME = 12;

/** Bersihkan input nama: buang karakter kontrol & spasi ganda, potong ke MAX_PLAYER_NAME. Hasil kosong = tidak valid. */
export function sanitizePlayerName(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_PLAYER_NAME).trim();
}

function emptyErrors(): number[] {
  return CHAPTERS.map(() => 0);
}

function emptyLog(): Record<TimeSlot, HouseStatus | null> {
  return { Pagi: null, Siang: null, Sore: null, Malam: null };
}

/**
 * State global yang dipakai lintas Scene (Map, Interior, Hacking).
 * Dipasang di game.registry supaya semua Scene bisa baca/tulis tanpa saling import.
 *
 * Semua data yang berbeda tiap chapter (pola jadwal rumah, target hacking, dst) TIDAK lagi
 * di-hardcode di sini — diambil langsung dari CHAPTERS[chapterIndex] lewat getter `chapter`.
 * loadChapter() dipanggil tiap kali pindah chapter untuk mereset progres (waktu, observationLog,
 * kecurigaan, dll) sesuai chapter baru, tanpa perlu mengubah logika inti di Scene manapun.
 */
export class GameState {
  chapterIndex = 0;
  slotIdx = 0;
  suspicion = 0;
  observationLog: Record<TimeSlot, HouseStatus | null> = emptyLog();
  missionReported = false;   // sengaja TIDAK disimpan: refresh saat laporan -> pemain melapor ulang (hindari soft-lock)
  nextTimeChange = Date.now() + TIME_INTERVAL_MS;
  /** Mode yang sedang dimainkan; dipakai BootScene untuk melanjutkan setelah refresh. */
  mode: GameMode = 'menu';
  /** true = ada Story yang sedang berjalan & belum tamat -> menu menawarkan "Lanjutkan Story". */
  storyInProgress = false;
  /** Nama panggilan karakter pemain di mode Story (diisi di menu saat memulai Story baru). */
  playerName = '';
  /** Jumlah kesalahan EKSEKUSI_BOBOL() per chapter. Skor total diturunkan dari sini (satu skor untuk seluruh chapter). */
  chapterErrors: number[] = emptyErrors();

  // Perubahan caseSolved & briefingSeen otomatis menyimpan progres.
  private _caseSolved = false;
  private _briefingSeen = false;
  private quiet = false;   // true = tahan penyimpanan (mis. saat loadChapter/restore)

  get caseSolved(): boolean { return this._caseSolved; }
  set caseSolved(v: boolean) { this._caseSolved = v; this.save(); }
  /** Briefing chapter ini sudah dibaca? Kalau ya, refresh tidak memutar ulang briefing. */
  get briefingSeen(): boolean { return this._briefingSeen; }
  set briefingSeen(v: boolean) { this._briefingSeen = v; this.save(); }

  /** Simpan progres ke localStorage. */
  save(): void {
    if (this.quiet) return;
    SaveGame.write({
      v: 1, mode: this.mode, chapterIndex: this.chapterIndex, slotIdx: this.slotIdx,
      observationLog: { ...this.observationLog }, caseSolved: this._caseSolved, briefingSeen: this._briefingSeen,
      storyInProgress: this.storyInProgress, playerName: this.playerName,
      chapterErrors: [...this.chapterErrors], score: this.score
    });
  }

  /** Pulihkan progres dari simpanan (dipanggil BootScene). Data diperiksa dulu supaya simpanan rusak tidak merusak game. */
  restore(d: SaveData): void {
    this.quiet = true;
    this.mode = d.mode;
    this.storyInProgress = d.storyInProgress ?? d.mode === 'story';
    this.playerName = typeof d.playerName === 'string' ? sanitizePlayerName(d.playerName) : '';
    // Simpanan lama (tanpa skor) / data rusak -> mulai dari 0 kesalahan. Skor selalu dihitung ulang dari jumlah kesalahan.
    const errs = emptyErrors();
    if (Array.isArray(d.chapterErrors)) {
      errs.forEach((_, i) => { const v = d.chapterErrors![i]; errs[i] = Number.isInteger(v) && v > 0 ? v : 0; });
    }
    this.chapterErrors = errs;
    this.chapterIndex = Math.min(Math.max(0, d.chapterIndex), CHAPTERS.length - 1);
    this.slotIdx = ((d.slotIdx % SLOTS.length) + SLOTS.length) % SLOTS.length;
    const log = emptyLog();
    for (const s of SLOTS) { const v = d.observationLog?.[s]; log[s] = v === 'ada' || v === 'kosong' ? v : null; }
    this.observationLog = log;
    this._caseSolved = !!d.caseSolved;
    this._briefingSeen = !!d.briefingSeen;
    this.missionReported = false;
    this.suspicion = 0;
    this.nextTimeChange = Date.now() + TIME_INTERVAL_MS;
    this.quiet = false;
  }

  // ---------------- skor ----------------
  /** Total salah EKSEKUSI_BOBOL() sepanjang Story. */
  get totalErrors(): number {
    return this.chapterErrors.reduce((a, b) => a + b, 0);
  }

  /** Kesalahan di chapter yang sedang dimainkan. */
  get chapterErrorCount(): number {
    return this.chapterErrors[this.chapterIndex] ?? 0;
  }

  /** Skor total: 100 dikurangi 5 per kesalahan, minimum 0. Hanya kesalahan EKSEKUSI_BOBOL() yang menghitung. */
  get score(): number {
    return Math.max(0, SCORE_START - SCORE_PENALTY * this.totalErrors);
  }

  /** Catat satu kali salah menekan EKSEKUSI_BOBOL() (rangkaian belum sesuai tabel target), simpan otomatis. Mengembalikan skor baru. */
  recordWrongExecution(): number {
    this.chapterErrors[this.chapterIndex] = this.chapterErrorCount + 1;
    this.save();
    return this.score;
  }

  /** Kembalikan skor ke 100 (dipanggil saat Story baru dimulai). */
  resetScore(): void {
    this.chapterErrors = emptyErrors();
    this.save();
  }

  /** Nama yang ditampilkan di dialog (nama panggilan, atau 'Aku' kalau belum diisi). */
  get displayName(): string {
    return this.playerName || DEFAULT_PLAYER_NAME;
  }

  get chapter(): ChapterConfig {
    return CHAPTERS[this.chapterIndex];
  }

  get hasNextChapter(): boolean {
    return this.chapterIndex + 1 < CHAPTERS.length;
  }

  get currentSlot(): TimeSlot {
    return SLOTS[this.slotIdx];
  }

  get currentStatus(): HouseStatus {
    return this.chapter.schedulePattern[this.currentSlot];
  }

  advanceTime(): void {
    this.slotIdx = (this.slotIdx + 1) % SLOTS.length;
    this.nextTimeChange = Date.now() + TIME_INTERVAL_MS;
    this.save();
  }

  /** Dipanggil terus-menerus saat pemain dekat rumah (mapLoop) — hanya mencatat jika belum pernah diamati di slot ini. */
  recordObservationIfNew(): boolean {
    const slot = this.currentSlot;
    if (this.observationLog[slot] === null) {
      this.observationLog[slot] = this.currentStatus;
      this.save();
      return true;
    }
    return false;
  }

  /** Dipanggil dari aksi "Coba Masuk" — selalu menimpa catatan slot saat ini, sama seperti tryEnter() asli. */
  setObservation(): void {
    this.observationLog[this.currentSlot] = this.currentStatus;
    this.save();
  }

  /** Reset penuh state permainan (waktu, kecurigaan, log observasi, status kasus) untuk chapter `idx`. */
  loadChapter(idx: number): void {
    this.quiet = true;
    this.chapterIndex = idx;
    this.slotIdx = 0;
    this.suspicion = 0;
    this.observationLog = emptyLog();
    this.caseSolved = false;
    this.briefingSeen = false;
    this.missionReported = false;
    this.nextTimeChange = Date.now() + TIME_INTERVAL_MS;
    this.quiet = false;
    this.save();
  }
}

export function dirFromDelta(dx: number, dy: number): Direction | null {
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  if (dy !== 0) return dy < 0 ? 'up' : 'down';
  return null;
}

export function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x1 - x2, y1 - y2);
}