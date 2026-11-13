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
  /** Nama keluaran Y sesuai perangkat yang diceritakan (header kolom tabel target). Default 'Sinyal'. */
  outputLabel?: string;
  /** Teks lampu keluaran saat Y=0 dan Y=1 (maks. 6 karakter agar muat di lampu). Default ['LOCK', 'OPEN']. */
  lampText?: [string, string];
}

export interface HackLevel {
  level: number;
  title: string;
  description: string;
  /** Jumlah input sakelar: (A), (A,B), atau (A,B,C). */
  inputs: 1 | 2 | 3;
  /** Gerbang yang tersedia di palet untuk level ini. */
  gates: GateType[];
  /** Diselesaikan berurutan; level selesai jika semua puzzle benar. */
  puzzles: HackPuzzle[];
}

/** Fungsi singkat tiap gerbang (ditampilkan di terminal untuk gerbang yang baru muncul, dan sebagai tooltip palet). */
export const GATE_INFO: Record<GateType, string> = {
  AND: 'keluaran 1 hanya jika kedua masukan 1.',
  OR: 'keluaran 1 jika salah satu atau kedua masukan 1.',
  NOT: 'membalik masukan: 0 menjadi 1, 1 menjadi 0.',
  XOR: 'keluaran 1 jika tepat satu dari dua masukan 1.',
  NAND: 'kebalikan AND: keluaran 0 hanya jika kedua masukan 1.',
  NOR: 'kebalikan OR: keluaran 1 hanya jika kedua masukan 0.'
};

/*
 * Catatan konteks: tiap puzzle adalah SIMULASI rangkaian logika dari modul kontrol/indikator pada perangkat yang
 * diceritakan (kunci elektronik, indikator status, pemilih jalur sinyal). Gerbang logika adalah dasar rangkaian digital;
 * ia tidak dipakai langsung untuk meretas atau mendekripsi apa pun. Persamaan (label), tabel target, nama input/output,
 * dan konteks harus selalu konsisten satu sama lain.
 */
