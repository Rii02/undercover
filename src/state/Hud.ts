import { GameState, SLOT_ICON, SLOTS } from './GameState';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Helper untuk elemen DOM di index.html (jam, toast, tabel catatan). */
export const Hud = {
  clockIcon: $('clockIcon'),
  clockLabel: $('clockLabel'),
  clockCountdown: $('clockCountdown'),
  toast: $('toast'),
  logTable: $<HTMLTableElement>('logTable'),
  talkBtn: $<HTMLButtonElement>('talkBtn'),

  // ---- Kotak dialog (ala RPG) ----
  dialogBox: $('dialogBox'),
  dialogName: $('dialogName'),
  dialogText: $('dialogText'),

  setToast(text: string, color = '#f5a623'): void {
    this.toast.textContent = text;
    this.toast.style.color = color;
  },

  /** Tampilkan satu baris obrolan + petunjuk "tekan E / ketuk buat lanjut". */
  showDialogue(name: string, text: string): void {
    this.dialogName.textContent = name;
    this.dialogText.textContent = text;
    this.dialogBox.classList.add('show');
  },
  hideDialogue(): void {
    this.dialogBox.classList.remove('show');
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
