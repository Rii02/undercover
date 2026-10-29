import type { TimeSlot, HouseStatus } from './GameState';

/** Satu baris dalam obrolan dengan NPC: 'Aku' = pemain (tukang bakso), 'NPC' = lawan bicara. */
export interface NpcLine {
  who: 'Aku' | 'NPC';
  text: string;
}

/** Konfigurasi satu NPC sipil di peta (bukan tersangka). */
export interface NpcConfig {
  charKey: string;
  name: string;
  x: number;
  y: number;
  speed: number;
  /** Obrolan bolak-balik Aku <-> NPC. Tiap tekan E / ketuk, lanjut ke baris berikutnya; selesai = dialog tertutup. */
  conversation: NpcLine[];
}

/** Satu baris cerita. 'Narasi' = teks narator. */
export interface DialogueLine {
  speaker: 'Bos' | 'Aku' | 'Narasi';
  text: string;
}

export interface EvidenceFile {
  name: string;
  lines: string[];
  /** Opsional: kalau diisi, file manager menampilkan riwayat transaksi (tabel) saat berkas ini dibuka. */
  transactions?: TransactionRow[];
}

/** Satu baris riwayat transaksi di berkas bukti (ditampilkan di file manager). */
export interface TransactionRow {
  tanggal: string;
  keterangan: string;
  dari: string;
  ke: string;
  /** Nominal dalam rupiah. */
  jumlah: number;
  status: string;
}

/** Peta Tiled milik satu chapter + titik-titik pentingnya (px dunia). */
export interface MapConfig {
  /** Key Phaser untuk tilemap ini (di-load di BootScene). */
  key: string;
  /** Path file peta (relatif ke folder public/). */
  file: string;
  spawn: { x: number; y: number };
  /** Posisi Bos di peta (tempat melapor). */
  boss: { x: number; y: number };
  /** Titik di DEPAN pintu target (di luar bangunan). */
  door: { x: number; y: number };
  /** Persegi bangunan rumah target. */
  house: { x: number; y: number; w: number; h: number };
}

/** Satu chapter = satu objek konfigurasi. Chapter baru cukup menambah entri di CHAPTERS. */
export interface ChapterConfig {
  id: number;
  title: string;
  /** Tujuan chapter, ditampilkan sebagai toast saat game mulai. */
  objective: string;
  suspectName: string;
  /** Laporan ke Bos setelah bukti didapat (menutup chapter). */
  debriefingLog: DialogueLine[];
  /** Pembukaan cerita (narasi + telepon Bos), ditampilkan sebelum misi dimulai. */
  briefingLog: DialogueLine[];
  map: MapConfig;
  /** Jadwal rumah target: kapan ada orang / kosong. */
  schedulePattern: Record<TimeSlot, HouseStatus>;
  npcs: NpcConfig[];
  /** Jumlah warga acak (figuran). Kosong = pakai default di MapScene. */
  ambientCount?: number;
  /** Peta Tiled interior chapter ini (key & file, path relatif ke folder public/). */
  interiorMap: { key: string; file: string };
  /** Judul di header interior: "Di Dalam {interiorTitle}". */
  interiorTitle: string;
  /** Narasi yang tampil sebagai petunjuk selama pemain menjelajah interior. */
  interiorIntro: string;
  /** Level minigame hacking (lihat HackLevels.ts) yang dipakai chapter ini. */
  hackLevel: number;
  /** Narasi di terminal sebelum puzzle (boleh kosong). */
  hackIntro: string[];
  hackFailText: string;
  hackSuccessText: string;
  /** Berkas bukti yang dibuka di file manager setelah hacking berhasil. */
  evidence: EvidenceFile[];
}

// ---- helper penulisan dialog biar ringkas ----
const bos = (text: string): DialogueLine => ({ speaker: 'Bos', text });
const aku = (text: string): DialogueLine => ({ speaker: 'Aku', text });
const narasi = (text: string): DialogueLine => ({ speaker: 'Narasi', text });
const me = (text: string): NpcLine => ({ who: 'Aku', text });
const them = (text: string): NpcLine => ({ who: 'NPC', text });

