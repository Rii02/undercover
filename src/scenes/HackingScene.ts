import Phaser from 'phaser';
import { GameState, SCORE_START, SCORE_PENALTY } from '../state/GameState';
import { Hud } from '../state/Hud';
import { HACK_LEVELS, GATE_INFO, GateType, HackLevel, HackPuzzle } from '../state/HackLevels';
import { GATE_SHAPES, drawGateShape, gateSvg } from '../ui/GateShapes';

const GATES: Record<GateType, (a: number, b: number) => number> = {
  AND: (a, b) => (a && b ? 1 : 0),
  OR: (a, b) => (a || b ? 1 : 0),
  NOT: a => (a ? 0 : 1),
  XOR: (a, b) => (a !== b ? 1 : 0),
  XNOR: (a, b) => (a === b ? 1 : 0),
  NAND: (a, b) => (a && b ? 0 : 1),
  NOR: (a, b) => (a || b ? 0 : 1)
};

const INPUT_NAMES = ['A', 'B', 'C'];
/** false = rumus soal (mis. "Y = A AND B") disembunyikan; pemain menebak aturan dari pola tabel + konteks cerita. */
const SHOW_FORMULA = false;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const CANVAS_W = 360, CANVAS_H = 400;
/** Resolusi internal kanvas = RES x ukuran logika, supaya tetap tajam saat ditampilkan besar di desktop. Semua koordinat tetap dalam satuan logika 360x400. */
const RES = 3;
const SLOT_COUNT = 4; // level 6 butuh sampai 4 gerbang
const SLOT_BOX = Array.from({ length: SLOT_COUNT }, (_, i) => ({ x: 110, y: 20 + i * 100, w: 90, h: 60 }));
/** Simbol gerbang (viewBox 100x60, lihat ui/GateShapes.ts) digambar dengan skala ini; DY memusatkannya secara vertikal di kotak slot. */
const GATE_SCALE = 0.9, GATE_DY = 3;
const LAMP = { x: 300, y: 200 };

/** Mode Simulasi: sandbox tanpa target/soal — semua gerbang tersedia, tabel kebenaran dihitung live dari rangkaian pemain. */
const ALL_GATES: GateType[] = ['AND', 'OR', 'NOT', 'XOR', 'XNOR', 'NAND', 'NOR'];
const SIM_LEVEL: HackLevel = { level: 0, title: 'Simulasi', description: 'Mode bebas', inputs: 3, gates: ALL_GATES, puzzles: [] };
const SIM_PUZZLE: HackPuzzle = { label: 'Bebas', minGates: 0, target: {}, lampText: ['Y=0', 'Y=1'] };

/** Catatan yang selalu tampil di terminal: puzzle = simulasi edukatif, bukan klaim bahwa gerbang logika dipakai langsung untuk meretas. */
const SIM_NOTE = 'ℹ️ Simulasi edukatif: ini rangkaian logika untuk belajar, bukan representasi lengkap sistem elektronik atau keamanan komersial. '
  + 'Gerbang logika tidak dipakai langsung untuk meretas.';

type Port = { x: number; y: number; type: 'in' | 'out' };
interface Step { level: HackLevel; puzzle: HackPuzzle }

/**
 * Minigame sirkuit logika. Level diambil dari chapter.hackLevel -> HACK_LEVELS (1 chapter = 1 level):
 * tiap level punya 1+ puzzle, semuanya dikerjakan berurutan. caseSolved baru true setelah puzzle terakhir benar.
 * Jika pemain membatalkan di tengah, progres kembali ke puzzle pertama saat minigame dibuka lagi.
 */
export class HackingScene extends Phaser.Scene {
  private state!: GameState;
  private ctx!: CanvasRenderingContext2D;
  private canvas!: HTMLCanvasElement;
  private steps: Step[] = [];
  private stepIdx = 0;
  private inputValues: number[] = [0, 0];
  private gatesSlots: (GateType | null)[] = Array(SLOT_COUNT).fill(null);
  private connections: Record<string, string> = {};
  private selectedSource: string | null = null;
  private ghostEl: HTMLDivElement | null = null;
  private locked = false;
  private sim = false;
  private simInputs: 2 | 3 = 3;
  private pointerHandler = (e: PointerEvent) => this.onPointerDown(e);
  /** Warna kanvas rangkaian; dibaca dari variabel CSS tema (--term-*) tiap gambar ulang. Nilai awal = tema gelap. */
  private pal = { text: '#3dff6a', dim: '#1e8f3e', bg: '#001208', fill: '#0d2b16', on: '#000000' };
  /** Tema diganti (tombol tema) saat terminal terbuka -> gambar ulang kanvas dengan warna baru. */
  private themeHandler = () => this.drawCircuit();

