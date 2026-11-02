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

/** Satu baris cerita. 'Narasi' = teks narator (pembukaan, cliffhanger). */
export interface DialogueLine {
  speaker: 'Bos' | 'Aku' | 'Narasi';
  text: string;
}

/** Satu file bukti yang ditemukan setelah hacking berhasil. */
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

/** Peta Tiled milik satu chapter + titik-titik pentingnya (px dunia). Kalau layer objek 'Objek' ada di file Tiled, nilainya menimpa ini. */
export interface MapConfig {
  /** Key Phaser untuk tilemap ini (di-load di BootScene). */
  key: string;
  /** Path file peta (relatif ke folder public/). */
  file: string;
  spawn: { x: number; y: number };
  boss: { x: number; y: number };
  /** Persegi bangunan rumah/tempat target. */
  house: { x: number; y: number; w: number; h: number };
  /** Titik di DEPAN pintu target (di luar bangunan). */
  door: { x: number; y: number };
}

/** Tantangan stealth di interior (lihat systems/StealthSystem.ts). Isi `cctv` dan/atau `guards`; kosongkan = tanpa tantangan. */
export interface StealthConfig {
  /** CCTV berputar. count = jumlah kamera (ditempatkan otomatis di rute, atau pakai objek 'cctv*' di Tiled). */
  cctv?: {
    count: number;
    /** Jangkauan pandang (px dunia). */
    range?: number;
    /** Lebar kerucut pandang (derajat). */
    fovDeg?: number;
    /** Total sudut sapuan kamera (derajat). */
    sweepDeg?: number;
    /** Waktu satu siklus sapuan (ms). Makin besar = kamera makin pelan. */
    periodMs?: number;
    /** Lama terus terlihat lensa sebelum dianggap tertangkap (ms). Tanpa bar deteksi; kecil = nyaris langsung. Default 300. */
    spotMs?: number;
    /** Jatah kesempatan tertangkap CCTV. Setiap tertangkap 1 kesempatan hangus; habis = terusir dari rumah. Default 2. */
    chances?: number;
  };
  /** Bodyguard patroli. count = jumlah penjaga (otomatis, atau pakai objek 'guard*' di Tiled). */
  guards?: {
    count: number;
    /** charKey spritesheet (lihat Sprites.ts). Default 'G'. */
    charKey?: string;
    patrolSpeed?: number;
    chaseSpeed?: number;
    range?: number;
    fovDeg?: number;
    /** Radius patroli acak di sekitar posisi awal (dalam tile). */
    wanderTiles?: number;
  };
  /** Jumlah peringatan sebelum pemain diusir dari rumah. Default 3. */
  maxStrikes?: number;
  /** Toast saat masuk interior. */
  intro?: string;
}

/** Satu chapter = satu objek konfigurasi. Tambah chapter baru cukup dengan menambah entri di CHAPTERS. */
export interface ChapterConfig {
  id: number;
  /** Judul chapter, mis. "Jejak Pertama". */
  title: string;
  /** Tujuan chapter, ditampilkan sbg toast setelah pemain menekan "Mulai Misi". */
  objective: string;
  /** Pembukaan cerita (narasi + telepon Bos), ditampilkan sebelum misi dimulai. */
  briefingLog: DialogueLine[];
  suspectName: string;
  /** Warna atap rumah tersangka (hex 0xRRGGBB). */
  houseRoof: number;
  /** Peta Tiled untuk chapter ini. */
  map: MapConfig;
  schedulePattern: Record<TimeSlot, HouseStatus>;
  /** Nomor level hacking (lihat HACK_LEVELS di HackLevels.ts). */
  hackLevel: number;
  /** Peta Tiled interior chapter ini (key & file, path relatif ke folder public/). */
  interiorMap: { key: string; file: string };
  /** Judul di header interior: "Di Dalam {interiorTitle}". */
  interiorTitle: string;
  /** Label ruangan berisi komputer di interior. */
  interiorLabel: string;
  /** Narasi "Sebelum Hacking" — tampil sbg teks petunjuk selama pemain menjelajah interior. */
  interiorIntro: string;
  /** Teks layar/obrolan di awal minigame (kosongkan [] kalau tidak ada). */
  hackIntro: string[];
  /** Pesan saat jawaban salah (hanya narasi, tidak mengubah kecurigaan). */
  hackFailText: string;
  /** Pesan saat semua puzzle benar. */
  hackSuccessText: string;
  /** Bukti yang ditemukan setelah hacking berhasil. */
  evidence: EvidenceFile[];
  /** Dialog lapor ke Bos + cliffhanger (Narasi) di akhir. */
  debriefingLog: DialogueLine[];
  npcs: NpcConfig[];
  /** Jumlah warga acak (ambient) tambahan di peta. Default: AMBIENT_COUNT di MapScene.ts. */
  ambientCount?: number;
  /** Tantangan stealth di interior (CCTV / bodyguard). Opsional. */
  stealth?: StealthConfig;
}