export const CHAPTERS: ChapterConfig[] = [
  {
    id: 1,
    title: 'Jejak Pertama',
    objective: 'Cari tahu kapan rumah Pak Herman kosong. Dekati rumahnya di tiap waktu dan catat hasilnya.',
    suspectName: 'Pak Herman',
    briefingLog: [
      narasi('Pagi di desa. Gerobak bakso sudah siap, panci mengepul. Telepon dari Bos masuk.'),
      bos('Bank melaporkan empat belas transfer kecil dalam sebulan. Nominalnya sengaja dibuat receh supaya tidak kelihatan.'),
      aku('Semuanya dari satu rekening?'),
      bos('Atas nama Herman. Rumahnya di ujung jalan. Tapi belum tentu dia pelakunya. Amati dulu, jangan buru-buru.')
    ],
    map: {
      key: 'map1', file: 'assets/maps/ch1.json',
      spawn: { x: 440, y: 408 }, boss: { x: 536, y: 424 },
      house: { x: 800, y: 192, w: 112, h: 128 },
      door: { x: 856, y: 328 }
    },
    schedulePattern: { Pagi: 'ada', Siang: 'ada', Sore: 'kosong', Malam: 'ada' },
    interiorMap: { key: 'int1', file: 'assets/maps/int_ch1_rumah_herman.json' },
    interiorTitle: 'Rumah Pak Herman',
    interiorIntro: 'Pintu samping tidak terkunci rapat. Ruang kerja sempit, bau kopi lama. Satu laptop tua menyala, kipasnya berputar kencang. “Rumah kosong, tapi kipasnya kerja keras. Rina benar.”',
    hackLevel: 1,
    hackIntro: ['Layar: folder “keuangan” berikon gembok. Jendela kecil di pojok: Pintu Ganda — proteksi transaksi.'],
    hackFailText: 'AKSES DITOLAK. Percobaan gagal dicatat. Susun ulang gerbangnya.',
    hackSuccessText: 'Lampu panel berubah OPEN, folder terbuka, kipas laptop melambat.',
    evidence: [
      {
        name: 'transaksi_0312.csv',
        lines: ['Seluruh dana berakhir di dompet digital atas nama “Melati S.”, bukan Pak Herman.'],
        transactions: [
          { tanggal: '04 Mar 09:12', keterangan: 'Transfer masuk – pembayaran kios', dari: 'CV Tani Makmur', ke: 'Rek. Pak Herman', jumlah: 4_500_000, status: 'Berhasil' },
          { tanggal: '04 Mar 09:15', keterangan: 'Pindah dana otomatis', dari: 'Rek. Pak Herman', ke: 'Dompet Digital Melati S.', jumlah: 4_500_000, status: 'Berhasil' },
          { tanggal: '06 Mar 13:40', keterangan: 'Transfer masuk – setoran mingguan', dari: 'UD Sumber Rejeki', ke: 'Rek. Pak Herman', jumlah: 2_750_000, status: 'Berhasil' },
          { tanggal: '06 Mar 13:44', keterangan: 'Pindah dana otomatis', dari: 'Rek. Pak Herman', ke: 'Dompet Digital Melati S.', jumlah: 2_750_000, status: 'Berhasil' },
          { tanggal: '09 Mar 20:05', keterangan: 'Transfer masuk – pelunasan', dari: 'Toko Berkah', ke: 'Rek. Pak Herman', jumlah: 6_200_000, status: 'Berhasil' },
          { tanggal: '09 Mar 20:09', keterangan: 'Pindah dana otomatis', dari: 'Rek. Pak Herman', ke: 'Dompet Digital Melati S.', jumlah: 6_200_000, status: 'Berhasil' },
          { tanggal: '12 Mar 02:03', keterangan: 'Transfer keluar (sesi jarak jauh)', dari: 'Rek. Pak Herman', ke: 'Dompet Digital Melati S.', jumlah: 3_000_000, status: 'Berhasil' }
        ]
      },
      { name: 'remote_session.log', lines: ['Laptop ini dikendalikan dari jauh setiap malam sekitar pukul 02.00.'] }
    ],
    debriefingLog: [
      aku('Bos, penerimanya bukan Pak Herman. Namanya Melati S.'),
      bos('Dan laptop itu dikendalikan dari luar. Herman cuma dipinjam.'),
      aku('Berarti selama ini saya salah curiga?'),
      bos('Belum tentu. Dia tetap perlu diperiksa. Tapi sekarang kita punya nama.'),
      narasi('Sebelum pergi tadi, kursor di layar sempat bergerak sendiri. Satu baris diketik: “sesi baru dibuka”. Ada yang sedang memakai laptop itu saat itu juga.'),
      narasi('Kamu mencabut kabelnya dan layar mati. Di folder “Sampah” tinggal satu nama: Melati S.')
    ],
    npcs: [
      {
        charKey: 'C', name: 'Bu Sari', x: 696, y: 344, speed: 1.0,
        conversation: [
          me('Kopi satu, Bu. Warungnya rame terus ya.'),
          them('Alhamdulillah, Mas. Eh, baru ya jualan di sini? Biasanya yang lewat Pak Gito.'),
          me('Gantian, Bu. Itu rumah ujung jalan, langganan ibu?'),
          them('Pak Herman? Tiap pagi beli kopi sama gorengan. Sopan orangnya. Tapi laptopnya itu lho, dibawa terus, sampai ke warung.'),
          me('Kalau sore, masih sering ke sini?'),
          them('Sore nggak pernah. Jam empat motornya sudah jalan, katanya ke bengkel temannya. Balik pas maghrib. Hampir tiap hari begitu.'),
          me('Berarti sore rumahnya kosong, ya.'),
          them('Eh, ibu nggak bilang begitu ya, Mas! Nanti dikira ibu ngajarin maling.')
        ]
      },
      {
        charKey: 'D', name: 'Pak Darto', x: 808, y: 424, speed: 1.0,
        conversation: [
          me('Baksonya, Pak?'),
          them('Taruh situ. Jangan ribut, saya lagi baca berita penipuan.'),
          me('Sekarang rame ya penipuan.'),
          them('Makanya saya perhatikan siapa yang keluar masuk. Rumah Herman itu sering ada tamu. Mobil putih, plat luar kota. Datang malam, pulang sebelum subuh.'),
          me('Pak Herman kenal mereka?'),
          them('Mana saya tahu. Tapi dari tampangnya, itu penagih utang. Pasti.'),
          me('Penagih utang ya...'),
          them('Atau arisan online. Pokoknya bukan orang sini.')
        ]
      },
      {
        charKey: 'B', name: 'Rina', x: 936, y: 280, speed: 1.0,
        conversation: [
          me('Dek, mau bakso? Baru pulang sekolah?'),
          them('Setengah porsi aja, Kak, uang jajanku tinggal segitu. Iya, aku lewat gang rumah Pak Herman tiap sore.'),
          me('Ada yang aneh di sana?'),
          them('Kemarin sore pagarnya digembok, rumahnya kosong. Tapi jendela depannya ada cahaya biru, kayak layar komputer nyala.'),
          me('Mungkin lupa dimatikan.'),
          them('Mungkin. Tapi minggu lalu juga gitu. Pas aku lewat, tulisan di layarnya gerak-gerak sendiri, kayak ada yang ngetik. Padahal nggak ada orang.')
        ]
      }
    ]
  }
];

