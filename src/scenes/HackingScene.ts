import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { Hud } from '../state/Hud';
import { HACK_LEVELS, GateType, HackLevel, HackPuzzle } from '../state/HackLevels';

const GATES: Record<GateType, (a: number, b: number) => number> = {
  AND: (a, b) => (a && b ? 1 : 0),
  OR: (a, b) => (a || b ? 1 : 0),
  NOT: a => (a ? 0 : 1),
  XOR: (a, b) => (a !== b ? 1 : 0),
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
const SLOT_BOX = Array.from({ length: SLOT_COUNT }, (_, i) => ({ x: 110, y: 20 + i * 100, w: 80, h: 60 }));
const LAMP = { x: 300, y: 200 };

/** Mode Simulasi: sandbox tanpa target/soal — semua gerbang tersedia, tabel kebenaran dihitung live dari rangkaian pemain. */
const ALL_GATES: GateType[] = ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR'];
const SIM_LEVEL: HackLevel = { level: 0, title: 'Simulasi', description: 'Mode bebas', inputs: 3, gates: ALL_GATES, puzzles: [] };
const SIM_PUZZLE: HackPuzzle = { label: 'Bebas', minGates: 0, target: {} };

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

    document.body.classList.add('hacking');
    document.getElementById('hackView')!.style.display = 'block';
    this.setupModeUi();

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
    // Scene bisa dihentikan paksa (tombol Menu di Story) tanpa lewat teardown() -> pastikan listener lepas.
    this.events.once('shutdown', () => this.canvas.removeEventListener('pointerdown', this.pointerHandler));
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
    return this.inputValues.length === 3 ? [70, 200, 330] : [100, 300];
  }

  private ports(): Record<string, Port> {
    const P: Record<string, Port> = {};
    const ys = this.inputYs();
    this.inputValues.forEach((_, i) => { P[INPUT_NAMES[i] + '_out'] = { x: 55, y: ys[i], type: 'out' }; });
    SLOT_BOX.forEach((b, i) => {
      P[`G${i}_in1`] = { x: b.x + 30, y: b.y + 15, type: 'in' };
      if (this.gatesSlots[i] !== 'NOT') P[`G${i}_in2`] = { x: b.x + 30, y: b.y + 45, type: 'in' };
      P[`G${i}_out`] = { x: b.x + b.w + 10, y: b.y + b.h / 2, type: 'out' };
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
      chip.className = 'gate-chip'; chip.textContent = name;
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
      .map((l, i) => `<th>Probe ${l}${labels[i] ? `<br><small>${esc(labels[i])}</small>` : ''}</th>`).join('') + '<th>Sinyal</th></tr>';
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
        '&gt; Klik bulatan A/B/C untuk mengubah 0/1. Tabel kebenaran di samping dihitung otomatis dari rangkaianmu.'
      ].join('<br>');
      return;
    }
    const { level, puzzle } = this.step;
    const parts: string[] = [];
    if (this.stepIdx === 0) this.state.chapter.hackIntro.forEach(l => parts.push(esc(l)));
    parts.push(`&gt; Level ${level.level}: ${esc(level.title)} (soal ${this.stepIdx + 1}/${this.steps.length})`);
    if (puzzle.context) parts.push(`&gt; ${esc(puzzle.context)}`);
    if (SHOW_FORMULA) parts.push(`&gt; Target: ${esc(puzzle.label)}`);
    parts.push(`&gt; Perkiraan: minimal ${puzzle.minGates} gerbang.`);
    el.innerHTML = parts.join('<br>');
  }

  private startDrag(e: PointerEvent, type: GateType): void {
    if (this.locked) return;
    this.ghostEl = document.createElement('div');
    this.ghostEl.className = 'ghost';
    this.ghostEl.textContent = type;
    document.body.appendChild(this.ghostEl);
    const move = (ev: PointerEvent) => {
      if (this.ghostEl) { this.ghostEl.style.left = ev.clientX - 20 + 'px'; this.ghostEl.style.top = ev.clientY - 16 + 'px'; }
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

  private drawWire(x1: number, y1: number, x2: number, y2: number, on: boolean): void {
    const c = this.ctx;
    c.strokeStyle = on ? '#3dff6a' : '#1e8f3e'; c.lineWidth = on ? 3 : 2;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo((x1 + x2) / 2, y1); c.lineTo((x1 + x2) / 2, y2); c.lineTo(x2, y2); c.stroke();
  }
  private drawPort(p: { x: number; y: number }, isOut: boolean): void {
    const c = this.ctx;
    c.beginPath(); c.arc(p.x, p.y, 7, 0, Math.PI * 2);
    c.fillStyle = isOut ? '#3dff6a' : '#001208'; c.fill();
    c.strokeStyle = '#1e8f3e'; c.lineWidth = 2; c.stroke();
  }

  private drawCircuit(): void {
    const c = this.ctx, P = this.ports();
    c.setTransform(RES, 0, 0, RES, 0, 0);
    c.clearRect(0, 0, CANVAS_W, CANVAS_H);
    Object.entries(this.connections).forEach(([inId, srcId]) => {
      const a = P[srcId], b = P[inId];
      if (a && b) this.drawWire(a.x, a.y, b.x, b.y, this.getValue(srcId) === 1);
    });
    if (this.selectedSource && P[this.selectedSource]) {
      const s = P[this.selectedSource];
      c.strokeStyle = '#3dff6a'; c.setLineDash([5, 4]); c.lineWidth = 2;
      c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x + 20, s.y - 20); c.stroke(); c.setLineDash([]);
    }
    this.inputValues.forEach((val, i) => {
      const pt = P[INPUT_NAMES[i] + '_out'];
      c.fillStyle = val ? '#3dff6a' : '#0d2b16';
      c.beginPath(); c.arc(pt.x - 20, pt.y, 18, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#1e8f3e'; c.lineWidth = 2; c.stroke();
      c.fillStyle = val ? '#000' : '#3dff6a'; c.font = '11px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(INPUT_NAMES[i] + ':' + val, pt.x - 20, pt.y);
      this.drawPort(pt, true);
    });
    SLOT_BOX.forEach((b, idx) => {
      const type = this.gatesSlots[idx];
      c.fillStyle = type ? '#0d2b16' : '#001208'; c.strokeStyle = '#1e8f3e'; c.lineWidth = 2;
      c.fillRect(b.x, b.y, b.w, b.h); c.strokeRect(b.x, b.y, b.w, b.h);
      c.fillStyle = '#3dff6a'; c.font = '13px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(type || '[ ]', b.x + b.w / 2 + 8, b.y + b.h / 2);
      this.drawPort(P['G' + idx + '_in1'], false);
      if (P['G' + idx + '_in2']) this.drawPort(P['G' + idx + '_in2'], false);
      this.drawPort(P['G' + idx + '_out'], true);
    });
    const lv = this.lampValue();
    c.fillStyle = lv ? '#3dff6a' : '#0d2b16';
    c.beginPath(); c.arc(P.Lamp_in.x + 20, P.Lamp_in.y, 22, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#1e8f3e'; c.lineWidth = 2; c.stroke();
    c.fillStyle = lv ? '#000' : '#3dff6a'; c.font = '10px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(lv ? 'OPEN' : 'LOCK', P.Lamp_in.x + 20, P.Lamp_in.y);
    this.drawPort(P.Lamp_in, false);
    if (this.sim) this.updateLiveTable();
  }

  // ---------------------------------------------------------------- mode Simulasi

  /** Atur visibilitas tombol/judul sesuai mode (Story vs Simulasi). */
  private setupModeUi(): void {
    const show = (id: string, on: boolean) => { document.getElementById(id)!.style.display = on ? 'flex' : 'none'; };
    show('simRow', this.sim); show('simMenuRow', this.sim);
    (document.getElementById('checkBtn')!.parentElement as HTMLElement).style.display = this.sim ? 'none' : 'flex';
    const h2 = document.querySelector('#hackView h2');
    if (h2) h2.textContent = this.sim ? '🔧 SIMULASI GERBANG LOGIKA' : '💻 TERMINAL AKSES — MEMBOBOL FIREWALL';
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
      html += `<tr${cur ? ' style="background:#0d2b16;font-weight:700"' : ''}>` + k.split('').map(b => `<td>${b}</td>`).join('') + `<td>${y ? '🟢' : '⬛'}</td></tr>`;
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
      status.textContent = '❌ ' + this.state.chapter.hackFailText;
      status.style.color = '#ff6b6b';
      return;
    }

    status.style.color = '#3dff6a';
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
    document.getElementById('hackView')!.style.display = 'none';
    document.body.classList.remove('hacking');
  }

  private cancelHacking(): void {
    this.teardown();
    this.scene.stop();
    this.scene.resume('Interior');
  }

  private backToMap(): void {
    this.teardown();
    document.body.classList.remove('inside');
    Hud.setToast('💻 Bukti berhasil diambil. Sekarang temui Bos untuk melapor.', '#00d9a3');
    this.scene.stop();
    this.scene.stop('Interior');
    this.scene.resume('Map');
  }
}