import { GameState, SLOT_ICON, SLOTS, DEFAULT_PLAYER_NAME } from './GameState';
import { ChapterConfig, DialogueLine } from './Chapters';
import { charFrame, CHAR_COLS, CHAR_ROWS, CHAR_W, CHAR_SHEET_URL } from './Sprites';

/** Nama panggilan pemain yang tampil sebagai label pembicara. Diisi MapScene lewat Hud.setPlayerName(). */
let playerName = DEFAULT_PLAYER_NAME;

/** Warna toast yang dipakai game -> variabel CSS bertema (mode gelap nilainya sama persis dengan warna aslinya). */
const TOAST_COLOR_VAR: Record<string, string> = {
  '#f5a623': 'var(--accent-text)', '#00d9a3': 'var(--good-text)',
  '#ff6b6b': 'var(--bad-text)', '#ff5555': 'var(--bad-text)', '#ff9f43': 'var(--warn-text)'
};

/** Label pembicara karakter pemain di kotak dialog (NPC maupun cerita Bos). */
export const playerSpeakerLabel = (): string => `🧑 ${playerName}`;

const STORY_SPEAKER: Record<Exclude<DialogueLine['speaker'], 'Aku'>, string> = {
  Bos: '📞 Bos', Narasi: '📖 Narasi'
};

// ---- Potret karakter di samping dialog: MC SELALU di kiri (menghadap kanan), lawan bicara di kanan (menghadap kiri). ----
// Karakter digambar BESAR dan berdiri DI LUAR kotak dialog: kaki menapak di tepi atas kotak, di sudut kiri (MC) & kanan (lawan bicara).
// Kotak dialog sendiri tidak diubah ukuran/padding-nya, jadi teks tetap lebar.
const PORTRAIT_KEY_MC = 'A';      // topi merah (pemain)
const PORTRAIT_KEY_BOSS = 'F';    // seragam hijau (Bos)

/** Skala bulat (16px x skala) menurut lebar layar, supaya pixel art tetap tajam & teks tetap muat. */
function portraitScale(): number {
  const w = window.innerWidth;
  return w >= 900 ? 10 : w >= 600 ? 8 : 6;
}

const PORTRAIT_CSS = `
#dialogBox.hasPortraits{overflow:visible!important}
.dlgPortrait{position:absolute;bottom:100%;width:var(--dlg-px);height:var(--dlg-px);pointer-events:none;
  transform-origin:50% 100%;transition:opacity .2s,filter .2s;filter:drop-shadow(0 4px 3px rgba(0,0,0,.55))}
.dlgPortrait.left{left:6px}.dlgPortrait.right{right:6px}
.dlgPortrait.dim{opacity:.5;filter:grayscale(.75) drop-shadow(0 4px 3px rgba(0,0,0,.55))}
.dlgPortrait.active{filter:drop-shadow(0 0 7px rgba(61,255,106,.7)) drop-shadow(0 4px 3px rgba(0,0,0,.55));animation:dlg-bob .4s ease-out}
.dlgSprite{width:100%;height:100%;image-rendering:pixelated;background-repeat:no-repeat}
@keyframes dlg-bob{0%{transform:scale(.94)}55%{transform:translateY(-6px) scale(1.04)}100%{transform:none}}
@media (prefers-reduced-motion:reduce){.dlgPortrait.active{animation:none}}`;

let portraitL: HTMLDivElement | null = null;
let portraitR: HTMLDivElement | null = null;

function ensurePortraits(): void {
  if (portraitL && portraitR && portraitL.isConnected) return;
  const box = document.getElementById('dialogBox')!;
  if (!document.getElementById('dlgPortraitStyle')) {
    const st = document.createElement('style');
    st.id = 'dlgPortraitStyle';
    st.textContent = PORTRAIT_CSS;
    document.head.appendChild(st);
  }
  if (getComputedStyle(box).position === 'static') box.style.position = 'relative'; // jangkar posisi potret
  const make = (side: 'left' | 'right') => {
    const p = document.createElement('div');
    p.className = `dlgPortrait ${side}`;
    p.appendChild(Object.assign(document.createElement('div'), { className: 'dlgSprite' }));
    box.appendChild(p);
    return p;
  };
  portraitL = make('left');
  portraitR = make('right');
  box.classList.add('hasPortraits');
}

/** Gambar satu potret. charKey null = sembunyikan. facing = arah hadap (kiri-MC menghadap kanan, kanan-lawan menghadap kiri). */
function paintPortrait(p: HTMLDivElement, charKey: string | null, facing: 'left' | 'right', active: boolean, px: number): void {
  if (!charKey) { p.style.display = 'none'; return; }
  p.style.display = 'block';
  const { frame, flipX } = charFrame(charKey, facing, 0);
  const col = frame % CHAR_COLS, row = Math.floor(frame / CHAR_COLS);
  const s = p.firstElementChild as HTMLDivElement;
  s.style.backgroundImage = `url(${CHAR_SHEET_URL})`;
  s.style.backgroundSize = `${CHAR_COLS * px}px ${CHAR_ROWS * px}px`;
  s.style.backgroundPosition = `-${col * px}px -${row * px}px`;
  s.style.transform = flipX ? 'scaleX(-1)' : '';
  p.classList.toggle('dim', !active);
  p.classList.remove('active');
  if (active) { void p.offsetWidth; p.classList.add('active'); } // ulangi animasi tiap baris
}