// ============================ WARGA ACAK (AMBIENT) ============================
/** Template warga figuran. Tiap chapter dimuat, MapScene mengambil beberapa secara acak dan
 *  menaruhnya di titik acak yang bisa dijangkau. Obrolannya hanya suasana — bukan petunjuk kasus. */
export interface AmbientNpcTemplate {
  charKey: string;
  name: string;
  conversation: NpcLine[];
}

export const AMBIENT_NPCS: AmbientNpcTemplate[] = [
  {
    charKey: 'C', name: 'Bu Tini',
    conversation: [
      me('Bakso, Bu? Masih hangat nih.'),
      them('Nanti ya, Mas. Ibu lagi nunggu tukang sayur lewat.'),
      me('Sayur sekarang mahal ya, Bu?'),
      them('Cabai naik terus. Belanja sekarang itung-itungannya bikin pusing.'),
      me('Semoga cepat turun, Bu.'),
      them('Amin. Semangat jualannya, Mas.')
    ]
  },
  {
    charKey: 'D', name: 'Pak Wawan',
    conversation: [
      me('Selamat siang, Pak. Baksonya?'),
      them('Wah, tadi malam saya jaga ronda, ngantuk sekali. Bakso panas cocok ini.'),
      me('Ronda aman, Pak?'),
      them('Aman-aman saja. Cuma kucing lewat sama bunyi jangkrik.'),
      me('Alhamdulillah kalau begitu.')
    ]
  },
  {
    charKey: 'B', name: 'Dek Nia',
    conversation: [
      me('Dek, mau bakso?'),
      them('Mau, Kak! Tapi uang jajanku tinggal buat setengah porsi.'),
      me('Setengah porsi pun jadi.'),
      them('Asyik! Besok ada ulangan, butuh tenaga dulu.')
    ]
  },
  {
    charKey: 'I', name: 'Pak Slamet',
    conversation: [
      me('Baksonya, Pak?'),
      them('Saya lagi nunggu burung tetangga berhenti berkicau. Berisik tapi bikin rindu.'),
      me('Burung peliharaan Bapak juga?'),
      them('Sudah dijual. Sekarang cuma jadi pendengar saja.')
    ]
  },
  {
    charKey: 'C', name: 'Bu Ratmi',
    conversation: [
      me('Bu, bakso hangatnya?'),
      them('Boleh nanti. Ibu lagi mikir menu arisan minggu depan.'),
      me('Arisan di rumah Ibu?'),
      them('Iya. Jangan sampai kehabisan kue, nanti diomongin sebulan penuh.')
    ]
  },
  {
    charKey: 'G', name: 'Mas Bagas',
    conversation: [
      me('Mas, mampir bakso?'),
      them('Sebentar, Mas. Paket saya masih banyak, alamatnya muter-muter terus.'),
      me('Kurir ya? Capek dong.'),
      them('Capek, tapi lumayan. Yang penting nggak salah alamat.')
    ]
  },
  {
    charKey: 'B', name: 'Mbak Putri',
    conversation: [
      me('Mbak, baksonya?'),
      them('Satu porsi, tanpa seledri ya. Saya lagi buru-buru, belum sempat sarapan.'),
      me('Siap. Kerjanya jauh, Mbak?'),
      them('Lumayan, naik angkot dua kali. Doakan nggak telat.')
    ]
  },
  {
    charKey: 'H', name: 'Pak Heru',
    conversation: [
      me('Pak, bakso?'),
      them('Nanti saja. Saya lagi lihat pohon mangga ini, sudah berbuah banyak.'),
      me('Wah, manis nggak, Pak?'),
      them('Belum tahu. Tunggu matang dulu. Kesabaran itu rasanya manis.')
    ]
  }
];
