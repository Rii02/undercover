/**
 * Bentuk vektor gerbang logika standar (simbol ANSI/IEEE "distinctive shape").
 *
 * Satu sumber data dipakai di semua tempat: kanvas rangkaian (Path2D), chip palet, ghost drag, halaman materi,
 * dan file SVG mandiri di public/assets/gates/ (dibuat dengan gateSvgDocument()).
 *
 * Semua simbol memakai viewBox 100 x 60:
 *   - kawat masukan di sisi kiri (x = 0), kawat keluaran di sisi kanan (x = 100);
 *   - garis tengah keluaran y = 30; masukan 2 di y = 15 dan y = 45, masukan tunggal (NOT) di y = 30.
 * Kawat masukan berakhir tepat di tepi badan (atau di lengkung depan pada XOR/XNOR), kawat keluaran mulai dari tepi
 * badan atau tepi gelembung inversi.
 */
import type { GateType } from '../state/HackLevels';

/** Nama bentuk = nama gerbang di gameplay (semua gerbang di GateType punya simbol). */
export type ShapeName = GateType;

export const GATE_VIEW = { w: 100, h: 60 } as const;

export interface GateShape {
  /** Badan gerbang: path SVG tertutup (bisa diisi warna). */
  body: string;
  /** Garis tambahan tanpa isi (lengkung depan XOR/XNOR). */
  extra?: string;
  /** Titik sambung masukan: y = posisi kawat, x = tempat kawat berakhir (tepi badan). */
  inputs: { y: number; x: number }[];
  /** Gelembung inversi (NOT, NAND, NOR, XNOR). */
  bubble?: { cx: number; cy: number; r: number };
  /** x tempat kawat keluaran mulai (tepi badan, atau tepi gelembung bila ada). */
  outX: number;
}

// Badan dasar yang dipakai ulang. Lengkung belakang OR: (16,6) -> (16,54) dengan titik kontrol (28,22) dan (28,38);
// pada y = 15 / 45 lengkung ada di x = 21,5 (tempat kawat masukan berakhir).
const AND_BODY = 'M18 6 H46 A24 24 0 0 1 46 54 H18 Z';
const OR_BODY = 'M16 6 C36 6 60 12 76 30 C60 48 36 54 16 54 C28 38 28 22 16 6 Z';
const XOR_BODY = 'M22 6 C42 6 66 12 82 30 C66 48 42 54 22 54 C34 38 34 22 22 6 Z';   // OR digeser 6 ke kanan
const XOR_FRONT = 'M16 6 C28 22 28 38 16 54';                                             // lengkung depan terpisah
const TWO_AND = [{ y: 15, x: 18 }, { y: 45, x: 18 }];
const TWO_OR = [{ y: 15, x: 21.5 }, { y: 45, x: 21.5 }];

export const GATE_SHAPES: Record<ShapeName, GateShape> = {
  AND: { body: AND_BODY, inputs: TWO_AND, outX: 70 },
  OR: { body: OR_BODY, inputs: TWO_OR, outX: 76 },
  NOT: { body: 'M20 8 L20 52 L68 30 Z', inputs: [{ y: 30, x: 20 }], bubble: { cx: 73, cy: 30, r: 5 }, outX: 78 },
  NAND: { body: AND_BODY, inputs: TWO_AND, bubble: { cx: 75, cy: 30, r: 5 }, outX: 80 },
  NOR: { body: OR_BODY, inputs: TWO_OR, bubble: { cx: 81, cy: 30, r: 5 }, outX: 86 },
  XOR: { body: XOR_BODY, extra: XOR_FRONT, inputs: TWO_OR, outX: 82 },
  XNOR: { body: XOR_BODY, extra: XOR_FRONT, inputs: TWO_OR, bubble: { cx: 87, cy: 30, r: 5 }, outX: 92 }
};

export interface GateDrawStyle {
  /** Warna garis badan. */
  stroke: string;
  /** Warna isi badan. */
  fill: string;
  /** Warna isi gelembung inversi (biasanya sama dengan latar, supaya tampak berlubang). */
  bubbleFill: string;
  /** Tebal garis dalam satuan layar (bukan satuan viewBox). Default 2. */
  lineWidth?: number;
  /** Warna kawat tiap masukan (default = stroke). Dipakai untuk menandai sinyal 1 / 0. */
  leadIn?: string[];
  /** Warna kawat keluaran (default = stroke). */
  leadOut?: string;
}