  constructor() {
    super('Hacking');
  }

  private get step(): Step { return this.steps[this.stepIdx]; }

  init(data?: { mode?: string }): void {
    this.sim = data?.mode === 'sim';
    this.simInputs = 3;
  }

  create(): void {
    this.state = this.registry.get('state') as GameState;
    this.canvas = document.getElementById('circuit') as HTMLCanvasElement;
    // Kanvas diperbesar agar muat 3 input & 4 slot gerbang.
    this.canvas.width = CANVAS_W * RES; this.canvas.height = CANVAS_H * RES;
    this.ctx = this.canvas.getContext('2d')!;

    document.getElementById('interiorView')!.style.display = 'none';
    if (this.sim) document.getElementById('mapView')!.style.display = 'none';
    document.getElementById('hackView')!.style.display = 'block';
    this.setupModeUi();
    this.updateScoreLine();

    this.steps = [];
    if (this.sim) {
      this.steps.push({ level: SIM_LEVEL, puzzle: SIM_PUZZLE });
    } else {
      const level = HACK_LEVELS.find(l => l.level === this.state.chapter.hackLevel);
      if (!level) throw new Error(`[Hacking] Level ${this.state.chapter.hackLevel} tidak ada di HACK_LEVELS`);
      level.puzzles.forEach(puzzle => this.steps.push({ level, puzzle }));
    }
    this.stepIdx = 0;
    this.locked = false;

    this.canvas.addEventListener('pointerdown', this.pointerHandler);
    window.addEventListener('themechange', this.themeHandler);
    // Scene bisa dihentikan paksa (tombol Menu di Story) tanpa lewat teardown() -> pastikan listener lepas.
    this.events.once('shutdown', () => {
      this.canvas.removeEventListener('pointerdown', this.pointerHandler);
      window.removeEventListener('themechange', this.themeHandler);
    });
    (document.getElementById('checkBtn') as HTMLButtonElement).onclick = () => this.checkAnswer();
    (document.getElementById('cancelBtn') as HTMLButtonElement).onclick = () => this.cancelHacking();
    (document.getElementById('backBtn') as HTMLButtonElement).onclick = () => this.backToMap();
    document.getElementById('backRow')!.style.display = 'none';
    document.getElementById('cancelRow')!.style.display = this.sim ? 'none' : 'flex';
    (document.getElementById('checkBtn') as HTMLButtonElement).disabled = false;
    if (this.sim) this.bindSimControls();

    this.loadStep();
  }

  /** Siapkan papan untuk puzzle `stepIdx`: reset sirkuit, palet, tabel target, hint. */
  private loadStep(): void {
    const { level } = this.step;
    this.inputValues = Array(this.sim ? this.simInputs : level.inputs).fill(0);
    this.gatesSlots = Array(SLOT_COUNT).fill(null);
    this.connections = {}; this.selectedSource = null;
    document.getElementById('hackStatus')!.textContent = '';
    this.buildPalette();
    this.buildTargetTable();
    this.buildHintLine();
    this.drawCircuit();
  }

  private inputYs(): number[] {
    const n = this.inputValues.length;
    return n === 3 ? [70, 200, 330] : n === 1 ? [200] : [100, 300];
  }

  private ports(): Record<string, Port> {
    const P: Record<string, Port> = {};
    const ys = this.inputYs();
    this.inputValues.forEach((_, i) => { P[INPUT_NAMES[i] + '_out'] = { x: 55, y: ys[i], type: 'out' }; });
    SLOT_BOX.forEach((b, i) => {
      // Titik sambung = ujung kawat simbol gerbang. Slot kosong memakai posisi 2 masukan (seperti AND).
      const shape = GATE_SHAPES[this.gatesSlots[i] ?? 'AND'];
      const oy = b.y + GATE_DY;
      P[`G${i}_in1`] = { x: b.x, y: oy + shape.inputs[0].y * GATE_SCALE, type: 'in' };
      if (this.gatesSlots[i] !== 'NOT') P[`G${i}_in2`] = { x: b.x, y: oy + shape.inputs[1].y * GATE_SCALE, type: 'in' };
      P[`G${i}_out`] = { x: b.x + b.w, y: oy + 30 * GATE_SCALE, type: 'out' };
    });
    P.Lamp_in = { x: LAMP.x, y: LAMP.y, type: 'in' };
    return P;
  }

