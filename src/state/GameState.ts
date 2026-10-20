import { CHAPTERS, ChapterConfig } from './Chapters';

export type Direction = 'up' | 'down' | 'left' | 'right';

/** State global yang dipakai lintas Scene (lewat game.registry). */
export class GameState {
  chapterIndex = 0;
  get chapter(): ChapterConfig { return CHAPTERS[this.chapterIndex]; }
}

export function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x1 - x2, y1 - y2);
}