/**
 * Gambar simbol gerbang ke kanvas. (x, y) = sudut kiri-atas viewBox 100x60, scale = skala viewBox -> satuan kanvas.
 * Titik sambung di kanvas: masukan i di (x, y + inputs[i].y * scale), keluaran di (x + 100 * scale, y + 30 * scale).
 */
export function drawGateShape(c: CanvasRenderingContext2D, name: ShapeName, x: number, y: number, scale: number, st: GateDrawStyle): void {
  const s = GATE_SHAPES[name];
  const lw = (st.lineWidth ?? 2) / scale;   // tebal garis tetap di layar walau viewBox diskalakan
  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  c.lineJoin = 'round'; c.lineCap = 'round'; c.lineWidth = lw;
  // kawat dulu, supaya badan (berisi) menutupi ujungnya
  s.inputs.forEach((p, i) => {
    c.strokeStyle = st.leadIn?.[i] ?? st.stroke;
    c.beginPath(); c.moveTo(0, p.y); c.lineTo(p.x, p.y); c.stroke();
  });
  c.strokeStyle = st.leadOut ?? st.stroke;
  c.beginPath(); c.moveTo(s.outX, 30); c.lineTo(GATE_VIEW.w, 30); c.stroke();
  const body = new Path2D(s.body);
  c.fillStyle = st.fill; c.fill(body);
  c.strokeStyle = st.stroke; c.stroke(body);
  if (s.extra) c.stroke(new Path2D(s.extra));
  if (s.bubble) {
    c.beginPath(); c.arc(s.bubble.cx, s.bubble.cy, s.bubble.r, 0, Math.PI * 2);
    c.fillStyle = st.bubbleFill; c.fill(); c.stroke();
  }
  c.restore();
}

export interface GateSvgOptions {
  stroke?: string;       // default currentColor (ikut warna teks elemen induk)
  fill?: string;         // isi badan, default 'none'
  bubbleFill?: string;   // isi gelembung, default sama dengan fill
  strokeWidth?: number;  // dalam satuan viewBox, default 3
  className?: string;
  /** Teks aksesibilitas; default "Simbol gerbang <NAMA>". */
  label?: string;
}

/** Markup <svg> inline untuk satu gerbang (chip palet, ghost drag, halaman materi). Aman: hanya berisi data tetap dari modul ini. */
export function gateSvg(name: ShapeName, o: GateSvgOptions = {}): string {
  const s = GATE_SHAPES[name];
  const fill = o.fill ?? 'none', bubbleFill = o.bubbleFill ?? fill;
  const cls = o.className ? ` class="${o.className}"` : '';
  const leads = s.inputs.map(p => `M0 ${p.y} H${p.x}`).join(' ') + ` M${s.outX} 30 H${GATE_VIEW.w}`;
  return `<svg${cls} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GATE_VIEW.w} ${GATE_VIEW.h}" role="img" aria-label="${o.label ?? `Simbol gerbang ${name}`}" `
    + `fill="none" stroke="${o.stroke ?? 'currentColor'}" stroke-width="${o.strokeWidth ?? 3}" stroke-linejoin="round" stroke-linecap="round">`
    + `<path d="${leads}"/>`
    + `<path d="${s.body}" fill="${fill}"/>`
    + (s.extra ? `<path d="${s.extra}"/>` : '')
    + (s.bubble ? `<circle cx="${s.bubble.cx}" cy="${s.bubble.cy}" r="${s.bubble.r}" fill="${bubbleFill}"/>` : '')
    + `</svg>`;
}

/** Dokumen SVG mandiri (untuk file di public/assets/gates/): latar transparan, garis gelap, isi putih. */
export function gateSvgDocument(name: ShapeName, size = 200): string {
  const inner = gateSvg(name, { stroke: '#1b2233', fill: '#ffffff', bubbleFill: '#ffffff', strokeWidth: 3, label: `Simbol gerbang ${name}` });
  const h = Math.round(size * GATE_VIEW.h / GATE_VIEW.w);
  return inner.replace('<svg ', `<svg width="${size}" height="${h}" `)
    .replace('>', `><title>Gerbang ${name}</title>`) + '\n';
}
