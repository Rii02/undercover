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

/** Peta Tiled milik satu chapter + titik-titik pentingnya (px dunia). */
export interface MapConfig {
  /** Key Phaser untuk tilemap ini (di-load di BootScene). */
  key: string;
  /** Path file peta (relatif ke folder public/). */
  file: string;
  spawn: { x: number; y: number };
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
  /** Pembukaan cerita (narasi + telepon Bos), ditampilkan sebelum misi dimulai. */
  briefingLog: DialogueLine[];
  map: MapConfig;
  /** Jadwal rumah target: kapan ada orang / kosong. */
  schedulePattern: Record<TimeSlot, HouseStatus>;
  npcs: NpcConfig[];
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
      spawn: { x: 440, y: 408 },
      house: { x: 800, y: 192, w: 112, h: 128 }
    },
    schedulePattern: { Pagi: 'ada', Siang: 'ada', Sore: 'kosong', Malam: 'ada' },
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