  private getValue(id: string, depth = 0): number {
    if (depth > 8) return 0; // cegah loop tak hingga jika kabel membentuk lingkaran
    const im = id.match(/^([ABC])_out$/);
    if (im) return this.inputValues[INPUT_NAMES.indexOf(im[1])] ?? 0;
    const m = id.match(/^G(\d)_out$/);
    if (m) {
      const idx = +m[1], type = this.gatesSlots[idx];
      if (!type) return 0;
      const in1 = this.connections['G' + idx + '_in1'], in2 = this.connections['G' + idx + '_in2'];
      return GATES[type](in1 ? this.getValue(in1, depth + 1) : 0, in2 ? this.getValue(in2, depth + 1) : 0);
    }
    return 0;
  }
  private lampValue(): number {
    const s = this.connections['Lamp_in'];
    return s ? this.getValue(s) : 0;
  }

  private buildPalette(): void {
    const el = document.getElementById('gatePalette')!;
    el.innerHTML = '';
    this.step.level.gates.forEach(name => {
      const chip = document.createElement('div');
      chip.className = 'gate-chip';
      chip.innerHTML = gateSvg(name, { fill: 'var(--term-fill)', bubbleFill: 'var(--term-surface)', className: 'gate-ico' }) + `<span>${name}</span>`;
      chip.title = `${name}: ${GATE_INFO[name]}`;   // fungsi gerbang sbg tooltip
      chip.addEventListener('pointerdown', e => this.startDrag(e, name));
      el.appendChild(chip);
    });
  }
  private buildTargetTable(): void {
    if (this.sim) { this.updateLiveTable(); return; }
    const { level, puzzle } = this.step;
    const n = level.inputs;
    const labels = puzzle.inputLabels ?? [];
    let html = '<tr>' + INPUT_NAMES.slice(0, n)
      .map((l, i) => `<th>Probe ${l}${labels[i] ? `<br><small>${esc(labels[i])}</small>` : ''}</th>`).join('') + `<th>${esc(puzzle.outputLabel ?? 'Sinyal')}</th></tr>`;
    for (let i = 0; i < 2 ** n; i++) {
      const k = i.toString(2).padStart(n, '0');
      html += '<tr>' + k.split('').map(b => `<td>${b}</td>`).join('') + `<td>${puzzle.target[k] ? '🟢' : '⬛'}</td></tr>`;
    }
    document.getElementById('targetTable')!.innerHTML = html;
  }
  /** Info level + soal saat ini + hint gerbang minimum (hint saja, tidak divalidasi). */
  private buildHintLine(): void {
    const el = document.getElementById('hackHintLine');
    if (!el) return;
    if (this.sim) {
      el.innerHTML = [
        '&gt; Mode simulasi: rancang rangkaian sesuka hati, tanpa soal.',
        '&gt; Seret gerbang ke kotak, klik titik keluaran (hijau) lalu titik masukan untuk menarik kabel.',
        '&gt; Klik bulatan A/B/C untuk mengubah 0/1. Tabel kebenaran di samping dihitung otomatis dari rangkaianmu.',
        ...(Object.keys(GATE_INFO) as GateType[]).map(g => `&gt; ${g}: ${esc(GATE_INFO[g])}`),
        `<span class="hackNote">${esc(SIM_NOTE)}</span>`
      ].join('<br>');
      return;
    }
    const { level, puzzle } = this.step;
    const parts: string[] = [];
    if (this.stepIdx === 0) this.state.chapter.hackIntro.forEach(l => parts.push(esc(l.replace(/^Aku:/, `${this.state.displayName}:`))));
    parts.push(`&gt; Level ${level.level}: ${esc(level.title)} (soal ${this.stepIdx + 1}/${this.steps.length})`);
    if (puzzle.context) parts.push(`&gt; ${esc(puzzle.context)}`);
    // Fungsi singkat gerbang yang baru muncul di level ini (gerbang lain sudah dijelaskan di level sebelumnya / tooltip palet).
    if (this.stepIdx === 0) {
      const prev = HACK_LEVELS.find(l => l.level === level.level - 1);
      level.gates.filter(g => !prev?.gates.includes(g)).forEach(g => parts.push(`&gt; Gerbang ${g}: ${esc(GATE_INFO[g])}`));
    }
    if (SHOW_FORMULA) parts.push(`&gt; Target: ${esc(puzzle.label)}`);
    parts.push(`&gt; Perkiraan: minimal ${puzzle.minGates} gerbang.`);
    parts.push(`<span class="hackNote">${esc(SIM_NOTE)}</span>`);
    el.innerHTML = parts.join('<br>');
  }

