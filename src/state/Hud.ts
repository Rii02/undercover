import { GameState, SLOT_ICON, SLOTS } from './GameState';
import { DialogueLine } from './Chapters';

const STORY_SPEAKER: Record<DialogueLine['speaker'], string> = {
  Bos: '📞 Bos', Aku: '🧑 Aku', Narasi: '📖 Narasi'
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Helper untuk elemen DOM di index.html (jam, toast, tabel catatan). */
export const Hud = {
  clockIcon: $('clockIcon'),
  clockLabel: $('clockLabel'),
  clockCountdown: $('clockCountdown'),
  toast: $('toast'),
  susBar: $<HTMLDivElement>('susBar'),
  logTable: $<HTMLTableElement>('logTable'),
  talkBtn: $<HTMLButtonElement>('talkBtn'),
  enterBtn: $<HTMLButtonElement>('enterBtn'),
  cartBtn: $<HTMLButtonElement>('cartBtn'),
  reportBtn: $<HTMLButtonElement>('reportBtn'),
  computerBtn: $<HTMLButtonElement>('computerBtn'),
  interiorHint: $('interiorHint'),
  interiorHeader: $('interiorHeader'),

  // ---- Kotak dialog (ala RPG) ----
  dialogBox: $('dialogBox'),
  dialogName: $('dialogName'),
  dialogText: $('dialogText'),
  dialogHint: $('dialogHint'),
  dialogCtaBtn: $<HTMLButtonElement>('dialogCtaBtn'),

  setToast(text: string, color = '#f5a623'): void {
    this.toast.textContent = text;
    this.toast.style.color = color;
  },

  /** Tampilkan satu baris obrolan + petunjuk "tekan E / ketuk buat lanjut". */
  showDialogue(name: string, text: string): void {
    this.dialogName.textContent = name;
    this.dialogText.textContent = text;
    this.dialogCtaBtn.style.display = 'none';
    this.dialogHint.style.display = 'block';
    this.dialogBox.classList.add('show');
  },
  hideDialogue(): void {
    this.dialogBox.classList.remove('show');
  },

  /** Satu baris cerita Bos <-> Aku. Baris terakhir menukar petunjuk "lanjut" jadi tombol aksi besar (ctaLabel). */
  showStoryLine(line: DialogueLine, isLast: boolean, ctaLabel: string): void {
    this.dialogName.textContent = STORY_SPEAKER[line.speaker];
    this.dialogText.textContent = line.text;
    this.dialogHint.style.display = isLast ? 'none' : 'block';
    this.dialogCtaBtn.style.display = isLast ? 'block' : 'none';
    this.dialogCtaBtn.textContent = ctaLabel;
    this.dialogBox.classList.add('show');
  },
  hideStoryLine(): void {
    this.dialogBox.classList.remove('show');
    this.dialogCtaBtn.style.display = 'none';
  },

  updateSuspicion(state: GameState): void {
    this.susBar.style.width = state.suspicion + '%';
  },

  updateClock(state: GameState): void {
    const slot = SLOTS[state.slotIdx];
    this.clockIcon.textContent = SLOT_ICON[slot];
    this.clockLabel.textContent = slot;
  },

  updateClockCountdown(state: GameState): void {
    const secLeft = Math.max(0, Math.ceil((state.nextTimeChange - Date.now()) / 1000));
    this.clockCountdown.textContent = `(ganti dlm ${secLeft}s)`;
  },

  renderLog(state: GameState): void {
    let html = '<tr><th>Pagi</th><th>Siang</th><th>Sore</th><th>Malam</th></tr><tr>';
    for (const slot of SLOTS) {
      const v = state.observationLog[slot];
      html += `<td>${v === null ? '❔' : v === 'kosong' ? '✅ Kosong' : '👤 Ada orang'}</td>`;
    }
    this.logTable.innerHTML = html + '</tr>';
  }
};