/** Pasang potret kiri (MC) & kanan (lawan bicara). `speaker` = siapa yang sedang bicara; null = narasi (keduanya redup). */
function showPortraits(otherKey: string, speaker: 'me' | 'other' | null): void {
  ensurePortraits();
  const px = CHAR_W * portraitScale();
  document.getElementById('dialogBox')!.style.setProperty('--dlg-px', px + 'px');
  paintPortrait(portraitL!, PORTRAIT_KEY_MC, 'right', speaker === 'me', px);
  paintPortrait(portraitR!, otherKey, 'left', speaker === 'other', px);
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export const Hud = {
  clockLabel: $('clockLabel'),
  clockIcon: $('clockIcon'),
  clockCountdown: $('clockCountdown'),
  susBar: $<HTMLDivElement>('susBar'),
  toast: $('toast'),
  logTable: $<HTMLTableElement>('logTable'),
  baksoBtn: $<HTMLButtonElement>('baksoBtn'),
  enterBtn: $<HTMLButtonElement>('enterBtn'),
  reportBtn: $<HTMLButtonElement>('reportBtn'),
  interiorHint: $('interiorHint'),
  interiorHeader: $('interiorHeader'),
  computerBtn: $<HTMLButtonElement>('computerBtn'),
  subLabel: $('sub'),

  // ---- Dialog box (ala RPG/visual novel) — dipakai jg utk dialog cerita Bos<->Aku ----
  dialogBox: $('dialogBox'),
  dialogName: $('dialogName'),
  dialogText: $('dialogText'),
  dialogCtaBtn: $<HTMLButtonElement>('dialogCtaBtn'),
  dialogHint: $('dialogHint'),

  setToast(text: string, color = '#f5a623'): void {
    this.toast.textContent = text;
    // Warna teks toast dipetakan ke variabel tema supaya tetap terbaca di mode terang & gelap.
    this.toast.style.color = TOAST_COLOR_VAR[color.toLowerCase()] ?? color;
  },

  updateClock(state: GameState): void {
    const slot = SLOTS[state.slotIdx];
    this.clockIcon.textContent = SLOT_ICON[slot];
    this.clockLabel.textContent = slot;
  },

  /** Sama seperti updateClockCountdown() asli — dipanggil tiap 1 detik. */
  updateClockCountdown(state: GameState): void {
    const secLeft = Math.max(0, Math.ceil((state.nextTimeChange - Date.now()) / 1000));
    this.clockCountdown.textContent = `(ganti dlm ${secLeft}s)`;
  },

  updateSuspicion(state: GameState): void {
    this.susBar.style.width = state.suspicion + '%';
  },

  renderLog(state: GameState): void {
    let html = '<tr><th>Pagi</th><th>Siang</th><th>Sore</th><th>Malam</th></tr><tr>';
    for (const slot of SLOTS) {
      const v = state.observationLog[slot];
      html += `<td>${v === null ? '❔' : v === 'kosong' ? '✅ Kosong' : '👤 Ada orang'}</td>`;
    }
    html += '</tr>';
    this.logTable.innerHTML = html;
  },

  // ---- Dialog kotak: dipakai NPC warga (choice/talking) & dialog cerita Bos<->Aku (story) ----
  /** Tampilkan satu baris obrolan NPC/pemain + indikator "tekan E / ketuk buat lanjut". */
  showDialogue(name: string, text: string, who?: { npcChar: string; speaker: 'me' | 'npc' }): void {
    if (who) showPortraits(who.npcChar, who.speaker === 'me' ? 'me' : 'other');
    this.dialogName.textContent = name;
    this.dialogText.textContent = text;
    this.dialogCtaBtn.style.display = 'none';
    this.dialogHint.style.display = 'block';
    this.dialogBox.classList.add('show');
  },
  hideDialogue(): void {
    this.dialogBox.classList.remove('show');
  },

  // ---- Dialog cerita Bos <-> Aku (briefing chapter & lapor ke Bos) ----
  /** Tampilkan satu baris obrolan cerita di kotak dialog yang sama dgn NPC, seakan pemain lagi
   *  ngobrol langsung dgn Bos di telepon. Baris terakhir menukar hint "lanjut" jadi tombol aksi
   *  besar (mis. "▶ Mulai Misi") lewat ctaLabel. */
  showStoryLine(line: DialogueLine, isLast: boolean, ctaLabel: string): void {
    showPortraits(PORTRAIT_KEY_BOSS, line.speaker === 'Aku' ? 'me' : line.speaker === 'Bos' ? 'other' : null);
    this.dialogName.textContent = line.speaker === 'Aku' ? playerSpeakerLabel() : STORY_SPEAKER[line.speaker];
    this.dialogText.textContent = line.text;
    if (isLast) {
      this.dialogHint.style.display = 'none';
      this.dialogCtaBtn.style.display = 'block';
      this.dialogCtaBtn.textContent = ctaLabel;
    } else {
      this.dialogHint.style.display = 'block';
      this.dialogCtaBtn.style.display = 'none';
    }
    this.dialogBox.classList.add('show');
  },
  hideStoryLine(): void {
    this.dialogBox.classList.remove('show');
    this.dialogCtaBtn.style.display = 'none';
  },

  /** Set nama panggilan pemain untuk label dialog (dipanggil MapScene.create). */
  setPlayerName(name: string): void {
    playerName = name || DEFAULT_PLAYER_NAME;
  },

  /** Update judul chapter di header atas (dipakai saat chapter baru dimuat). */
  setChapterHeader(chapter: ChapterConfig): void {
    this.subLabel.textContent = `Chapter ${chapter.id} — ${chapter.title}`;
  }
};