export const HACK_LEVELS: HackLevel[] = [
  {
    level: 1, title: 'AND / OR', inputs: 2, gates: ['AND', 'OR'],
    description: 'Kenali gerbang dasar AND dan OR.',
    puzzles: [
      {
        label: 'Y = A AND B', minGates: 1,
        context: 'Modul proteksi folder “keuangan” memakai autentikasi dua faktor: akses terbuka hanya jika sandi benar dan token perangkat aktif.',
        inputLabels: ['Sandi benar', 'Token aktif'], outputLabel: 'Akses folder',
        target: { '00': 0, '01': 0, '10': 0, '11': 1 }
      },
      {
        label: 'Y = A OR B', minGates: 1,
        context: 'Indikator koneksi perangkat: lampu ONLINE menyala jika kabel LAN atau Wi-Fi aktif (salah satu sudah cukup).',
        inputLabels: ['Kabel LAN aktif', 'Wi-Fi aktif'], outputLabel: 'Koneksi tersedia', lampText: ['PUTUS', 'ONLINE'],
        target: { '00': 0, '01': 1, '10': 1, '11': 1 }
      }
    ]
  },
  {
    level: 2, title: 'NOT', inputs: 1, gates: ['NOT'],
    description: 'Balikkan sinyal dengan gerbang NOT.',
    puzzles: [
      {
        label: 'Y = NOT A', minGates: 1,
        context: 'Indikator status pengawasan jaringan: sensor pengawas bernilai 1 saat jaringan sedang dipantau. Lampu AMAN harus menyala justru saat sensor itu 0 (tidak ada pemantauan), jadi sinyal sensor perlu dibalik.',
        inputLabels: ['Sensor pengawas aktif'], outputLabel: 'Status aman', lampText: ['PANTAU', 'AMAN'],
        target: { '0': 1, '1': 0 }
      }
    ]
  },
  {
    level: 3, title: 'Kombinasi 2 Gate', inputs: 2, gates: ['AND', 'OR', 'NOT'],
    description: 'Gabungkan dua gerbang.',
    puzzles: [
      {
        label: 'Y = A AND (NOT B)', minGates: 2,
        context: 'Pengunci kabinet server NODE 03: kabinet terbuka jika daya aktif dan sensor tamper tidak aktif (tamper aktif = ada yang mencoba membongkar).',
        inputLabels: ['Daya aktif', 'Sensor tamper aktif'], outputLabel: 'Kunci kabinet',
        target: { '00': 0, '01': 0, '10': 1, '11': 0 }
      }
    ]
  },
  {
    level: 4, title: 'Kombinasi 3 Gate', inputs: 3, gates: ['AND', 'OR', 'NOT'],
    description: 'Tiga input, tiga gerbang.',
    puzzles: [
      {
        label: 'Y = (A AND B) OR (NOT C)', minGates: 3,
        context: 'Kontrol akses ruang server: pintu terbuka jika autentikasi utama berhasil (kunci fisik valid dan token operator valid), atau jika akses darurat yang sah diaktifkan. Segel pecah-kaca bernilai 1 saat utuh dan 0 saat dipecahkan, jadi darurat aktif = segel bernilai 0.',
        inputLabels: ['Kunci valid', 'Token valid', 'Segel utuh'], outputLabel: 'Pintu ruang server',
        target: { '000': 1, '001': 0, '010': 1, '011': 0, '100': 1, '101': 0, '110': 1, '111': 1 }
      }
    ]
  },
  {
    level: 5, title: 'XOR / NAND / NOR', inputs: 2, gates: ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR'],
    description: 'Gerbang turunan: XOR, NAND, NOR.',
    puzzles: [
      {
        label: 'Y = A XOR B', minGates: 1,
        context: 'Pengunci sesi bergilir: log hanya terlepas jika tepat satu operator yang sedang login. Dua operator sekaligus, atau tidak ada, tetap terkunci.',
        inputLabels: ['Operator 1 login', 'Operator 2 login'], outputLabel: 'Kunci sesi',
        target: { '00': 0, '01': 1, '10': 1, '11': 0 }
      },
      {
        label: 'Y = A NAND B', minGates: 1,
        context: 'Indikator sistem keamanan: lampu NORMAL menyala kecuali sensor jendela dan sensor pintu terpicu bersamaan (indikasi penyusupan, lampu berganti SIAGA).',
        inputLabels: ['Sensor jendela terpicu', 'Sensor pintu terpicu'], outputLabel: 'Status normal', lampText: ['SIAGA', 'NORMAL'],
        target: { '00': 1, '01': 1, '10': 1, '11': 0 }
      },
      {
        label: 'Y = A NOR B', minGates: 1,
        context: 'Indikator konektivitas: lampu PUTUS menyala hanya jika kabel LAN dan Wi-Fi sama-sama mati (perangkat terputus dari jaringan).',
        inputLabels: ['Kabel LAN aktif', 'Wi-Fi aktif'], outputLabel: 'Perangkat terputus', lampText: ['ONLINE', 'PUTUS'],
        target: { '00': 1, '01': 0, '10': 0, '11': 0 }
      }
    ]
  },
  {
    level: 6, title: 'Rangkaian Kompleks', inputs: 3, gates: ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR'],
    description: 'Multiplexer: A memilih antara B dan C.',
    puzzles: [
      {
        label: 'Y = (A AND B) OR ((NOT A) AND C)', minGates: 4,
        context: 'Pusat kendali memilih sumber sinyal dengan multiplexer 2:1. Selektor A=1 meneruskan jalur utama (B), A=0 meneruskan jalur cadangan (C). Y adalah sinyal yang terpilih.',
        inputLabels: ['Selektor jalur', 'Jalur utama', 'Jalur cadangan'], outputLabel: 'Y: sinyal terpilih', lampText: ['Y=0', 'Y=1'],
        target: { '000': 0, '001': 1, '010': 0, '011': 1, '100': 0, '101': 0, '110': 1, '111': 1 }
      }
    ]
  }
];