  private startDrag(e: PointerEvent, type: GateType): void {
    if (this.locked) return;
    this.ghostEl = document.createElement('div');
    this.ghostEl.className = 'ghost';
    this.ghostEl.innerHTML = gateSvg(type, { fill: 'var(--term-fill)', bubbleFill: 'var(--term-surface)', className: 'gate-ico' }) + `<span>${type}</span>`;
    document.body.appendChild(this.ghostEl);
    const move = (ev: PointerEvent) => {
      if (this.ghostEl) { this.ghostEl.style.left = ev.clientX - this.ghostEl.offsetWidth / 2 + 'px'; this.ghostEl.style.top = ev.clientY - this.ghostEl.offsetHeight / 2 + 'px'; }   // ghost terpusat di bawah penunjuk
    };
    move(e);
    const up = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', move);
      if (this.ghostEl) { this.ghostEl.remove(); this.ghostEl = null; }
      const rect = this.canvas.getBoundingClientRect();
      const sx = CANVAS_W / rect.width, sy = CANVAS_H / rect.height;
      const x = (ev.clientX - rect.left) * sx, y = (ev.clientY - rect.top) * sy;
      SLOT_BOX.forEach((box, idx) => {
        if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) this.placeGate(idx, type);
      });
      this.drawCircuit();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up, { once: true });
  }

  private placeGate(idx: number, type: GateType): void {
    this.gatesSlots[idx] = type;
    delete this.connections['G' + idx + '_in1']; delete this.connections['G' + idx + '_in2'];
  }
  private clearGate(idx: number): void {
    this.gatesSlots[idx] = null;
    delete this.connections['G' + idx + '_in1']; delete this.connections['G' + idx + '_in2'];
    const outId = 'G' + idx + '_out';
    Object.keys(this.connections).forEach(k => { if (this.connections[k] === outId) delete this.connections[k]; });
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.locked) return;
    const rect = this.canvas.getBoundingClientRect();
    const sx = CANVAS_W / rect.width, sy = CANVAS_H / rect.height;
    const x = (e.clientX - rect.left) * sx, y = (e.clientY - rect.top) * sy;
    const P = this.ports();
    for (const [id, p] of Object.entries(P)) {
      if (Math.hypot(x - p.x, y - p.y) < 12) { this.handlePortClick(id, p.type); this.drawCircuit(); return; }
    }
    for (let idx = 0; idx < SLOT_BOX.length; idx++) {
      const b = SLOT_BOX[idx];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h && this.gatesSlots[idx]) { this.clearGate(idx); this.drawCircuit(); return; }
    }
    const ys = this.inputYs();
    for (let i = 0; i < this.inputValues.length; i++) {
      if (Math.hypot(x - 35, y - ys[i]) < 20) { this.inputValues[i] = this.inputValues[i] ? 0 : 1; this.drawCircuit(); return; }
    }
    this.selectedSource = null; this.drawCircuit();
  }
  private handlePortClick(id: string, type: 'in' | 'out'): void {
    if (!this.selectedSource) {
      if (type === 'out') this.selectedSource = id;
      else if (type === 'in' && this.connections[id]) delete this.connections[id];
    } else {
      if (id === this.selectedSource) this.selectedSource = null;
      else if (type === 'out') this.selectedSource = id;
      else if (type === 'in') { this.connections[id] = this.selectedSource; this.selectedSource = null; }
    }
  }

  /**
   * Gambar kabel berpola siku, dengan lajur tegak yang tidak saling menumpuk:
   *  - dari probe ke depan: garis tegak di lajur milik probe itu (A/B/C masing-masing satu lajur);
   *  - dari keluaran gerbang ke lampu: satu garis tegak di tengah;
   *  - dari keluaran gerbang ke masukan gerbang di kolom yang sama (ke belakang): keluar ke kanan, naik/turun lewat
   *    celah antar-baris, lalu masuk dari kiri lewat saluran milik baris sumbernya, sehingga kabel tidak menembus
   *    badan gerbang. Kabel dari sumber yang sama boleh menyatu (itu memang satu sambungan).
   */
  private drawWire(x1: number, y1: number, x2: number, y2: number, on: boolean, probeLane = -1, srcRow = 0): void {
    const c = this.ctx;
    c.strokeStyle = on ? this.pal.text : this.pal.dim; c.lineWidth = on ? 3 : 2;
    c.lineJoin = 'round';
    c.beginPath(); c.moveTo(x1, y1);
    if (x2 >= x1 + 30) {
      const mx = probeLane >= 0 ? x2 - 44 + probeLane * 6 : (x1 + x2) / 2;
      c.lineTo(mx, y1); c.lineTo(mx, y2); c.lineTo(x2, y2);
    } else {
      const row = Math.round((y1 - 50) / 100);                        // keluaran gerbang di y = 50 + 100*baris
      const down = y2 > y1;
      // pusat celah di bawah/atas baris asal; turun & naik diberi selisih 5px agar tidak menumpuk di celah yang sama
      const gy = Math.min(Math.max((down ? 100 * (row + 1) + 5 : 100 * row - 5), 8), CANVAS_H - 8);
      const xc = x2 - 26 + 6 * srcRow;                                // saluran vertikal di kiri gerbang tujuan, satu per baris sumber
      c.lineTo(x1 + 12, y1); c.lineTo(x1 + 12, gy); c.lineTo(xc, gy); c.lineTo(xc, y2); c.lineTo(x2, y2);
    }
    c.stroke();
  }

  private drawPort(p: { x: number; y: number }, isOut: boolean): void {
    const c = this.ctx;
    c.beginPath(); c.arc(p.x, p.y, 7, 0, Math.PI * 2);
    c.fillStyle = isOut ? this.pal.text : this.pal.bg; c.fill();
    c.strokeStyle = this.pal.dim; c.lineWidth = 2; c.stroke();
  }

  /** Baca warna tema aktif dari variabel CSS (--term-*) ke this.pal. */
  private readPalette(): void {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
    this.pal = {
      text: v('--term-text', '#3dff6a'), dim: v('--term-dim', '#1e8f3e'), bg: v('--term-bg', '#001208'),
      fill: v('--term-fill', '#0d2b16'), on: v('--term-on', '#000000')
    };
  }

  private drawCircuit(): void {
    this.readPalette();
    const c = this.ctx, P = this.ports();
    c.setTransform(RES, 0, 0, RES, 0, 0);
    c.clearRect(0, 0, CANVAS_W, CANVAS_H);
    Object.entries(this.connections).forEach(([inId, srcId]) => {
      const a = P[srcId], b = P[inId];
      if (!a || !b) return;
      const probe = INPUT_NAMES.indexOf(srcId[0]);   // 0..2 untuk probe A/B/C, -1 untuk keluaran gerbang
      this.drawWire(a.x, a.y, b.x, b.y, this.getValue(srcId) === 1, probe, srcId[0] === 'G' ? Number(srcId[1]) : 0);
    });
    if (this.selectedSource && P[this.selectedSource]) {
      const s = P[this.selectedSource];
      c.strokeStyle = this.pal.text; c.setLineDash([5, 4]); c.lineWidth = 2;
      c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x + 20, s.y - 20); c.stroke(); c.setLineDash([]);
    }
    this.inputValues.forEach((val, i) => {
      const pt = P[INPUT_NAMES[i] + '_out'];
      c.fillStyle = val ? this.pal.text : this.pal.fill;
      c.beginPath(); c.arc(pt.x - 20, pt.y, 18, 0, Math.PI * 2); c.fill();
      c.strokeStyle = this.pal.dim; c.lineWidth = 2; c.stroke();
      c.fillStyle = val ? this.pal.on : this.pal.text; c.font = '11px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(INPUT_NAMES[i] + ':' + val, pt.x - 20, pt.y);
      this.drawPort(pt, true);
    });
    SLOT_BOX.forEach((b, idx) => {
      const type = this.gatesSlots[idx];
      const oy = b.y + GATE_DY;
      if (type) {
        // Simbol gerbang standar; kawat menyala (warna terang) bila membawa sinyal 1.
        const sig = (id: string) => { const src = this.connections[id]; return src ? this.getValue(src) === 1 : false; };
        const onC = this.pal.text, offC = this.pal.dim;
        drawGateShape(c, type, b.x, oy, GATE_SCALE, {
          stroke: this.pal.text, fill: this.pal.fill, bubbleFill: this.pal.bg, lineWidth: 2,
          leadIn: [sig('G' + idx + '_in1') ? onC : offC, sig('G' + idx + '_in2') ? onC : offC],
          leadOut: this.getValue('G' + idx + '_out') === 1 ? onC : offC
        });
        c.fillStyle = this.pal.dim; c.font = '9px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(type, b.x + 45 * GATE_SCALE, b.y + b.h - 3);
      } else {
        // Slot kosong: bingkai putus-putus di tempat badan gerbang.
        c.strokeStyle = this.pal.dim; c.lineWidth = 2; c.setLineDash([4, 3]);
        c.strokeRect(b.x + 18 * GATE_SCALE, oy + 6 * GATE_SCALE, 54 * GATE_SCALE, 48 * GATE_SCALE); c.setLineDash([]);
        c.fillStyle = this.pal.dim; c.font = '13px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('[ ]', b.x + 45 * GATE_SCALE, b.y + b.h / 2);
      }
      this.drawPort(P['G' + idx + '_in1'], false);
      if (P['G' + idx + '_in2']) this.drawPort(P['G' + idx + '_in2'], false);
      this.drawPort(P['G' + idx + '_out'], true);
    });
    const lv = this.lampValue();
    c.fillStyle = lv ? this.pal.text : this.pal.fill;
    c.beginPath(); c.arc(P.Lamp_in.x + 20, P.Lamp_in.y, 22, 0, Math.PI * 2); c.fill();
    c.strokeStyle = this.pal.dim; c.lineWidth = 2; c.stroke();
    c.fillStyle = lv ? this.pal.on : this.pal.text; c.font = '10px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const [lampOff, lampOn] = this.step.puzzle.lampText ?? ['LOCK', 'OPEN'];
    c.fillText(lv ? lampOn : lampOff, P.Lamp_in.x + 20, P.Lamp_in.y);
    this.drawPort(P.Lamp_in, false);
    if (this.sim) this.updateLiveTable();
  }

  /** Tampilkan skor berjalan di terminal (hanya Story; di Simulasi barisnya disembunyikan oleh setupModeUi). */
  private updateScoreLine(): void {
    const el = document.getElementById('hackScoreLine');
    if (!el || this.sim) return;
    el.textContent = `> Skor ${this.state.displayName}: ${this.state.score} / ${SCORE_START}  (−${SCORE_PENALTY} tiap EKSEKUSI_BOBOL() yang salah)`;
  }

  // ---------------------------------------------------------------- mode Simulasi

  /** Atur visibilitas tombol/judul sesuai mode (Story vs Simulasi). */
  private setupModeUi(): void {
    const show = (id: string, on: boolean) => { document.getElementById(id)!.style.display = on ? 'flex' : 'none'; };
    show('simRow', this.sim); show('simMenuRow', this.sim);
    (document.getElementById('checkBtn')!.parentElement as HTMLElement).style.display = this.sim ? 'none' : 'flex';
    const h2 = document.querySelector('#hackView h2');
    if (h2) h2.textContent = this.sim ? '🔧 SIMULASI GERBANG LOGIKA' : '💻 TERMINAL AKSES — PANEL KONTROL PERANGKAT';
    document.querySelectorAll('#hackView > .termline:not(#hackHintLine)').forEach(el => {
      (el as HTMLElement).style.display = this.sim ? 'none' : '';
    });
  }

  private bindSimControls(): void {
    const inputsBtn = document.getElementById('simInputsBtn') as HTMLButtonElement;
    inputsBtn.textContent = `INPUT: ${this.simInputs}`;
    inputsBtn.onclick = () => {
      this.simInputs = this.simInputs === 3 ? 2 : 3;
      inputsBtn.textContent = `INPUT: ${this.simInputs}`;
      this.loadStep(); // papan direset karena jumlah input berubah
    };
    (document.getElementById('simResetBtn') as HTMLButtonElement).onclick = () => this.loadStep();
    (document.getElementById('simMenuBtn') as HTMLButtonElement).onclick = () => this.backToMenu();
  }

  /** Tabel kebenaran hasil rangkaian pemain (baris yang cocok dgn posisi sakelar saat ini disorot). */
  private updateLiveTable(): void {
    const n = this.inputValues.length;
    const saved = [...this.inputValues];
    let html = '<tr>' + INPUT_NAMES.slice(0, n).map(l => `<th>${l}</th>`).join('') + '<th>Y</th></tr>';
    for (let i = 0; i < 2 ** n; i++) {
      const k = i.toString(2).padStart(n, '0');
      this.inputValues = k.split('').map(Number);
      const y = this.lampValue();
      const cur = k === saved.join('');
      html += `<tr${cur ? ' style="background:var(--term-fill);font-weight:700"' : ''}>` + k.split('').map(b => `<td>${b}</td>`).join('') + `<td>${y ? '🟢' : '⬛'}</td></tr>`;
    }
    this.inputValues = saved;
    document.getElementById('targetTable')!.innerHTML = html;
  }

  private backToMenu(): void {
    this.teardown();
    this.scene.start('Menu');
  }

  private checkAnswer(): void {
    if (this.locked) return;
    const { level, puzzle } = this.step;
    const n = level.inputs;
    const saved = [...this.inputValues];
    let allMatch = true;
    for (let i = 0; i < 2 ** n; i++) {
      const k = i.toString(2).padStart(n, '0');
      this.inputValues = k.split('').map(Number);
      if (this.lampValue() !== puzzle.target[k]) allMatch = false;
    }
    this.inputValues = saved; this.drawCircuit();

    const status = document.getElementById('hackStatus')!;
    const checkBtn = document.getElementById('checkBtn') as HTMLButtonElement;
    if (!allMatch) {
      // Skor Story: -5 tiap rangkaian belum sesuai tabel target (minimum 0). Mode Simulasi tidak punya skor.
      let scoreNote = '';
      if (!this.sim) {
        const before = this.state.score;
        const after = this.state.recordWrongExecution();
        scoreNote = before > after ? `<br>⚠️ Skor −${SCORE_PENALTY}: ${before} → ${after}` : `<br>⚠️ Skor tetap ${after} (sudah di batas minimum)`;
        this.updateScoreLine();
      }
      status.innerHTML = '❌ ' + esc(this.state.chapter.hackFailText) + scoreNote;
      status.style.color = 'var(--term-err)';
      return;
    }

    status.style.color = 'var(--term-text)';
    if (this.stepIdx < this.steps.length - 1) {
      // Masih ada puzzle berikutnya di level ini (mis. level 1: AND lalu OR; level 5: XOR, NAND, NOR).
      status.innerHTML = `✅ Benar! Lanjut ke soal berikutnya...`;
      this.locked = true; checkBtn.disabled = true;
      this.time.delayedCall(1400, () => {
        this.stepIdx++;
        this.locked = false; checkBtn.disabled = false;
        this.loadStep();
      });
      return;
    }

    const ch = this.state.chapter;
    status.innerHTML = `✅ ${esc(ch.hackSuccessText)}<br><br>&gt; Membuka folder bukti...`;
    this.state.caseSolved = true;
    this.locked = true;
    document.getElementById('cancelRow')!.style.display = 'none';
    checkBtn.disabled = true;
    // Tantangan selesai -> tampilkan file manager berisi berkas bukti chapter ini.
    this.time.delayedCall(1600, () => this.showFileManager());
  }

  /** File manager biasa (daftar berkas + pratinjau). Berkas yang punya `transactions` ditampilkan sebagai tabel riwayat transaksi. */
  private showFileManager(): void {
    const ch = this.state.chapter;
    const files = ch.evidence;
    const overlay = document.getElementById('fmOverlay')!;
    const list = document.getElementById('fmList')!;
    const preview = document.getElementById('fmPreview')!;
    const statusEl = document.getElementById('fmStatus')!;
    const opened = new Set<number>();
    const ICONS: Record<string, string> = { csv: '📊', xlsx: '📊', log: '📜', txt: '📝', pdf: '📕', png: '🖼️', jpg: '🖼️', json: '🧾', dat: '🗄️', db: '🗄️', enc: '🔒', conf: '⚙️', eml: '✉️' };
    const TYPES: Record<string, string> = { csv: 'Lembar CSV', log: 'Berkas Log', txt: 'Dokumen Teks', enc: 'Berkas Terenkripsi', conf: 'Berkas Konfigurasi', dat: 'Berkas Data', json: 'Berkas JSON' };
    const rupiah = (n: number) => 'Rp ' + n.toLocaleString('id-ID');
    const info = files.map(f => {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      const chars = f.lines.join('').length + (f.transactions?.length ?? 0) * 90;
      return { ext, icon: ICONS[ext] ?? '📄', type: TYPES[ext] ?? `Berkas ${ext.toUpperCase()}`, size: `${Math.max(1, Math.ceil(chars / 40) + 1)} KB` };
    });

    document.getElementById('fmTitle')!.textContent = `Bukti — Chapter ${ch.id}`;
    document.getElementById('fmPath')!.textContent = `Komputer  ›  Target  ›  Bukti  ›  Chapter ${ch.id} — ${ch.title}`;
    const updateStatus = () => { statusEl.textContent = `${files.length} item  •  ${opened.size}/${files.length} sudah dibuka`; };
    updateStatus();
    preview.innerHTML = '<div class="fmEmpty">Pilih sebuah berkas di atas untuk melihat isinya.</div>';

    list.innerHTML = files.map((f, i) =>
      `<tr class="fmRow" data-i="${i}" tabindex="0"><td class="nm"><span class="ic">${info[i].icon}</span>${esc(f.name)}</td><td class="tp">${info[i].type}</td><td class="sz">${info[i].size}</td></tr>`
    ).join('');

    const open = (i: number, row: HTMLElement) => {
      list.querySelectorAll('.fmRow').forEach(r => r.classList.remove('sel'));
      row.classList.add('sel');
      opened.add(i); updateStatus();
      const f = files[i];
      let html = `<h3>${info[i].icon} ${esc(f.name)}</h3><div class="fmMeta">${info[i].type} • ${info[i].size} • hanya-baca</div>`;
      if (f.transactions?.length) {
        const tx = f.transactions;
        const total = tx.reduce((a, t) => a + t.jumlah, 0);
        html += f.lines.map(l => `<div class="fmNote">${esc(l)}</div>`).join('');
        html += '<div class="fmTxTitle">Riwayat Transaksi</div><div class="fmTxWrap"><table class="fmTx"><thead><tr><th>Tanggal</th><th>Keterangan</th><th>Dari</th><th>Ke</th><th class="amt">Jumlah</th><th>Status</th></tr></thead><tbody>'
          + tx.map(t => `<tr><td>${esc(t.tanggal)}</td><td>${esc(t.keterangan)}</td><td>${esc(t.dari)}</td><td>${esc(t.ke)}</td><td class="amt">${rupiah(t.jumlah)}</td><td><span class="fmBadge">${esc(t.status)}</span></td></tr>`).join('')
          + '</tbody></table></div>'
          + `<div class="fmTxSum"><span>${tx.length} transaksi</span><span>Total: <b>${rupiah(total)}</b></span></div>`;
      } else {
        html += f.lines.map(l => `<p class="fmLine">${esc(l)}</p>`).join('');
      }
      preview.innerHTML = html;
      preview.scrollTop = 0;
    };
    list.querySelectorAll<HTMLElement>('.fmRow').forEach(row => {
      const i = Number(row.dataset.i);
      row.onclick = () => open(i, row);
      row.onkeydown = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i, row); } };
    });

    const close = () => { overlay.classList.remove('show'); this.backToMap(); };
    (document.getElementById('fmCloseBtn') as HTMLButtonElement).onclick = close;
    (document.getElementById('fmCloseDot') as HTMLButtonElement).onclick = close;
    overlay.classList.add('show');
  }

  private teardown(): void {
    this.canvas.removeEventListener('pointerdown', this.pointerHandler);
    window.removeEventListener('themechange', this.themeHandler);
    document.getElementById('hackView')!.style.display = 'none';
  }

  private cancelHacking(): void {
    this.teardown();
    document.getElementById('interiorView')!.style.display = 'block';
    this.scene.stop();
    this.scene.resume('Interior');
  }

  private backToMap(): void {
    this.teardown();
    document.getElementById('interiorView')!.style.display = 'none';
    document.getElementById('mapView')!.style.display = 'block';
    Hud.setToast('💻 Bukti berhasil diambil. Sekarang temui Bos untuk melapor.', '#00d9a3');
    this.scene.stop();
    this.scene.stop('Interior');
    this.scene.resume('Map');
  }
}