// ---- helper penulisan dialog biar ringkas ----
const bos = (text: string): DialogueLine => ({ speaker: 'Bos', text });
const aku = (text: string): DialogueLine => ({ speaker: 'Aku', text });
const narasi = (text: string): DialogueLine => ({ speaker: 'Narasi', text });
const me = (text: string): NpcLine => ({ who: 'Aku', text });
const them = (text: string): NpcLine => ({ who: 'NPC', text });

export const CHAPTERS: ChapterConfig[] = [
  // ============================ CHAPTER 1 ============================
  {
    id: 1,
    title: 'Jejak Pertama',
    objective: 'Cari tahu kapan rumah Pak Herman kosong, masuk, lalu bobol laptopnya untuk mencari bukti transaksi.',
    briefingLog: [
      narasi('Pagi di desa. Gerobak bakso sudah siap, panci mengepul. Telepon dari Bos masuk.'),
      bos('Bank melaporkan empat belas transfer kecil dalam sebulan. Nominalnya sengaja dibuat receh supaya tidak kelihatan.'),
      aku('Semuanya dari satu rekening?'),
      bos('Atas nama Herman. Rumahnya di ujung jalan. Tapi belum tentu dia pelakunya. Amati dulu, jangan buru-buru.')
    ],
    suspectName: 'Pak Herman',
    houseRoof: 0x4a2a2a,
    map: {
      key: 'map1', file: 'assets/maps/ch1.json',
      spawn: { x: 440, y: 408 }, boss: { x: 536, y: 424 },
      house: { x: 800, y: 192, w: 112, h: 128 }, door: { x: 856, y: 328 }
    },
    schedulePattern: { Pagi: 'ada', Siang: 'ada', Sore: 'kosong', Malam: 'ada' },
    hackLevel: 1,
    interiorMap: { key: 'int1', file: 'assets/maps/int_ch1_rumah_herman.json' },
    interiorTitle: 'Rumah Pak Herman',
    interiorLabel: 'Ruang Kerja',
    interiorIntro: 'Pintu samping tidak terkunci rapat. Ruang kerja sempit, bau kopi lama. Satu laptop tua menyala, kipasnya berputar kencang. “Rumah kosong, tapi kipasnya kerja keras. Rina benar.”',
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
  },

  // ============================ CHAPTER 2 ============================
  {
    id: 2,
    title: 'Pesan yang Hilang',
    objective: 'Selidiki Mbak Melati, cari tahu kapan rumahnya kosong, dan temukan pesan yang sengaja dihapus.',
    briefingLog: [
      narasi('Hujan tipis sejak subuh. Bos menelepon lagi.'),
      bos('Dompet digital atas nama Melati S. baru dibuka dua bulan lalu. Tiap uang masuk, langsung ditarik tunai di tempat berbeda.'),
      aku('Dia tinggal di desa ini?'),
      bos('Rumahnya dua gang dari rumah Herman. Hati-hati, dia orang IT. Dulu admin sistem.')
    ],
    suspectName: 'Mbak Melati',
    houseRoof: 0x2a3a6a,
    map: {
      key: 'map2', file: 'assets/maps/ch2.json',
      spawn: { x: 328, y: 328 }, boss: { x: 664, y: 360 },
      house: { x: 448, y: 128, w: 96, h: 128 }, door: { x: 488, y: 264 }
    },
    schedulePattern: { Pagi: 'ada', Siang: 'ada', Sore: 'ada', Malam: 'kosong' },
    hackLevel: 2,
    interiorMap: { key: 'int2', file: 'assets/maps/int_ch2_rumah_melati.json' },
    interiorTitle: 'Rumah Mbak Melati',
    interiorLabel: 'Ruang Kerja Steril',
    interiorIntro: 'Rumah rapi, hampir steril. Ada rak berisi puluhan flashdisk bernomor. Di bingkai pintu ruang kerja ada sensor kecil yang kelihatan penting. “Terlalu bersih. Orang serapi ini jarang meninggalkan sesuatu tanpa sengaja.”',
    hackIntro: ['Layar laptop: ARSIP PESAN: TERKUNCI. Mode senyap aktif.'],
    hackFailText: 'Pengawas terdeteksi. Arsip menutup diri lagi. Susun ulang rangkaiannya.',
    hackSuccessText: 'Lampu OPEN, arsip pesan terbuka.',
    evidence: [
      {
        name: 'pesan_hilang.enc',
        lines: ['Pesan terenkripsi, sebagian terbaca:', '“…jalur lama masih hidup. jangan lewat Herman lagi, dia mulai curiga. lanjut lewat rumah yang punya rak besi…”']
      },
      { name: 'daftar_paket.txt', lines: ['Sebelas alamat tujuan paket, tersebar di desa dan kecamatan lain.'] }
    ],
    debriefingLog: [
      aku('Bos, ada pesan terenkripsi. Isinya “jalur lama” dan “rak besi”.'),
      bos('Jalur lama... itu bukan hal kecil. Melati bukan pelaku tunggal. Dia kurir data.'),
      aku('Dan Herman?'),
      bos('Herman cuma dipinjam, Melati cuma kurir. Berarti ada yang menyusun semuanya.'),
      narasi('Daftar paket menunjukkan sebelas alamat. Satu di antaranya adalah alamat desa ini sendiri: sebuah rumah dengan rak besi di belakang.'),
      narasi('Kasus ini tidak berhenti di satu komputer. Ini baru ujung satu kabel.')
    ],
    npcs: [
      {
        charKey: 'D', name: 'Pak Udin', x: 632, y: 376, speed: 1.0,
        conversation: [
          me('Selamat sore, Pak. Ronda ya?'),
          them('Tugas. Mau beli bakso, atau mau tanya-tanya?'),
          me('Dua-duanya, Pak. Rumah Mbak Melati itu aman?'),
          them('Aman. Tapi janggal. Tiap malam, jam tujuh sampai lewat tengah malam, rumahnya gelap. Motornya hilang.'),
          me('Jam berapa pulangnya?'),
          them('Dua kali saya lihat, pulangnya menoleh kiri-kanan dulu sebelum buka pagar. Orang normal nggak begitu.')
        ]
      },
      {
        charKey: 'C', name: 'Bu Lina', x: 504, y: 376, speed: 1.0,
        conversation: [
          me('Bu, saya mau kirim bakso beku ke saudara. Bisa, ya?'),
          them('Bisa, nanti saya bungkus. Eh, Mas jualan bakso apa nambah usaha kirim-kirim?'),
          me('Hehe, sekalian. Ramai ya, Bu?'),
          them('Ramai, tapi yang rutin itu Mbak Melati. Tiap Jumat, paket kecil, amplop tebal. Pengirimnya ganti-ganti nama, alamat tujuannya juga beda kecamatan.'),
          me('Isinya apa, Bu?'),
          them('Katanya kabel data. Tapi kok bentuknya kayak flashdisk, ya. Waktu mau saya buka, dia langsung bilang, “Jangan, Bu, rapuh.”')
        ]
      },
      {
        charKey: 'B', name: 'Dimas', x: 648, y: 280, speed: 1.0,
        conversation: [
          me('Mas Dimas ya? Temannya Mbak Melati?'),
          them('Siapa yang nanya? Eh, iya, kenapa?'),
          me('Bakso, Mas. Saya dengar orang bilang Mbak Melati aneh.'),
          them('Orang-orang suka ngarang. Melati itu baik. Malam dia di rumah, kerja lembur. Aku sering VC-an sama dia.'),
          me('Oh, jadi malam pasti ada orangnya ya.'),
          them('Pasti. Kemarin aja dia titip kunci rumah ke aku buat... eh, buat nyiram tanaman. Ya itu, tanamannya.'),
          me('Malam-malam nyiram tanaman?'),
          them('Udah lah, Bang. Jangan dibahas.')
        ]
      }
    ]
  },

  // ============================ CHAPTER 3 ============================
  {
    id: 3,
    title: 'Jaringan Lama',
    objective: 'Temukan rumah dengan “rak besi”, selidiki Pak Arman, dan buka server yang disimpan di rumahnya.',
    briefingLog: [
      narasi('Alamat ke-11 di daftar paket Melati adalah rumah di pinggir sawah, milik seorang pria yang jarang bergaul. Bos mengirim catatan singkat.'),
      bos('Namanya Arman. Dulu teknisi koperasi yang bangkrut. Sekarang ngakunya penghobi radio.'),
      aku('Penghobi radio butuh rak besi?'),
      bos('Itu yang mau kita cari tahu.')
    ],
    suspectName: 'Pak Arman',
    houseRoof: 0x2a5a3a,
    map: {
      key: 'map3', file: 'assets/maps/ch3.json',
      spawn: { x: 136, y: 408 }, boss: { x: 936, y: 456 },
      house: { x: 480, y: 512, w: 144, h: 192 }, door: { x: 536, y: 712 }
    },
    schedulePattern: { Pagi: 'kosong', Siang: 'ada', Sore: 'ada', Malam: 'ada' },
    hackLevel: 3,
    interiorMap: { key: 'int3', file: 'assets/maps/int_ch3_bangunan_seng_arman.json' },
    interiorTitle: 'Rumah Pak Arman',
    interiorLabel: 'Bangunan Seng',
    interiorIntro: 'Gembok besar ternyata hanya penghalang bayangan; pintu seng bisa digeser. Di dalam dingin, penuh lampu hijau kecil. Tiga rak besi, kabel menjalar ke lantai, satu komputer kontrol di tengah. Di salah satu rak ada label: NODE 03. “Ini bukan hobi radio.”',
    hackIntro: [],
    hackFailText: 'Alarm tamper berbunyi di panel, kabinet menutup. Susun ulang rangkaiannya.',
    hackSuccessText: 'Kabinet terbuka, konfigurasi muncul di layar.',
    evidence: [
      {
        name: 'server.conf',
        lines: ['NETWORK_NAME=BLACKBOX', 'NODE_ID=03', 'PEERS=14', 'CONTROLLER=lokasi_tidak_diketahui', 'LAST_SYNC=23:40', '(+2 baris koordinat: satu titik di belakang pasar)']
      }
    ],
    debriefingLog: [
      aku('Bos, nama jaringannya BLACKBOX. Node saya NODE 03, tapi ada empat belas peer.'),
      bos('BLACKBOX itu bukan merek. Itu nama sesuatu yang lebih besar.'),
      aku('Dan Pak Arman?'),
      bos('Satu node dari empat belas. Mungkin dia juga cuma disuruh.'),
      narasi('BLACKBOX bukan nama perangkat. Itu nama jaringan. Baris CONTROLLER menunjukkan ada satu titik yang mengendalikan empat belas node, di lokasi yang tidak tercatat.'),
      narasi('Koordinat di bawahnya menunjuk ke sebuah rumah di belakang pasar yang tidak punya nama.')
    ],
    npcs: [
      {
        charKey: 'D', name: 'Pak Joko', x: 280, y: 376, speed: 1.0,
        conversation: [
          me('Pak, saya lihat tokonya rame. Servis apa saja?'),
          them('Apa saja yang bisa dinyalain. Mau beli bakso atau mau servis, Dek?'),
          me('Bakso dulu. Oh ya, Pak Arman sering ke sini, nggak?'),
          them('Arman? Langganan lama. Tapi belakangan dia nyari barang aneh: power supply server bekas, kabel jaringan dua ratus meter, kipas pendingin yang besar.'),
          me('Buat hobi radio?'),
          them('Radio mana yang butuh barang sebanyak itu? Saya nggak nanya. Nanya itu bukan urusan saya.')
        ]
      },
      {
        charKey: 'B', name: 'Sinta', x: 440, y: 376, speed: 1.0,
        conversation: [
          me('Mbak Sinta, rumahnya dekat sawah ya? Adem sekali.'),
          them('Adem, tapi malam kadang berisik. Dari rumah Pak Arman ada dengung mesin, kayak kulkas segede lemari. Sampai subuh.'),
          me('Siang juga?'),
          them('Siang tetap ada. Tapi pagi jam tujuh, Pak Arman selalu naik angkot ke kota. Pulangnya menjelang siang. Habis dia berangkat, rumahnya sepi banget.')
        ]
      },
      {
        charKey: 'C', name: 'Pak Rudi', x: 648, y: 584, speed: 1.0,
        conversation: [
          me('Pak Rudi, kerja kurir ya? Capek, sini bakso dulu.'),
          them('Wah, rezeki. Capek sih, tapi lumayan. Eh, kamu tahu rumah Arman? Kemarin saya antar tiga kardus.'),
          me('Ke depan rumah?'),
          them('Nggak, ke pintu belakang. Disuruh taruh di bangunan seng itu. Pintunya gembok gede. Tanda terimanya pun nggak boleh pakai nama.'),
          me('Kok aneh.'),
          them('Aneh, tapi bayarannya dobel. Saya diam saja.')
        ]
      }
    ]
  },

  // ============================ CHAPTER 4 ============================
  {
    id: 4,
    title: 'Ruang Tanpa Nama',
    objective: 'Temukan siapa yang mengendalikan BLACKBOX dengan menyelidiki rumah yang ditunjuk koordinat.',
    briefingLog: [
      narasi('Koordinat itu membawa kamu ke gang sempit di belakang pasar. Satu rumah tanpa papan nama, tanpa nomor, tanpa nama di kotak surat.'),
      bos('Saya cek buku RT. Rumah itu tidak tercatat atas nama siapa pun.'),
      aku('Rumah hantu?'),
      bos('Rumah hantu yang listriknya paling boros di gang itu.'),
      aku('Ada yang jaga?'),
      bos('Tidak ada orang. Tapi ada kamera yang terus berputar. Pelajari pola putarnya, jangan jalan di depan lensanya.')
    ],
    suspectName: 'Penghuni Tanpa Nama',
    houseRoof: 0x6a2a4a,
    map: {
      key: 'map4', file: 'assets/maps/ch4.json',
      spawn: { x: 56, y: 280 }, boss: { x: 744, y: 280 },
      house: { x: 320, y: 336, w: 112, h: 128 }, door: { x: 376, y: 328 }
    },
    schedulePattern: { Pagi: 'ada', Siang: 'kosong', Sore: 'ada', Malam: 'ada' },
    hackLevel: 4,
    stealth: {
      maxStrikes: 3,
      cctv: { count: 2, range: 120, fovDeg: 50, sweepDeg: 180, periodMs: 6500, spotMs: 300, chances: 2 },
      intro: '📹 Ada CCTV berputar di lorong. Tunggu lensanya berpaling ke tembok, lalu lewat. Tepat di bawah kamera ada titik buta.'
    },
    interiorMap: { key: 'int4', file: 'assets/maps/int_ch4_rumah_tanpa_nama.json' },
    interiorTitle: 'Rumah Tanpa Nama',
    interiorLabel: 'Ruang Kendali',
    interiorIntro: 'Ruangan bersih, hampir tanpa barang pribadi. Satu meja panjang, dua monitor, headset di atasnya. Tidak ada foto, kalender, atau nama. Kopi di cangkir sudah dingin. “Seperti kantor yang dibuat supaya tidak ada orangnya.”',
    hackIntro: ['Layar utama menampilkan peta empat belas titik yang berkedip. Satu titik di tengah sedikit lebih terang dari yang lain.'],
    hackFailText: 'Peta empat belas titik mengedip merah sekali. Sistem hampir mendeteksimu. Susun ulang rangkaiannya.',
    hackSuccessText: 'Pintu direktori terbuka, file operator muncul.',
    evidence: [
      { name: 'BLACKBOX_OPERATOR.dat', lines: ['ID: 07', 'STATUS: ACTIVE', 'TOTAL_OPERATOR: 4', 'LAST_ACCESS: 2 menit lalu'] }
    ],
    debriefingLog: [
      aku('Bos, ada file operator. ID 07. Katanya total empat operator.'),
      bos('Jadi pengendalinya bukan satu orang. Tapi empat.'),
      aku('Dan “last access”-nya dua menit lalu.'),
      bos('Dari komputer itu?'),
      aku('Bukan... dari tempat lain. Tapi masih di sekitar sini.'),
      narasi('Operator 07 hanya salah satu dari empat operator, dan dia baru saja mengakses file ini. Artinya dia ada di dekat sini, dan mungkin tahu ada orang masuk.'),
      narasi('Di layar, jendela kecil menyala sebentar lalu hilang: “Tamu baru?”')
    ],
    npcs: [
      {
        charKey: 'C', name: 'Bu Yani', x: 136, y: 232, speed: 1.0,
        conversation: [
          me('Bu, pagi sekali sudah jualan ya.'),
          them('Subuh, Mas. Dari rumah jam tiga sudah bangun. Kalau nggak bisa tidur, saya suka lihat ke gang belakang pasar.'),
          me('Ada apa di sana?'),
          them('Rumah tanpa nama itu. Tengah malam ada lampu biru kedip-kedip di jendela atas. Terus ada suara pintu besi dibuka tutup. Orang masuk lewat gang belakang.'),
          me('Malam hari rame, ya.'),
          them('Ramai sekali, Mas. Jangan datang malam-malam.')
        ]
      },
      {
        charKey: 'B', name: 'Aldi', x: 680, y: 248, speed: 1.0,
        conversation: [
          me('Mas Aldi, ngojek di sini ya? Kenal rumah tanpa nama di belakang pasar?'),
          them('Sering lewat sana. Kenapa?'),
          me('Penasaran, orang yang tinggal di situ kayak apa.'),
          them('Nggak pernah lihat mukanya. Jaket abu-abu, helm hitam full-face, motor hitam tanpa plat depan. Bawa tas kotak, kayaknya laptop.'),
          me('Berangkat jam berapa?'),
          them('Biasanya tengah hari, jam sebelasan. Balik jam empat sore. Rutin banget kayak orang kantoran.')
        ]
      },
      {
        charKey: 'D', name: 'Pak Hasan', x: 728, y: 440, speed: 1.0,
        conversation: [
          me('Pak Hasan, boleh tanya sedikit soal rumah di gang belakang?'),
          them('Sudah, Mas. Jangan terlalu jauh. Dulu ada orang yang tanya-tanya, minggu depannya sudah pindah.'),
          me('Pindah ke mana?'),
          them('Saya nggak tahu, dan saya nggak mau tahu. Rumah itu dulu rumah dinas koperasi, sekarang nggak ada pemiliknya di buku RT. Siang hari memang sepi, tapi jangan ada yang lihat kamu di sana.'),
          me('Bapak takut?'),
          them('Saya sudah tua, Mas. Orang tua boleh takut.')
        ]
      }
    ]
  },

  // ============================ CHAPTER 5 ============================
  {
    id: 5,
    title: 'Operator 07',
    objective: 'Temukan Operator 07, tentukan kapan tempat kerjanya kosong, dan ambil log yang mengungkap target sebenarnya BLACKBOX.',
    briefingLog: [
      narasi('Sejak membaca “Tamu baru?”, kamu merasa diawasi. Bos menelepon dengan suara lebih berat.'),
      bos('Jejak 07 mengarah ke rumah kos dua lantai di dekat warnet. Hati-hati. Kalau dia tahu kamu ada di desa ini, kita dalam bahaya.'),
      aku('Bagaimana kalau dia sudah tahu?'),
      bos('Kalau sudah, dia lagi menunggu kamu.'),
      aku('Ada yang menjaganya?'),
      bos('Dua bodyguard bayaran, bergantian keliling. Jangan melawan. Kalau kepergok, lari dan hilang dari pandangan mereka.')
    ],
    suspectName: 'Operator 07',
    houseRoof: 0x6a5a2a,
    map: {
      key: 'map5', file: 'assets/maps/ch5.json',
      spawn: { x: 136, y: 504 }, boss: { x: 904, y: 504 },
      house: { x: 384, y: 160, w: 160, h: 144 }, door: { x: 552, y: 232 }
    },
    schedulePattern: { Pagi: 'kosong', Siang: 'ada', Sore: 'ada', Malam: 'kosong' },
    hackLevel: 5,
    stealth: {
      maxStrikes: 3,
      guards: { count: 2, charKey: 'G', patrolSpeed: 0.7, chaseSpeed: 1.15, range: 100, fovDeg: 70, wanderTiles: 5 },
      intro: '👮 Dua bodyguard berkeliling di dalam kos. Kalau terlihat, lari dan putus pandangan sampai mereka menyerah.'
    },
    interiorMap: { key: 'int5', file: 'assets/maps/int_ch5_kos_operator07.json' },
    interiorTitle: 'Kos Operator 07',
    interiorLabel: 'Kamar Atas Operator',
    interiorIntro: 'Kamar atas rapi seperti markas kecil: dua monitor, kabel LAN tertata, papan tulis kecil berisi angka 01, 03, 07, 09. “Jadi di sini mereka bergiliran.”',
    hackIntro: ['Layar: Sesi Operator — menunggu giliran login.', 'Catatan tempel: “Jangan buka log kalau ada orang lain di jaringan.”'],
    hackFailText: 'Di layar muncul pesan pendek: “Tamu belum diundang.” Susun ulang rangkaiannya.',
    hackSuccessText: 'Tiga lampu OPEN berurutan, log terbuka.',
    evidence: [
      {
        name: 'operator_log.txt',
        lines: [
          'OPERATOR_01 : AKTIF (lokasi: tidak diketahui)',
          'OPERATOR_03 : AKTIF (node: rumah Pak Arman)',
          'OPERATOR_07 : AKTIF (node: kos belakang warnet)',
          'OPERATOR_09 : AKTIF (kurir data: Melati S.)',
          'TARGET_UTAMA : SISTEM KABUPATEN',
          'STATUS : H-3',
          'CORE : KOP-LAMA'
        ]
      }
    ],
    debriefingLog: [
      aku('Bos, ada empat operator. Nol tiga itu Pak Arman, nol sembilan itu Melati.'),
      bos('Dan target utamanya Sistem Kabupaten. Tiga hari lagi.'),
      aku('Ada tulisan CORE: KOP-LAMA. Koperasi lama.'),
      bos('Gudang lama itu. Tempat segalanya dimulai.'),
      narasi('BLACKBOX tidak hanya mencuri data kecil. Mereka mempersiapkan serangan terhadap Sistem Kabupaten: data kependudukan, layanan publik, dan pembayaran desa. Waktunya H-3.'),
      narasi('Di layar muncul pesan terakhir: “Bakso-nya enak. Besok aku mampir lagi.” Operator 07 tahu siapa kamu.')
    ],
    npcs: [
      {
        charKey: 'B', name: 'Raka', x: 712, y: 472, speed: 1.0,
        conversation: [
          me('Mas, dari tadi lihat gerobak saya terus. Mau bakso?'),
          them('Eh... boleh. Tadi aku mau nanya, tapi takut.'),
          me('Takut kenapa?'),
          them('Aku dulu ikut “kerjaan online” bareng orang yang di kos itu. Panggilannya 07. Sekarang aku udah keluar.'),
          me('Orangnya kayak apa?'),
          them('Rapi. Nggak pernah salah. Pagi pasti keluar, makan di warteg, nggak pernah balik sebelum jam sepuluh. Malamnya pindah ke tempat lain buat jaga.'),
          me('Kenapa kamu keluar?'),
          them('Karena aku mulai mikir, yang kami kerjain itu buat apa. Dan aku nggak suka jawabannya.')
        ]
      },
      {
        charKey: 'C', name: 'Bu Maya', x: 568, y: 280, speed: 1.0,
        conversation: [
          me('Bu, saya jualan keliling. Boleh nitip gerobak sebentar?'),
          them('Boleh, tapi jangan lama. Saya pemilik kos ini. Kamar-kamar atas sudah lama disewa orang yang sama.'),
          me('Satu orang?'),
          them('Awalnya saya kira satu orang. Tapi tagihan listriknya aneh. Dan pernah saya dengar mereka manggil satu sama lain pakai angka. Satu, tiga, tujuh, sembilan.'),
          me('Empat orang?'),
          them('Bergantian. Kayaknya kerjanya bergiliran. Kalau malam, kamar atas selalu kosong; mereka entah jaga di mana.')
        ]
      },
      {
        // Operator 07 menyamar: sengaja tidak diberi nama asli supaya identitasnya tidak bocor.
        charKey: 'D', name: 'Pelanggan Berhoodie', x: 488, y: 472, speed: 1.0,
        conversation: [
          me('Bakso, Mas?'),
          them('Satu. Tanpa sambal. Tanpa banyak tanya juga boleh.'),
          me('Hehe, langganan di sini?'),
          them('Bisa dibilang. Abang sendiri baru, ya? Gerobaknya belum pernah lewat sini.'),
          me('Baru seminggu.'),
          them('Seminggu... cukup buat hafal jalan. Cukup juga buat hafal siapa yang jam berapa di rumah.'),
          me('Maksudnya?'),
          them('Nggak ada. Kos ujung gang itu kosong kalau siang, Bang. Jangan ganggu. Yang kebanyakan lewat sana, kadang nggak bisa pulang.')
        ]
      }
    ]
  },

  // ============================ CHAPTER 6 ============================
  {
    id: 6,
    title: 'BLACKBOX',
    objective: 'Masuk ke inti BLACKBOX di gudang bekas koperasi, hentikan serangan ke Sistem Kabupaten, dan amankan bukti utama.',
    briefingLog: [
      narasi('H-1. Gerobak bakso dipakai untuk terakhir kali. Tim kabupaten belum bisa bergerak tanpa bukti kuat, jadi semuanya bergantung padamu.'),
      bos('Satu sesi saja, tanpa kesalahan. Kalau berhasil, kita punya bukti dan serangan batal.'),
      aku('Kalau gagal?'),
      bos('Jangan gagal.'),
      aku('Penjagaannya?'),
      bos('Kamera di setiap lorong, ditambah dua penjaga. Kalau kamera menangkapmu, alarm langsung memanggil penjaga. Jangan sampai terlihat.')
    ],
    suspectName: 'Penjaga Gudang',
    houseRoof: 0x3a3a3a,
    map: {
      key: 'map6', file: 'assets/maps/ch6.json',
      spawn: { x: 136, y: 568 }, boss: { x: 1032, y: 568 },
      house: { x: 480, y: 128, w: 320, h: 224 }, door: { x: 632, y: 360 }
    },
    schedulePattern: { Pagi: 'ada', Siang: 'kosong', Sore: 'kosong', Malam: 'ada' },
    hackLevel: 6,
    stealth: {
      maxStrikes: 3,
      cctv: { count: 3, range: 130, fovDeg: 50, sweepDeg: 190, periodMs: 5200, spotMs: 300, chances: 2 },
      guards: { count: 2, charKey: 'G', patrolSpeed: 0.8, chaseSpeed: 1.25, range: 110, fovDeg: 75, wanderTiles: 6 },
      intro: '🚨 Kamera di tiap lorong dan dua penjaga. Kalau CCTV menangkapmu, alarm memanggil penjaga ke posisimu.'
    },
    interiorMap: { key: 'int6', file: 'assets/maps/int_ch6_gudang_blackbox.json' },
    interiorTitle: 'Gudang Bekas Koperasi',
    interiorLabel: 'Ruang Bawah Tanah',
    interiorIntro: 'Ruang bawah tanah lebih besar dari perkiraan. Rak-rak server berjajar, monitor besar menampilkan peta empat belas node. Satu per satu node padam: Arman, Melati... tersisa dua titik. Hitungan mundur serangan: 00:42:17.',
    hackIntro: [
      'Sebuah jendela obrolan terbuka sendiri.',
      'Operator 07: Kamu lebih cepat dari perkiraanku.',
      'Aku: Kamu Operator 07.',
      'Operator 07: Saya cuma satu bagian dari rangkaian ini.',
      'Aku: Kalau begitu, siapa yang mengendalikan semuanya?',
      'Operator 07: Kalau kamu ingin tahu... pecahkan rangkaiannya. Aku buka separuh. Jalur utama atau jalur cadangan, tergantung satu saklar. Sisanya urusanmu.'
    ],
    hackFailText: 'Hitungan mundur tetap berjalan dan angkanya merah. Susun ulang rangkaiannya sebelum waktu habis!',
    hackSuccessText: 'Hitungan mundur berhenti. Koneksi ke Sistem Kabupaten terputus. Bukti utama tersalin.',
    evidence: [
      {
        name: 'BLACKBOX_MASTER.log',
        lines: ['ROOT=OP-00', 'MIGRASI: SELESAI 03:12 -> NODE_00 (internal)', 'SERANGAN: DIBATALKAN (manual)', 'OPERATOR_01, 03, 07, 09 : dibuat oleh ROOT']
      },
      {
        name: 'aliran_dana.txt',
        lines: ['Aliran dana seluruh kasus bermuara ke satu rekening bertanda OP-00.'],
        transactions: [
          { tanggal: 'Kasus 1', keterangan: 'Setoran dana kios', dari: 'Dompet Digital Melati S.', ke: 'OP-00', jumlah: 16_450_000, status: 'Diteruskan' },
          { tanggal: 'Kasus 2', keterangan: 'Biaya pengiriman paket', dari: 'Jalur paket (11 alamat)', ke: 'OP-00', jumlah: 8_800_000, status: 'Diteruskan' },
          { tanggal: 'Kasus 3', keterangan: 'Iuran node jaringan', dari: 'NODE_03', ke: 'OP-00', jumlah: 5_250_000, status: 'Diteruskan' },
          { tanggal: 'Kasus 4', keterangan: 'Setoran operator', dari: 'OPERATOR_01', ke: 'OP-00', jumlah: 3_900_000, status: 'Diteruskan' },
          { tanggal: 'Kasus 5', keterangan: 'Setoran operator', dari: 'OPERATOR_07', ke: 'OP-00', jumlah: 7_100_000, status: 'Diteruskan' }
        ]
      }
    ],
    debriefingLog: [
      aku('Bos, serangan batal. Koneksi putus.'),
      bos('Bagus. Tim kabupaten sudah di jalan. Tapi saya perlu tahu, siapa ROOT?'),
      aku('OP-00. Bukan salah satu operator. Dia yang membuat operator.'),
      bos('Dan 07?'),
      aku('Dia membuka jalan untuk saya. Mungkin dia memang tidak mau ini terjadi.'),
      narasi('Log menunjukkan inti data sudah dipindahkan ke NODE_00 pukul 03.12, ke jaringan internal. Akun yang memerintah bukan dari luar desa. Akun itu terdaftar di dalam Sistem Kabupaten sendiri.'),
      narasi('Di layar yang hampir padam, satu pesan baru dari OP-00: “Terima kasih sudah menyingkirkan mereka untukku. BLACKBOX tidak pernah milik mereka.”'),
      narasi('Ceritanya belum selesai. Dalang sebenarnya ada di dalam sistem yang selama ini ingin dilindungi.')
    ],
    npcs: [
      {
        charKey: 'C', name: 'Pak Rudi', x: 488, y: 520, speed: 1.0,
        conversation: [
          me('Pak Rudi, masih nganter kardus ke ujung desa?'),
          them('Masih, Mas. Tapi sekarang bukan ke Arman. Ke gudang koperasi lama. Tiap Selasa dan Jumat, pagi.'),
          me('Ada yang nerima?'),
          them('Dua orang jaga. Tapi jam dua belas mereka keluar makan di warung, gerbangnya digembok dari luar. Baru balik habis maghrib.'),
          me('Jadi siang dan sore sepi?'),
          them('Dulu saya nggak mau mikir. Sekarang saya cuma mau tidur nyenyak. Bantu saya, ya.')
        ]
      },
      {
        charKey: 'B', name: 'Rina', x: 328, y: 376, speed: 1.0,
        conversation: [
          me('Dek Rina! Masih lewat gang itu tiap sore?'),
          them('Masih, Kak. Sekarang aku lewat gudang koperasi juga, jalan pintas. Pas sore gerbangnya digembok, sepi banget.'),
          me('Ada yang aneh?'),
          them('Dari celah dinding ada cahaya biru, sama kabel listrik tebal yang masuk ke tanah. Aku inget, Kak, persis kayak layar di rumah Pak Herman dulu. Aku nggak berani bilang siapa-siapa.'),
          me('Kamu hebat sudah cerita ke saya.')
        ]
      },
      {
        charKey: 'D', name: 'Pak Hasan', x: 200, y: 536, speed: 1.0,
        conversation: [
          me('Pak Hasan, saya mau tanya soal gudang koperasi.'),
          them('Kali ini saya jawab, Mas. Saya sudah capek takut.'),
          me('Apa yang bapak tahu?'),
          them('Gudang itu punya ruang bawah tanah. Dulu tempat arsip koperasi. Ketua koperasi yang lama bangkrut, uangnya nggak jelas ke mana. Beberapa bulan lalu ada orang menyewa, bawa banyak mesin.'),
          me('Siapa yang menyewa?'),
          them('Nggak pernah ketemu orangnya. Hanya perantara. Tapi pagi dan malam ada yang jaga, siangnya kosong.')
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