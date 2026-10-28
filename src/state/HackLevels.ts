export type GateType = 'AND' | 'OR' | 'NOT' | 'XOR' | 'NAND' | 'NOR';

/** Satu teka-teki sirkuit: tabel kebenaran target. Kunci = nilai input berurutan ("AB" atau "ABC"), nilai = lampu 0/1. */
export interface HackPuzzle {
  label: string;
  target: Record<string, number>;
  /** Hint jumlah gerbang minimum (tidak divalidasi ketat). */
  minGates: number;
  /** Konteks cerita soal ini (apa yang dijaga panel). Ditampilkan di baris petunjuk minigame. */
  context?: string;
  /** Nama tiap probe sesuai cerita (urut A, B, C). Ditampilkan kecil di bawah header tabel target. */
  inputLabels?: string[];
}

export interface HackLevel {
  level: number;
  title: string;
  description: string;
  /** Jumlah input sakelar (A,B) atau (A,B,C). */
  inputs: 2 | 3;
  /** Gerbang yang tersedia di palet untuk level ini. */
  gates: GateType[];
  /** Diselesaikan berurutan; level selesai jika semua puzzle benar. */
  puzzles: HackPuzzle[];
}

export const HACK_LEVELS: HackLevel[] = [
  {
    level: 1, title: 'AND / OR', inputs: 2, gates: ['AND', 'OR'],
    description: 'Kenali gerbang dasar AND dan OR.',
    puzzles: [
      { label: 'Y = A AND B', minGates: 1, context: 'Pintu Ganda — proteksi transaksi. Folder terbuka kalau sandi benar dan token perangkat aktif.', inputLabels: ['Sandi benar', 'Token aktif'], target: { '00': 0, '01': 0, '10': 0, '11': 1 } },
      { label: 'Y = A OR B', minGates: 1, context: 'Jalur pemulihan untuk yang lupa sandi: terbuka kalau salah satu koneksi menyala.', inputLabels: ['Kabel LAN', 'Wi-Fi'], target: { '00': 0, '01': 1, '10': 1, '11': 1 } }
    ]
  },
  {
    level: 2, title: 'NOT', inputs: 2, gates: ['NOT'],
    description: 'Balikkan sinyal dengan gerbang NOT.',
    puzzles: [
      { label: 'Y = NOT A', minGates: 1, context: 'Arsip pesan terkunci, mode senyap aktif. Arsip hanya terbuka kalau jaringan tidak sedang dipantau.', inputLabels: ['Sensor pengawas jaringan', 'Sensor pintu'], target: { '00': 1, '01': 1, '10': 0, '11': 0 } }
    ]
  },
  {
    level: 3, title: 'Kombinasi 2 Gate', inputs: 2, gates: ['AND', 'OR', 'NOT'],
    description: 'Gabungkan dua gerbang.',
    puzzles: [
      { label: 'Y = A AND (NOT B)', minGates: 2, context: 'Kabinet server hanya terbuka saat daya aktif dan alarm tamper tenang.', inputLabels: ['Daya aktif', 'Alarm tamper'], target: { '00': 0, '01': 0, '10': 1, '11': 0 } }
    ]
  },
  {
    level: 4, title: 'Kombinasi 3 Gate', inputs: 3, gates: ['AND', 'OR', 'NOT'],
    description: 'Tiga input, tiga gerbang.',
    puzzles: [
      {
        label: 'Y = (A AND B) OR (NOT C)', minGates: 3, context: 'Pintu ruang kendali butuh kunci fisik dan token operator. Tapi kalau sinyal pengawas dari pusat putus, sistem masuk mode servis dan membuka pintu.', inputLabels: ['Kunci fisik', 'Token operator', 'Sinyal pengawas'],
        target: { '000': 1, '001': 0, '010': 1, '011': 0, '100': 1, '101': 0, '110': 1, '111': 1 }
      }
    ]
  },
  {
    level: 5, title: 'XOR / NAND / NOR', inputs: 2, gates: ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR'],
    description: 'Gerbang turunan: XOR, NAND, NOR.',
    puzzles: [
      { label: 'Y = A XOR B', minGates: 1, context: 'Sesi bergilir: pintu data terbuka kalau tepat satu operator yang login.', inputLabels: ['Operator 1 login', 'Operator 2 login'], target: { '00': 0, '01': 1, '10': 1, '11': 0 } },
      { label: 'Y = A NAND B', minGates: 1, context: 'Pengaman penyusup: pintu tengah terbuka terus, kecuali sensor jendela dan sensor pintu terpicu bersamaan.', inputLabels: ['Sensor jendela', 'Sensor pintu'], target: { '00': 1, '01': 1, '10': 1, '11': 0 } },
      { label: 'Y = A NOR B', minGates: 1, context: 'Mode senyap: log hanya terbuka kalau kabel dan Wi-Fi sama-sama mati.', inputLabels: ['Kabel LAN', 'Wi-Fi'], target: { '00': 1, '01': 0, '10': 0, '11': 0 } }
    ]
  },
  {
    level: 6, title: 'Rangkaian Kompleks', inputs: 3, gates: ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR'],
    description: 'Multiplexer: A memilih antara B dan C.',
    puzzles: [
      {
        label: 'Y = (A AND B) OR ((NOT A) AND C)', minGates: 4, context: 'Inti BLACKBOX punya dua jalur. Saklar A memilih jalur utama atau cadangan; jalur utama ditentukan kunci operator (B), jalur cadangan kunci cadangan (C).', inputLabels: ['Pilih jalur', 'Kunci utama', 'Kunci cadangan'],
        target: { '000': 0, '001': 1, '010': 0, '011': 1, '100': 0, '101': 0, '110': 1, '111': 1 }
      }
    ]
  }
];
