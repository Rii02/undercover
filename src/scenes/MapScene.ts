import Phaser from 'phaser';
import { GameState, dist, dirFromDelta, Direction, TIME_INTERVAL_MS } from '../state/GameState';
import { NpcConfig, NpcLine, DialogueLine, AMBIENT_NPCS, CHAPTERS } from '../state/Chapters';
import { Hud } from '../state/Hud';
import { charFrame, CHAR_SCALE_MAP, CHAR_HEIGHT_MAP } from '../state/Sprites';
import { showMissionComplete, showChapterTransition } from '../ui/MissionComplete';
import { mountStoryMenuButton } from '../ui/StoryMenu';

// ---------- Peta dari Tiled ----------
// Tiap chapter punya peta sendiri (CHAPTERS[i].map di Chapters.ts: key, file, spawn, boss, rumah, pintu).
// Semua peta memakai 4 tileset yang sama; nama (kiri) HARUS sama dgn nama tileset di Tiled,
// key (kanan) HARUS sama dgn key yang di-load di BootScene.ts.
const TILESETS = [
  { name: 'city', key: 'tiles_city' },
  { name: 'tiny-town', key: 'tiles_tiny' },
  { name: 'buildings-country_town', key: 'tiles_town' },
  { name: 'overlay-suasana', key: 'tiles_overlay' }
];
const LAYER_GROUND = 'Tile Layer 1';
const LAYER_INFRA = 'Infrastruktur';   // bangunan & pohon -> juga dipakai sbg tembok (collision)
const LAYER_EXTRA = 'Tambahan';        // hiasan + overlay suasana -> digambar DI ATAS karakter
const OBJECT_LAYER = 'Objek';          // (opsional) layer objek Tiled; kalau ada, menimpa titik dari Chapters.ts

let WORLD_W = 1280, WORLD_H = 960;     // diisi ulang dari ukuran peta di buildMap()
const VIEW_W = 360, VIEW_H = 300;

// Nilai di bawah ini DIISI ULANG tiap chapter dimuat (dari CHAPTERS[i].map, lalu layer 'Objek' kalau ada).
export const HOUSE = { x: 0, y: 0, w: 0, h: 0 };
export const DOOR_SPOT = { x: 0, y: 0 };

/** Mode kalibrasi pintu: buka game dengan `?debug=1` di URL. Lihat debugSetDoor() di bawah. */
const DEBUG_DOOR = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');
const BOSS = { x: 0, y: 0 };
const SPAWN = { x: 0, y: 0 };

/** Jumlah warga acak (ambient) per chapter kalau chapter tidak menentukan sendiri. */
const AMBIENT_COUNT = 5;

/** Jarak horizontal pusat gerobak dari avatar (px dunia). */
const CART_OFFSET_X = 20 * CHAR_SCALE_MAP;
/** Gerobak yang sudah ditaruh bisa diambil lagi kalau avatar lebih dekat dari ini. */
const CART_PICKUP_RADIUS = 56;
/** Syarat masuk rumah target: gerobak sudah ditaruh DAN avatar sudah menjauh sekurang-kurangnya sejauh ini darinya. */
const CART_LEAVE_DIST = 90;

interface Pt { x: number; y: number }

/** Perilaku NPC sipil:
 *  wander   = jalan ke titik acak (mengikuti jalur yang menghindari tembok)
 *  idle     = berhenti melakukan aktivitas (main HP, minum kopi, melamun, dst) ditandai emoji
 *  toChat   = berjalan menghampiri NPC lain untuk ngobrol
 *  chatting = berdiri ngobrol (💬)
 *  toCart   = berjalan ke gerobak bakso pemain
 *  buying   = berhenti beli bakso (🍜) */
type Behavior = 'wander' | 'idle' | 'toChat' | 'chatting' | 'toCart' | 'buying';

interface Person {
  sprite: Phaser.GameObjects.Sprite;
  label?: Phaser.GameObjects.Text;
  /** Emoji aktivitas di atas kepala (dibuat saat pertama dipakai). */
  bubble?: Phaser.GameObjects.Text;
  charKey: string;
  name: string;
  x: number; y: number;
  target: Pt;
  /** Waypoint sisa menuju tujuan (pusat tile yang bisa dilewati). Kosong = sudah sampai / belum punya tujuan. */
  path: Pt[];
  walking: boolean;
  timer: number;
  dir: Direction;
  speed: number;
  /** Obrolan Aku <-> NPC (kosong utk avatar/pemilik rumah/boss). dialogueIndex = baris yang sedang tampil. */
  dialogues: NpcLine[];
  dialogueIndex: number;
  behavior: Behavior;
  /** Timestamp (this.time.now) kapan NPC boleh mengambil keputusan baru (mis. mulai ke gerobak). */
  nextDecisionAt: number;
  /** Timestamp berakhirnya aktivitas saat ini (idle/chatting/buying) atau batas waktu (toChat/toCart). */
  until: number;
  /** Lawan bicara saat toChat/chatting. */
  partner: Person | null;
  /** Kapan jalur boleh dihitung ulang (dipakai utk target yang bergerak: gerobak, pemilik rumah). */
  repathAt: number;
  /** Hitungan frame tertahan tembok; kalau terlalu lama, jalur dibatalkan. */
  stuck: number;
}

const DIRS: ReadonlyArray<[number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]
];
const IDLE_EMOJI = ['📱', '☕', '💭', '📰', '🎧'];
const LOOK_DIRS: Direction[] = ['down', 'left', 'right', 'up'];

export class MapScene extends Phaser.Scene {
  private state!: GameState;
  private avatar!: Person;
  private npcs: Person[] = [];
  private owner!: Person & { visible: boolean };
  private boss!: { sprite: Phaser.GameObjects.Sprite; phone: Phaser.GameObjects.Text; label: Phaser.GameObjects.Text; alert: Phaser.GameObjects.Text };
  private houseOverlay!: Phaser.GameObjects.Rectangle;
  private tilemap: Phaser.Tilemaps.Tilemap | null = null;
  /** Layer bangunan/pohon — tile yg terisi di sini dianggap tembok (tidak bisa dilewati avatar). */
  private infraLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  /** Posisi awal NPC dari layer 'Objek' (key: 'npc_<nama>' huruf kecil, spasi jadi '_'). */
  private npcSpots: Record<string, { x: number; y: number }> = {};
  // ---- grid jalan (dari layer Infrastruktur) utk pathfinding NPC ----
  private walkGrid: Uint8Array = new Uint8Array(0);
  private gridW = 0;
  private gridH = 0;
  private tileSize = 16;
  /** Indeks cell yang terhubung dgn titik spawn — titik acak NPC hanya diambil dari sini supaya selalu terjangkau. */
  private reachCells: number[] = [];
  private cart!: Phaser.GameObjects.Sprite;
  /** Gerobak sedang ditaruh di tanah (true) atau didorong avatar (false). */
  private cartPlaced = false;
  private cartSpot: Pt = { x: 0, y: 0 };
  private cartFlip = false;
  private cartBtn: HTMLButtonElement | null = null;
  private lastDoorHintAt = 0;
  // Kalibrasi pintu (hanya aktif dgn ?debug=1)
  private debugGfx: Phaser.GameObjects.Graphics | null = null;
  private debugText: Phaser.GameObjects.Text | null = null;
  private debugDoors: Record<number, { x: number; y: number }> = {};
  private keys: Record<string, boolean> = {};
  private countdownTimer?: Phaser.Time.TimerEvent;
  private resizeObserver?: ResizeObserver;

  // ---- state dialog NPC ----
  private dialogueOpen = false;
  private dialogueNpc: Person | null = null;

  // ---- state dialog cerita Bos <-> Aku (briefing chapter & lapor ke Bos) ----
  private storyActive = false;
  private storyLines: DialogueLine[] = [];
  private storyIndex = 0;
  private storyCta = '';
  private storyOnDone: (() => void) | null = null;

  /** Layar "Mission Complete" / transisi chapter sedang tampil — kunci input peta (scene sedang di-pause, tapi listener window tetap hidup). */
  private overlayOpen = false;

  constructor() {
    super('Map');
  }

  create(): void {
    this.state = this.registry.get('state') as GameState;

    // Scene ini bisa dimulai ulang (tamat -> Menu -> Story lagi). Phaser memakai ulang instance yang sama,
    // jadi field class TIDAK diinisialisasi ulang — reset manual di sini supaya tidak membawa sisa permainan lama.
    this.tilemap = null; this.infraLayer = null; this.npcSpots = {}; this.npcs = [];
    this.cartPlaced = false; this.cartFlip = false; this.cartSpot = { x: 0, y: 0 };
    this.dialogueOpen = false; this.dialogueNpc = null;
    this.storyActive = false; this.storyLines = []; this.storyIndex = 0; this.storyOnDone = null;
    this.overlayOpen = false; this.keys = {}; this.lastDoorHintAt = 0;
    Hud.hideDialogue(); Hud.hideStoryLine();
    Hud.updateSuspicion(this.state);

    this.activateView();
    // Saat Map di-pause lalu di-resume (mis. setelah keluar rumah, atau setelah panel briefing ditutup),
    // kanvas & panel harus di-reparent ulang. Listener dilepas saat shutdown agar tidak menumpuk tiap restart.
    const onResume = () => this.activateView();
    this.events.on(Phaser.Scenes.Events.RESUME, onResume);

    // Pantau perubahan ukuran wadah #mapCanvasSlot (resize jendela, buka/tutup
    // devtools, dll) supaya kamera ikut menyesuaikan ukurannya secara live —
    // bukan cuma sekali waktu panel dibuka.
    const mapSlotEl = document.getElementById('mapCanvasSlot');
    if (mapSlotEl && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.fitViewToContainer());
      this.resizeObserver.observe(mapSlotEl);
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.resizeObserver?.disconnect();
      this.events.off(Phaser.Scenes.Events.RESUME, onResume);
    });

    this.buildMap();                     // tilemap chapter aktif (juga mengisi WORLD_W/H, spawn, boss, rumah, pintu)
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.fitViewToContainer();           // hitung ulang zoom dgn ukuran dunia yg sebenarnya
    this.buildHouse();
    this.buildBoss();

    this.avatar = this.makePerson('A', 'Kamu', SPAWN.x, SPAWN.y, 3, false, []);
    this.avatar.label?.destroy(); // avatar tidak perlu label nama
    this.cameras.main.setRoundPixels(true);   // cegah getar/seam tile saat kamera bergeser (zoom pecahan)
    this.cameras.main.startFollow(this.avatar.sprite, true, 1, 1);
    // Gerobak bakso (sprite beranimasi). Gagang di sisi kiri gambar -> gerobak di kanan avatar; saat menghadap kiri di-flip ke kiri.
    this.cart = this.add.sprite(0, 0, 'gerobak', 0).setOrigin(0.5, 1).setScale(CHAR_SCALE_MAP).setDepth(3);
    this.cart.play('gerobak_idle');

    this.spawnNpcsFromChapter();
    this.owner = { ...this.makePerson('E', this.state.chapter.suspectName, DOOR_SPOT.x, DOOR_SPOT.y, 1.4, true, []), visible: false };
    this.refreshOwnerTarget();

    this.bindInput();
    if (DEBUG_DOOR) {
      this.debugGfx = this.add.graphics().setDepth(60);
      this.debugText = this.add.text(0, 0, '', { fontSize: '9px', color: '#ffffff', backgroundColor: '#000000cc', padding: { x: 3, y: 2 } }).setDepth(61).setOrigin(0.5, 1);
      this.debugDoors = {};
      Hud.setToast('🛠️ Mode kalibrasi pintu: berdiri tepat di depan pintu rumah, tekan K untuk menetapkan posisi pintu.', '#ff9f43');
    }
    Hud.updateClock(this.state);
    Hud.renderLog(this.state);

    this.time.addEvent({
      delay: TIME_INTERVAL_MS, loop: true,
      callback: () => {
        this.state.advanceTime();
        Hud.updateClock(this.state);
        this.refreshOwnerTarget();
      }
    });
    this.countdownTimer = this.time.addEvent({
      delay: 1000, loop: true, callback: () => Hud.updateClockCountdown(this.state)
    });

    Hud.baksoBtn.onclick = () => { const n = this.nearestNPC(); if (n) this.openDialogue(n); };
    Hud.enterBtn.onclick = () => this.tryEnter();
    // Tombol layar sentuh untuk F (dibuat otomatis di sebelah tombol "Coba Masuk"; tidak perlu ubah HTML).
    this.cartBtn = (document.getElementById('cartBtn') as HTMLButtonElement | null) ?? (() => {
      const b = document.createElement('button');
      b.id = 'cartBtn';
      b.type = 'button';
      b.className = Hud.enterBtn.className;
      Hud.enterBtn.insertAdjacentElement('afterend', b);
      return b;
    })();
    this.cartBtn.onclick = () => this.toggleCart();
    Hud.setToast('🛒 Tekan F untuk menaruh / mengambil gerobak. Taruh gerobak dulu sebelum masuk rumah target.', '#f5a623');
    Hud.reportBtn.onclick = () => this.laporBos();
    Hud.dialogCtaBtn.onclick = () => this.advanceStory();
    // Ketuk baris teks/hint jg bisa lanjutkan obrolan (alternatif tombol E utk layar sentuh).
    const tapAdvance = () => {
      if (this.storyActive) this.advanceStory();
      else if (this.dialogueOpen) this.advanceDialogue();
    };
    Hud.dialogText.addEventListener('click', tapAdvance);
    Hud.dialogHint.addEventListener('click', tapAdvance);
    // Tombol "☰ Menu" (kembali ke menu utama) selama mode Story.
    const unmountMenuBtn = mountStoryMenuButton(() => this.returnToMenu());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unmountMenuBtn();
      Hud.dialogText.removeEventListener('click', tapAdvance);
      Hud.dialogHint.removeEventListener('click', tapAdvance);
    });

    // Chapter 1 baru dimulai -> tampilkan briefing dulu, jeda scene sampai pemain tekan "Mulai Misi".
    // Tidak boleh panggil this.scene.pause() langsung di sini: SceneManager memaksa status scene
    // jadi RUNNING tepat setelah create() ini selesai, jadi pause() akan tertimpa. Menunggu event
    // CREATE (yang ditembakkan setelah status di-set RUNNING) memastikan pause-nya benar-benar nempel.
    this.events.once(Phaser.Scenes.Events.CREATE, () => this.showBriefingThenPause());
  }

  // ---------- setup helpers ----------
  /** Pasang kanvas game ke slot panel peta & tampilkan panel yang benar. Dipanggil di create() dan tiap kali Scene ini resume. */
  private activateView(): void {
    // Urutan penting: tampilkan #mapView DULU (baru elemen #mapCanvasSlot punya ukuran
    // nyata via CSS, sebelumnya display:none => clientWidth/Height selalu 0), baru
    // sesuaikan resolusi kamera ke ukuran wadah itu, baru pindahkan kanvasnya kesana.
    document.getElementById('mapView')!.style.display = 'block';
    document.getElementById('interiorView')!.style.display = 'none';
    document.getElementById('hackView')!.style.display = 'none';
    this.fitViewToContainer();
    document.getElementById('mapCanvasSlot')!.appendChild(this.game.canvas);
  }

  /** Kamera TIDAK dikunci ke satu rasio aspek tetap (360x300) lagi — disesuaikan
   *  dinamis ke ukuran nyata elemen #mapCanvasSlot (dipanggil tiap kali panel ini
   *  aktif, dan tiap kali wadahnya berubah ukuran via ResizeObserver di create()).
   *  Jadi kanvasnya boleh jadi persegi panjang landscape lebar ATAU lebih tinggi,
   *  menyesuaikan device — bukan dipaksa satu bentuk lalu di-letterbox. Dibatasi
   *  MIN/MAX supaya tetap wajar & tidak pernah melebihi ukuran dunia (WORLD_W/H),
   *  supaya kamera selalu masih bisa mengikuti avatar tanpa nampilin area kosong
   *  di luar batas dunia. */
  private fitViewToContainer(): void {
    const slot = document.getElementById('mapCanvasSlot');
    const w = Math.round(slot?.clientWidth || 0) || VIEW_W;
    const h = Math.round(slot?.clientHeight || 0) || VIEW_H;
    // Resolusi game = ukuran piksel wadah persis, jadi tidak ada celah/letterbox di kiri-kanan.
    if (w !== this.scale.width || h !== this.scale.height) {
      this.scale.resize(w, h);
      this.cameras.main?.setSize(w, h);
    }
    // Zoom kamera: tinggi area dunia yang terlihat ± VISIBLE_H px. Zoom tidak boleh lebih kecil
    // dari yang dibutuhkan agar area terlihat tetap muat di dalam dunia (WORLD_W x WORLD_H),
    // supaya tidak pernah muncul area kosong di luar batas peta.
    const VISIBLE_H = 400;
    const zoom = Math.max(h / VISIBLE_H, w / WORLD_W, h / WORLD_H);
    this.cameras.main?.setZoom(zoom);
  }

  /** Bangun peta Tiled milik chapter aktif. Dipanggil di create() dan tiap pindah chapter
   *  (peta lama dibuang dulu). Depth: ground(0) < bangunan(1) < overlay rumah(2) < karakter(3) < hiasan atas(6). */
  private buildMap(): void {
    this.tilemap?.destroy();   // juga menghancurkan semua layer-nya
    this.tilemap = null;
    this.infraLayer = null;

    const cfg = this.state.chapter.map;
    SPAWN.x = cfg.spawn.x; SPAWN.y = cfg.spawn.y;
    BOSS.x = cfg.boss.x; BOSS.y = cfg.boss.y;
    DOOR_SPOT.x = cfg.door.x; DOOR_SPOT.y = cfg.door.y;
    Object.assign(HOUSE, cfg.house);

    const map = this.make.tilemap({ key: cfg.key });
    const tilesets = TILESETS
      .map(t => map.addTilesetImage(t.name, t.key))
      .filter((t): t is Phaser.Tilemaps.Tileset => !!t);
    if (tilesets.length !== TILESETS.length) {
      console.warn(`[MapScene] Ada tileset yg gagal dipasang di '${cfg.key}' — cek nama tileset di Tiled & key texture di BootScene.`);
    }
    this.tilemap = map;
    WORLD_W = map.widthInPixels;
    WORLD_H = map.heightInPixels;

    map.createLayer(LAYER_GROUND, tilesets)?.setDepth(0);
    this.infraLayer = map.createLayer(LAYER_INFRA, tilesets)?.setDepth(1) ?? null;
    map.createLayer(LAYER_EXTRA, tilesets)?.setDepth(6);

    this.readMapObjects(map);
    this.buildWalkGrid(map);   // setelah SPAWN final (readMapObjects) & infraLayer siap
  }

  /** Pindahkan rumah-overlay, Bos, dan kamera ke peta yang baru dimuat. */
  private applyMapToScene(): void {
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.fitViewToContainer();
    this.houseOverlay.setPosition(HOUSE.x, HOUSE.y).setSize(HOUSE.w, HOUSE.h);
    const b = this.boss;
    b.sprite.setPosition(BOSS.x, BOSS.y);
    b.phone.setPosition(BOSS.x + 11, BOSS.y - CHAR_HEIGHT_MAP * 0.6);
    b.label.setPosition(BOSS.x, BOSS.y + 10);
    b.alert.setPosition(BOSS.x, BOSS.y - CHAR_HEIGHT_MAP - 8);
  }

  /** Baca layer objek 'Objek' (kalau ada) utk menimpa posisi default spawn/boss/rumah/pintu.
   *  Di Tiled: Layer > New > Object Layer, namai 'Objek', lalu gambar objek & isi kolom Name:
   *    spawn, boss, door (Insert Point), house (Insert Rectangle),
   *    npc_<nama_npc> (Insert Point, mis. npc_bu_sari = posisi awal NPC 'Bu Sari'). */
  private readMapObjects(map: Phaser.Tilemaps.Tilemap): void {
    const layer = map.getObjectLayer(OBJECT_LAYER);
    if (!layer) {
      return; // normal: titik penting sudah diambil dari Chapters.ts
    }
    let hasDoor = false, hasHouse = false;
    this.npcSpots = {};
    for (const o of layer.objects) {
      const ox = o.x ?? 0, oy = o.y ?? 0;
      const nm = (o.name || '').toLowerCase();
      if (nm.startsWith('npc_')) { this.npcSpots[nm] = { x: ox, y: oy }; continue; }
      switch (nm) {
        case 'spawn': SPAWN.x = ox; SPAWN.y = oy; break;
        case 'boss': BOSS.x = ox; BOSS.y = oy; break;
        case 'door': DOOR_SPOT.x = ox; DOOR_SPOT.y = oy; hasDoor = true; break;
        case 'house': Object.assign(HOUSE, { x: ox, y: oy, w: o.width ?? HOUSE.w, h: o.height ?? HOUSE.h }); hasHouse = true; break;
      }
    }
    // Kalau rumah ditandai tapi pintunya tidak, taruh titik pintu tepat di bawah tengah rumah.
    if (hasHouse && !hasDoor) { DOOR_SPOT.x = HOUSE.x + HOUSE.w / 2; DOOR_SPOT.y = HOUSE.y + HOUSE.h + 12; }
  }

  /** Apakah titik dunia (px) berada di tile bangunan/pohon (layer Infrastruktur)? */
  private isSolid(x: number, y: number): boolean {
    if (!this.infraLayer) return false;
    return this.infraLayer.hasTileAtWorldXY(x, y);
  }

  /** Cek kaki karakter (2 titik kiri-kanan) menabrak tembok atau tidak. */
  private footBlocked(x: number, y: number): boolean {
    return this.isSolid(x - 5, y) || this.isSolid(x + 5, y);
  }

  private buildHouse(): void {
    // Bangunan rumah sudah ada di tilemap. Di sini cuma lapisan hijau penanda "kasus terungkap"
    // (muncul saat caseSolved). Rumah TIDAK diberi label apa pun supaya tidak membocorkan
    // rumah mana yg jadi target — semua bangunan di peta terlihat sama.
    this.houseOverlay = this.add.rectangle(HOUSE.x, HOUSE.y, HOUSE.w, HOUSE.h, 0x5affa0, 0.28)
      .setOrigin(0, 0).setDepth(2).setVisible(false);
  }

  private buildBoss(): void {
    const { frame } = charFrame('F', 'down', 0);
    const sprite = this.add.sprite(BOSS.x, BOSS.y, 'sheet', frame).setOrigin(0.5, 1).setScale(CHAR_SCALE_MAP).setDepth(3);
    const phone = this.add.text(BOSS.x + 11, BOSS.y - CHAR_HEIGHT_MAP * 0.6, '📞', { fontSize: '13px' }).setOrigin(0.5).setDepth(3);
    const label = this.add.text(BOSS.x, BOSS.y + 10, 'Bos (Telepon)', { fontSize: '9px', color: '#eef2f7', fontFamily: 'monospace' }).setOrigin(0.5, 0).setDepth(3);
    const alert = this.add.text(BOSS.x, BOSS.y - CHAR_HEIGHT_MAP - 8, '❗ Ada laporan', { fontSize: '9px', color: '#f5a623', fontFamily: 'monospace' }).setOrigin(0.5).setDepth(3).setVisible(false);
    this.boss = { sprite, phone, label, alert };
  }

  private makePerson(charKey: string, name: string, x: number, y: number, speed: number, withLabel: boolean, dialogues: NpcLine[]): Person {
    const { frame, flipX } = charFrame(charKey, 'down', 0);
    const sprite = this.add.sprite(x, y, 'sheet', frame).setOrigin(0.5, 1).setScale(CHAR_SCALE_MAP).setFlipX(flipX).setDepth(3);
    const label = withLabel
      ? this.add.text(x, y + 10, name, { fontSize: '9px', color: '#eef2f7', fontFamily: 'monospace' }).setOrigin(0.5, 0).setDepth(3)
      : undefined;
    return {
      sprite, label, charKey, name, x, y, target: { x, y }, path: [], walking: false, timer: 0, dir: 'down', speed, dialogues, dialogueIndex: 0,
      behavior: 'wander', nextDecisionAt: 0, until: 0, partner: null, repathAt: 0, stuck: 0
    };
  }

  /** Posisi gerobak bakso pemain saat ini (gerobak menempel & ikut bergerak bersama avatar). */
  private cartPosition(): { x: number; y: number } {
    if (this.cartPlaced) return this.cartSpot;
    const side = this.avatar.dir === 'left' ? -1 : 1;
    return { x: this.avatar.x + side * CART_OFFSET_X, y: this.avatar.y + 2 };
  }

  /** Titik gerobak kalau ditaruh di sisi `side` (-1 kiri / +1 kanan) avatar. */
  private cartSpotAt(side: number): Pt {
    return { x: this.avatar.x + side * CART_OFFSET_X, y: this.avatar.y + 2 };
  }

  /** Tempat gerobak muat? (tidak menimpa tembok/pohon & tidak di dalam persegi rumah target) */
  private cartSpotFree(p: Pt): boolean {
    const half = 14;   // setengah lebar kaki gerobak (px dunia)
    if (this.footBlocked(p.x - half, p.y) || this.footBlocked(p.x, p.y) || this.footBlocked(p.x + half, p.y)) return false;
    return !(p.x > HOUSE.x && p.x < HOUSE.x + HOUSE.w && p.y > HOUSE.y && p.y < HOUSE.y + HOUSE.h);
  }

  /** Tombol F: taruh gerobak di samping avatar, atau ambil lagi kalau sudah ditaruh & avatar dekat. */
  private toggleCart(): void {
    if (this.overlayOpen || this.storyActive || this.dialogueOpen || !this.scene.isActive()) return;
    if (this.cartPlaced) {
      if (dist(this.avatar.x, this.avatar.y, this.cartSpot.x, this.cartSpot.y) > CART_PICKUP_RADIUS) {
        Hud.setToast('🛒 Terlalu jauh dari gerobak. Dekati gerobakmu dulu, baru tekan F.', '#f5a623');
        return;
      }
      this.cartPlaced = false;
      Hud.setToast('🛒 Gerobak diambil lagi.', '#00d9a3');
      return;
    }
    const pref = this.avatar.dir === 'left' ? -1 : 1;
    const spot = [this.cartSpotAt(pref), this.cartSpotAt(-pref)].find(p => this.cartSpotFree(p));
    if (!spot) {
      Hud.setToast('🛒 Tidak ada ruang untuk menaruh gerobak di sini. Pindah ke tempat yang lebih lapang.', '#ff6b6b');
      return;
    }
    this.cartPlaced = true;
    this.cartSpot = { x: spot.x, y: spot.y };
    this.cartFlip = spot.x < this.avatar.x;
    Hud.setToast('🛒 Gerobak ditaruh. Tekan F di dekatnya untuk mengambil lagi.', '#00d9a3');
  }

  /** Boleh masuk rumah target? Gerobak harus sudah ditaruh dan ditinggalkan (avatar menjauh >= CART_LEAVE_DIST). */
  private cartRuleMessage(): string | null {
    if (!this.cartPlaced) return '🛒 Kamu masih mendorong gerobak bakso! Taruh dulu gerobaknya (tekan F) sebelum masuk rumah.';
    if (dist(this.avatar.x, this.avatar.y, this.cartSpot.x, this.cartSpot.y) < CART_LEAVE_DIST) {
      return '🚶 Gerobakmu masih terlalu dekat. Tinggalkan gerobak (jauhi sedikit) baru masuk rumah.';
    }
    return null;
  }

  /** Titik pembeli berdiri: tepat di depan (bawah) gerobak. */
  private cartCustomerSpot(): { x: number; y: number } {
    const c = this.cartPosition();
    return { x: c.x, y: c.y + 10 };
  }

  /** Bangun NPC sipil dari NpcConfig chapter aktif (penting utk cerita) + beberapa warga acak (ambient) sbg figuran. */
  private spawnNpcsFromChapter(): void {
    const now = this.time.now;
    const chapter = this.state.chapter;
    const list: Person[] = chapter.npcs.map((cfg: NpcConfig) => {
      const spot = this.npcSpots['npc_' + cfg.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')];
      return this.makePerson(cfg.charKey, cfg.name, spot?.x ?? cfg.x, spot?.y ?? cfg.y, cfg.speed, true, cfg.conversation);
    });

    const taken = new Set(chapter.npcs.map(c => c.name));
    const pool = Phaser.Utils.Array.Shuffle(AMBIENT_NPCS.filter(a => !taken.has(a.name)).slice());
    const count = Math.min(pool.length, chapter.ambientCount ?? AMBIENT_COUNT);
    for (let i = 0; i < count; i++) {
      const t = pool[i];
      let pt = this.randomPointInWorld(), tries = 0;
      while (dist(pt.x, pt.y, SPAWN.x, SPAWN.y) < 90 && tries++ < 15) pt = this.randomPointInWorld();
      list.push(this.makePerson(t.charKey, t.name, pt.x, pt.y, Phaser.Math.FloatBetween(0.8, 1.2), true, t.conversation));
    }

    list.forEach(p => {
      this.nudgeToWalkable(p);
      p.nextDecisionAt = now + Phaser.Math.Between(3000, 12000);
      this.applyPersonVisual(p);
    });
    this.npcs = list;
  }

  // ---------- grid jalan & pathfinding ----------
  /** Hitung grid "bisa dilewati" dari layer Infrastruktur (aturan sama persis dgn avatar: footBlocked)
   *  + flood-fill dari spawn utk mengetahui area yang terjangkau. Dipanggil di akhir buildMap(). */
  private buildWalkGrid(map: Phaser.Tilemaps.Tilemap): void {
    const T = map.tileWidth;
    this.tileSize = T;
    this.gridW = map.width;
    this.gridH = map.height;
    this.walkGrid = new Uint8Array(this.gridW * this.gridH);
    for (let ty = 0; ty < this.gridH; ty++) {
      for (let tx = 0; tx < this.gridW; tx++) {
        const cx = tx * T + T / 2, cy = ty * T + T / 2;
        this.walkGrid[ty * this.gridW + tx] = (!this.footBlocked(cx, cy) && !this.isSolid(cx, cy)) ? 1 : 0;
      }
    }
    // flood fill dari spawn (aturan gerak sama dgn A*: diagonal tak boleh memotong sudut tembok)
    this.reachCells = [];
    const start = this.nearestWalkableCell(SPAWN.x, SPAWN.y, 10);
    if (start < 0) return;
    const seen = new Uint8Array(this.walkGrid.length);
    const queue = [start];
    seen[start] = 1;
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi];
      this.reachCells.push(cur);
      const cx = cur % this.gridW, cy = Math.floor(cur / this.gridW);
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.isWalkCell(nx, ny)) continue;
        if (dx !== 0 && dy !== 0 && (!this.isWalkCell(cx + dx, cy) || !this.isWalkCell(cx, cy + dy))) continue;
        const ni = ny * this.gridW + nx;
        if (seen[ni]) continue;
        seen[ni] = 1; queue.push(ni);
      }
    }
  }

  private isWalkCell(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.gridW && ty < this.gridH && this.walkGrid[ty * this.gridW + tx] === 1;
  }

  private cellIndex(x: number, y: number): number {
    const T = this.tileSize;
    const tx = Phaser.Math.Clamp(Math.floor(x / T), 0, this.gridW - 1);
    const ty = Phaser.Math.Clamp(Math.floor(y / T), 0, this.gridH - 1);
    return ty * this.gridW + tx;
  }

  /** Cell terdekat yang bisa dilewati (mencari melingkar sampai maxR tile). -1 kalau tidak ada. */
  private nearestWalkableCell(x: number, y: number, maxR = 6): number {
    const i0 = this.cellIndex(x, y);
    const tx0 = i0 % this.gridW, ty0 = Math.floor(i0 / this.gridW);
    if (this.isWalkCell(tx0, ty0)) return i0;
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.isWalkCell(tx0 + dx, ty0 + dy)) return (ty0 + dy) * this.gridW + (tx0 + dx);
        }
      }
    }
    return -1;
  }

  /** Kalau NPC kebetulan muncul di dalam tembok/bangunan, geser ke tile bebas terdekat. */
  private nudgeToWalkable(p: Person): void {
    if (!this.footBlocked(p.x, p.y)) return;
    const c = this.nearestWalkableCell(p.x, p.y, 8);
    if (c < 0) return;
    const T = this.tileSize;
    p.x = (c % this.gridW) * T + T / 2;
    p.y = Math.floor(c / this.gridW) * T + T / 2;
  }

  /** A* 8 arah di atas walkGrid. Hasil: daftar waypoint (pusat tile, lalu titik tujuan persis kalau tujuannya bebas). Kosong = tidak ada jalur. */
  private findPath(sx: number, sy: number, ex: number, ey: number): Pt[] {
    const W = this.gridW, T = this.tileSize;
    const s = this.nearestWalkableCell(sx, sy), e = this.nearestWalkableCell(ex, ey);
    if (s < 0 || e < 0) return [];
    const N = W * this.gridH;
    const g = new Float32Array(N).fill(Infinity);
    const f = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const heap: number[] = [];
    const less = (a: number, b: number) => f[a] < f[b];
    const push = (i: number) => {
      heap.push(i);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (!less(heap[k], heap[p])) break;
        [heap[k], heap[p]] = [heap[p], heap[k]]; k = p;
      }
    };
    const pop = (): number => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let mn = k;
          if (l < heap.length && less(heap[l], heap[mn])) mn = l;
          if (r < heap.length && less(heap[r], heap[mn])) mn = r;
          if (mn === k) break;
          [heap[k], heap[mn]] = [heap[mn], heap[k]]; k = mn;
        }
      }
      return top;
    };
    const gx = e % W, gy = Math.floor(e / W);
    const heur = (i: number) => {
      const dx = Math.abs((i % W) - gx), dy = Math.abs(Math.floor(i / W) - gy);
      return dx + dy - 0.586 * Math.min(dx, dy);
    };
    g[s] = 0; f[s] = heur(s); push(s);
    while (heap.length) {
      const cur = pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === e) break;
      const cx = cur % W, cy = Math.floor(cur / W);
      for (const [dx, dy, cost] of DIRS) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.isWalkCell(nx, ny)) continue;
        if (dx !== 0 && dy !== 0 && (!this.isWalkCell(cx + dx, cy) || !this.isWalkCell(cx, cy + dy))) continue;
        const ni = ny * W + nx;
        if (closed[ni]) continue;
        const ng = g[cur] + cost;
        if (ng < g[ni]) { g[ni] = ng; f[ni] = ng + heur(ni); came[ni] = cur; push(ni); }
      }
    }
    if (!closed[e]) return [];
    const out: Pt[] = [];
    for (let i = e; i !== -1; i = came[i]) out.push({ x: (i % W) * T + T / 2, y: Math.floor(i / W) * T + T / 2 });
    out.reverse();
    if (!this.footBlocked(ex, ey) && this.cellIndex(ex, ey) === e) out.push({ x: ex, y: ey });
    return out;
  }

  /** Hitung jalur p -> (x,y) dan simpan di p.path. true kalau ada jalur. */
  private setDestination(p: Person, x: number, y: number): boolean {
    p.target = { x, y };
    p.path = this.findPath(p.x, p.y, x, y);
    p.stuck = 0;
    return p.path.length > 0;
  }

  /** Jalan satu langkah menyusuri p.path (tetap dicek ulang terhadap tembok seperti avatar).
   *  Mengembalikan true kalau tidak ada lagi jalur yg harus ditempuh (sudah sampai atau menyerah). */
  private followPath(p: Person): boolean {
    const wp = p.path[0];
    if (!wp) { p.walking = false; p.timer = 0; return true; }
    const dx = wp.x - p.x, dy = wp.y - p.y, d = Math.hypot(dx, dy);
    p.walking = true;
    const nd = dirFromDelta(dx, dy); if (nd) p.dir = nd;
    if (d <= p.speed) {
      p.x = wp.x; p.y = wp.y; p.path.shift(); p.stuck = 0;
    } else {
      const nx = p.x + dx / d * p.speed, ny = p.y + dy / d * p.speed;
      let moved = false;
      if (!this.footBlocked(nx, p.y)) { p.x = nx; moved = true; }
      if (!this.footBlocked(p.x, ny)) { p.y = ny; moved = true; }
      p.stuck = moved ? 0 : p.stuck + 1;
    }
    p.timer++;
    if (p.stuck > 30) p.path = [];   // tertahan lama -> menyerah, pilih tujuan baru
    if (p.path.length === 0) { p.walking = false; p.timer = 0; return true; }
    return false;
  }

  /** Titik acak yang bisa dijangkau dari spawn, tidak menimpa tembok & tidak terlalu dekat rumah target. */
  private randomPointInWorld(): Pt {
    const T = this.tileSize;
    if (this.reachCells.length === 0) return { x: WORLD_W / 2, y: WORLD_H / 2 };
    let x = 0, y = 0, tries = 0;
    do {
      const idx = this.reachCells[Math.floor(Math.random() * this.reachCells.length)];
      x = (idx % this.gridW) * T + T / 2 + Phaser.Math.Between(-2, 2);
      y = Math.floor(idx / this.gridW) * T + T / 2 + Phaser.Math.Between(-2, 2);
      tries++;
    } while (this.pointBlocked(x, y) && tries < 60);
    return { x, y };
  }
  /** Titik acak di sekitar `from` (radius px); kalau tidak ketemu, titik acak di mana saja. */
  private randomPointNear(from: Pt, radius: number): Pt {
    for (let i = 0; i < 40; i++) {
      const q = this.randomPointInWorld();
      if (dist(q.x, q.y, from.x, from.y) < radius) return q;
    }
    return this.randomPointInWorld();
  }
  /** Titik tidak boleh dipilih kalau menimpa bangunan/pohon, atau terlalu dekat rumah target. */
  private pointBlocked(x: number, y: number): boolean {
    if (this.footBlocked(x, y)) return true;
    return x > HOUSE.x - 25 && x < HOUSE.x + HOUSE.w + 25 && y > HOUSE.y - 25 && y < HOUSE.y + HOUSE.h + 25;
  }
  private randomFarPointFromHouse(): Pt {
    let p = this.randomPointInWorld(), tries = 0;
    const hc = { x: HOUSE.x + HOUSE.w / 2, y: HOUSE.y + HOUSE.h / 2 };
    while (dist(p.x, p.y, hc.x, hc.y) < 280 && tries < 15) { p = this.randomPointInWorld(); tries++; }
    return p;
  }

  /** Tentukan tujuan pemilik rumah sesuai jadwal. Jalurnya dihitung di stepOwner() (menghindari tembok). */
  private refreshOwnerTarget(): void {
    const o = this.owner;
    if (this.state.currentStatus === 'kosong') {
      if (!o.visible) { o.x = DOOR_SPOT.x; o.y = DOOR_SPOT.y; o.visible = true; }
      o.target = this.randomFarPointFromHouse();
    } else {
      o.visible = true;
      o.target = { x: DOOR_SPOT.x, y: DOOR_SPOT.y };
    }
    o.path = []; o.repathAt = 0;
  }

  // ---------- input ----------
  private bindInput(): void {
    const map: Record<string, string> = {
      arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down',
      arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right'
    };
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (map[k]) this.keys[map[k]] = true;
      if (k === 'e') this.handleInteract();
      if (k === 'f' && !e.repeat) this.toggleCart();
      if (k === 'k' && DEBUG_DOOR && !e.repeat) this.debugSetDoor();
    };
    const ku = (e: KeyboardEvent) => { const k = e.key.toLowerCase(); if (map[k]) this.keys[map[k]] = false; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    this.events.once('shutdown', () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      this.countdownTimer?.remove();
    });
    const bindHold = (id: string, dir: string) => {
      const el = document.getElementById(id)!;
      el.addEventListener('pointerdown', () => this.keys[dir] = true);
      el.addEventListener('pointerup', () => this.keys[dir] = false);
      el.addEventListener('pointerleave', () => this.keys[dir] = false);
    };
    bindHold('btnUp', 'up'); bindHold('btnDown', 'down'); bindHold('btnLeft', 'left'); bindHold('btnRight', 'right');
  }

  /** KALIBRASI PINTU (?debug=1): tekan K saat berdiri di depan pintu rumah -> posisi itu jadi DOOR_SPOT (langsung berlaku),
   *  dicetak ke Console, dan disalin ke clipboard sebagai baris siap-tempel untuk `map.door` di Chapters.ts. */
  private debugSetDoor(): void {
    const x = Math.round(this.avatar.x / 4) * 4, y = Math.round(this.avatar.y / 4) * 4;
    DOOR_SPOT.x = x; DOOR_SPOT.y = y;
    const ch = this.state.chapter;
    this.debugDoors[ch.id] = { x, y };
    const line = `door: { x: ${x}, y: ${y} }`;
    console.log(`[Debug] Chapter ${ch.id} -> ${line}`);
    console.table(this.debugDoors);
    navigator.clipboard?.writeText(line).catch(() => { /* clipboard tidak tersedia: pakai Console */ });
    Hud.setToast(`📍 Pintu Chapter ${ch.id}: ${line} (disalin ke clipboard)`, '#00d9a3');
  }

  /** Overlay kalibrasi: kotak rumah (kuning), titik pintu + radius aktif "Coba Masuk" (merah), koordinat kaki avatar. */
  private drawDebug(): void {
    const g = this.debugGfx!;
    g.clear();
    g.lineStyle(1, 0xffd54a, 1).strokeRect(HOUSE.x, HOUSE.y, HOUSE.w, HOUSE.h);
    g.lineStyle(1, 0xff4040, 0.9).strokeCircle(DOOR_SPOT.x, DOOR_SPOT.y, 34);
    g.fillStyle(0xff4040, 1).fillCircle(DOOR_SPOT.x, DOOR_SPOT.y, 2.5);
    this.debugText!.setText(`kaki ${Math.round(this.avatar.x)},${Math.round(this.avatar.y)} | pintu ${DOOR_SPOT.x},${DOOR_SPOT.y} | K = set pintu`)
      .setPosition(Math.round(this.avatar.x), Math.round(this.avatar.y) - 34);
  }

  private handleInteract(): void {
    if (this.overlayOpen) return;
    if (this.storyActive) { this.advanceStory(); return; }
    if (this.dialogueOpen) { this.advanceDialogue(); return; }
    if (this.nearNPC() && !Hud.baksoBtn.disabled) { const n = this.nearestNPC(); if (n) this.openDialogue(n); }
    else if (this.nearDoor() && !Hud.enterBtn.disabled) this.tryEnter();
    else if (this.nearBoss() && !Hud.reportBtn.disabled) this.laporBos();
  }

  // ---------- queries (radius identik dengan kode asli) ----------
  private nearHouse(): boolean {
    // Jarak avatar ke TEPI persegi rumah (bukan ke pusat), krn ukuran rumah di peta Tiled bebas.
    const cx = Phaser.Math.Clamp(this.avatar.x, HOUSE.x, HOUSE.x + HOUSE.w);
    const cy = Phaser.Math.Clamp(this.avatar.y, HOUSE.y, HOUSE.y + HOUSE.h);
    return dist(this.avatar.x, this.avatar.y, cx, cy) < 50;
  }
  private nearDoor(): boolean { return dist(this.avatar.x, this.avatar.y, DOOR_SPOT.x, DOOR_SPOT.y) < 34; }
  private nearestNPC(): Person | null {
    let best: Person | null = null, bestD = 44;
    for (const n of this.npcs) { const d = dist(this.avatar.x, this.avatar.y, n.x, n.y); if (d < bestD) { bestD = d; best = n; } }
    return best;
  }
  private nearNPC(): boolean { return !!this.nearestNPC(); }
  private nearBoss(): boolean { return dist(this.avatar.x, this.avatar.y, BOSS.x, BOSS.y) < 40; }

  // ---------- dialog NPC ----------
  /** Tekan E / tombol "Ajak Bicara" -> langsung mulai obrolan dengan NPC (tanpa menu pilihan). */
  private openDialogue(npc: Person): void {
    if (npc.dialogues.length === 0) return;
    this.dialogueOpen = true;
    this.dialogueNpc = npc;
    npc.dialogueIndex = 0; // tiap ngobrol diputar dari awal
    const face = dirFromDelta(this.avatar.x - npc.x, this.avatar.y - npc.y); if (face) npc.dir = face; // NPC menghadap pemain
    this.showNpcLine(npc);
  }

  private showNpcLine(npc: Person): void {
    const line = npc.dialogues[npc.dialogueIndex];
    // Potret: MC selalu di kiri, NPC yang diajak bicara di kanan.
    Hud.showDialogue(line.who === 'Aku' ? '🧑 Aku' : npc.name, line.text,
      { npcChar: npc.charKey, speaker: line.who === 'Aku' ? 'me' : 'npc' });
  }

  /** Dipanggil saat pemain tekan E / ketuk sementara dialog terbuka: lanjut ke baris obrolan berikutnya,
   *  atau tutup dialog kalau obrolan habis. */
  private advanceDialogue(): void {
    const npc = this.dialogueNpc;
    if (npc && npc.dialogueIndex < npc.dialogues.length - 1) {
      npc.dialogueIndex++;
      this.showNpcLine(npc);
      return;
    }
    this.closeDialogue();
  }

  private closeDialogue(): void {
    this.dialogueOpen = false;
    this.dialogueNpc = null;
    Hud.hideDialogue();
  }

  // ---------- dialog cerita Bos <-> Aku ----------
  /** Mulai obrolan cerita satu baris demi satu baris (spt ngobrol dgn NPC), di dalam map yang sama
   *  (bukan panel terpisah). Dipakai utk briefing awal chapter & laporan ke Bos di akhir chapter. */
  private playStory(lines: DialogueLine[], ctaLabel: string, onDone: () => void): void {
    this.storyLines = lines;
    this.storyIndex = 0;
    this.storyCta = ctaLabel;
    this.storyActive = true;
    this.storyOnDone = onDone;
    this.showStoryLine();
  }

  private showStoryLine(): void {
    const line = this.storyLines[this.storyIndex];
    const isLast = this.storyIndex === this.storyLines.length - 1;
    Hud.showStoryLine(line, isLast, this.storyCta);
  }

  /** Dipanggil saat pemain menekan E / mengetuk kotak dialog / menekan tombol CTA di baris terakhir. */
  private advanceStory(): void {
    if (!this.storyActive) return;
    if (this.storyIndex < this.storyLines.length - 1) {
      this.storyIndex++;
      this.showStoryLine();
      return;
    }
    this.storyActive = false;
    Hud.hideStoryLine();
    const done = this.storyOnDone;
    this.storyOnDone = null;
    done?.();
  }

  // ---------- actions ----------
  private jualBakso(npc: Person | null): void {
    const target = npc || this.nearestNPC();
    this.state.suspicion = 0;
    Hud.setToast('🍜 ' + (target ? target.name : 'Warga') + ' beli bakso — kecurigaan mereda, penyamaranmu makin kuat!', '#00d9a3');
  }

  private tryEnter(): void {
    const blocked = this.cartRuleMessage();
    if (blocked) { Hud.setToast(blocked, '#f5a623'); return; }
    this.state.setObservation();
    Hud.renderLog(this.state);
    if (this.state.currentStatus === 'kosong') {
      Hud.setToast('✅ Rumah kosong, kamu berhasil menyelinap masuk!', '#00d9a3');
      this.scene.pause();
      this.scene.launch('Interior');
    } else {
      Hud.setToast('❌ KETAHUAN! Pemilik rumah memergokimu di depan pintu. Kabur!', '#ff6b6b');
      this.state.suspicion = 0;
      this.avatar.x = SPAWN.x; this.avatar.y = SPAWN.y;
    }
  }

  /** Keluar dari Story ke menu utama (progres sudah tersimpan otomatis; menu menawarkan "Lanjutkan Story"). */
  private returnToMenu(): void {
    if (this.overlayOpen) return;   // sedang transisi / Mission Complete
    document.getElementById('fmOverlay')?.classList.remove('show');
    Hud.hideDialogue(); Hud.hideStoryLine();
    this.scene.stop('Interior');
    this.scene.stop('Hacking');
    this.scene.start('Menu');
  }

  private laporBos(): void {
    if (this.overlayOpen) return;
    this.state.missionReported = true;
    const chapter = this.state.chapter;
    const hasNext = this.state.hasNextChapter;
    Hud.setToast('📞 Menghubungi Bos...', '#00d9a3');
    this.scene.pause();
    // Chapter 1..N-1: tombol "Lanjut" -> transisi pindah peta. Chapter terakhir: tombol "Complete" -> layar Mission Complete.
    const ctaLabel = hasNext ? 'Lanjut ke Chapter Berikutnya ▶' : '✅ Complete';
    this.playStory(chapter.debriefingLog, ctaLabel, () => {
      this.overlayOpen = true;
      if (hasNext) {
        const next = CHAPTERS[this.state.chapterIndex + 1];
        showChapterTransition(
          { chapterId: next.id, title: next.title },
          () => this.loadNextChapterIntoScene(),          // peta diganti saat layar tertutup
          () => { this.overlayOpen = false; this.showBriefingThenPause(); }
        );
      } else {
        showMissionComplete({ chapterId: chapter.id, chapterTitle: chapter.title }, () => {
          // Tamat: kembali ke menu pilih mode. Progres di-reset saat Story dipilih lagi (MenuScene).
          this.overlayOpen = false;
          this.state.storyInProgress = false;   // tamat: menu tidak menawarkan "Lanjutkan" lagi
          this.scene.start('Menu');
        });
      }
    });
  }

  /** Muat chapter berikutnya: reset state via GameState.loadChapter(), lalu reset seluruh
   *  visual peta (posisi avatar, NPC baru & dialognya, warna atap, label tersangka, dll)
   *  tanpa perlu menulis ulang Scene dari nol. */
  private loadNextChapterIntoScene(): void {
    this.state.loadChapter(this.state.chapterIndex + 1);

    // Ganti peta ke milik chapter baru (juga menimpa SPAWN/BOSS/HOUSE/DOOR_SPOT).
    this.buildMap();
    this.applyMapToScene();

    this.avatar.x = SPAWN.x; this.avatar.y = SPAWN.y; this.avatar.dir = 'down'; this.avatar.walking = false;
    this.cartPlaced = false;   // chapter baru: gerobak kembali didorong

    this.npcs.forEach(n => { n.sprite.destroy(); n.label?.destroy(); n.bubble?.destroy(); });
    this.spawnNpcsFromChapter();

    this.owner.name = this.state.chapter.suspectName;
    this.owner.label?.setText(this.state.chapter.suspectName);
    this.owner.x = DOOR_SPOT.x; this.owner.y = DOOR_SPOT.y; this.owner.visible = true;
    this.refreshOwnerTarget();

    this.houseOverlay.setVisible(false);
    this.boss.alert.setVisible(false);
    this.boss.label.text = 'Bos (Telepon)';

    Hud.updateClock(this.state);
    Hud.renderLog(this.state);
    Hud.updateSuspicion(this.state);
    Hud.setToast('🛒 Tekan F untuk menaruh / mengambil gerobak. Taruh gerobak dulu sebelum masuk rumah target.', '#f5a623');
  }

  private showBriefingThenPause(): void {
    Hud.setChapterHeader(this.state.chapter);
    // Setelah refresh: briefing yang sudah dibaca tidak diputar ulang.
    if (this.state.briefingSeen) {
      Hud.setToast('🎯 ' + this.state.chapter.objective, '#00d9a3');
      return;
    }
    this.scene.pause();
    this.playStory(this.state.chapter.briefingLog, '▶ Mulai Misi', () => {
      this.state.briefingSeen = true;
      this.scene.resume();
      Hud.setToast('🎯 ' + this.state.chapter.objective, '#00d9a3');
    });
  }

  // ---------- loop ----------
  update(): void {
    if (DEBUG_DOOR) this.drawDebug();
    // Saat dialog NPC terbuka, kunci gerakan avatar supaya pemain tidak jalan sambil ngobrol.
    if (this.dialogueOpen) {
      this.keys.up = this.keys.down = this.keys.left = this.keys.right = false;
    }

    const speed = 3;
    let dx = 0, dy = 0;
    if (this.keys.up) dy -= speed;
    if (this.keys.down) dy += speed;
    if (this.keys.left) dx -= speed;
    if (this.keys.right) dx += speed;
    this.avatar.walking = !!(dx || dy);
    if (this.avatar.walking) {
      const nd = dirFromDelta(dx, dy); if (nd) this.avatar.dir = nd;
      // Gerak per sumbu supaya avatar bisa "menyusur" tembok, dan tidak tembus bangunan/pohon.
      const nx = Phaser.Math.Clamp(this.avatar.x + dx, 12, WORLD_W - 12);
      const ny = Phaser.Math.Clamp(this.avatar.y + dy, 12, WORLD_H - 12);
      if (!this.footBlocked(nx, this.avatar.y)) this.avatar.x = nx;
      if (!this.footBlocked(this.avatar.x, ny)) this.avatar.y = ny;
      this.avatar.timer++;
    } else { this.avatar.timer = 0; }
    this.applyPersonVisual(this.avatar);
    const cp = this.cartPosition();
    this.cart.setFlipX(this.cartPlaced ? this.cartFlip : this.avatar.dir === 'left').setPosition(Math.round(cp.x), Math.round(cp.y));

    this.npcs.forEach(n => this.updateNpcBehavior(n));
    this.stepOwner();

    this.houseOverlay.setVisible(this.state.caseSolved);
    this.boss.label.text = this.state.missionReported ? 'Kasus Selesai ✅' : 'Bos (Telepon)';
    this.boss.alert.setVisible(this.state.caseSolved && !this.state.missionReported);

    if (this.nearHouse()) {
      this.state.suspicion = Math.min(100, this.state.suspicion + 0.35);
      if (this.state.recordObservationIfNew()) {
        Hud.renderLog(this.state);
        const status = this.state.currentStatus;
        Hud.setToast('👀 Kamu mengamati: rumah sedang ' + (status === 'kosong' ? 'KOSONG' : 'ADA ORANG') + ' (' + this.state.currentSlot + ')', '#f5a623');
      }
    } else {
      this.state.suspicion = Math.max(0, this.state.suspicion - 0.15);
    }
    Hud.updateSuspicion(this.state);
    if (this.state.suspicion >= 100) {
      Hud.setToast('🚨 Kamu terlalu lama nongkrong, warga curiga! Menjauh dulu...', '#ff6b6b');
      this.state.suspicion = 0;
      this.avatar.x = SPAWN.x; this.avatar.y = SPAWN.y;
    }

    Hud.baksoBtn.disabled = !this.nearNPC() || this.dialogueOpen;
    Hud.enterBtn.disabled = !(this.nearDoor() && !this.state.caseSolved) || this.dialogueOpen;
    if (this.cartBtn) {
      const nearCart = dist(this.avatar.x, this.avatar.y, this.cartSpot.x, this.cartSpot.y) <= CART_PICKUP_RADIUS;
      const label = this.cartPlaced ? '🛒 Ambil Gerobak (F)' : '🛒 Taruh Gerobak (F)';
      if (this.cartBtn.textContent !== label) this.cartBtn.textContent = label;
      this.cartBtn.disabled = this.dialogueOpen || (this.cartPlaced && !nearCart);
    }
    // Petunjuk sekali-sekali saat pemain di depan pintu tapi belum memenuhi syarat gerobak.
    if (this.nearDoor() && !this.state.caseSolved && this.cartRuleMessage() && this.time.now - this.lastDoorHintAt > 6000) {
      this.lastDoorHintAt = this.time.now;
      Hud.setToast(this.cartRuleMessage()!, '#f5a623');
    }
    Hud.reportBtn.disabled = !(this.nearBoss() && this.state.caseSolved && !this.state.missionReported) || this.dialogueOpen;
  }

  // ---------- perilaku NPC ----------
  private setBubble(p: Person, emoji: string | null): void {
    if (!emoji) { p.bubble?.setVisible(false); return; }
    const b = p.bubble ?? this.add.text(p.x, p.y - CHAR_HEIGHT_MAP - 6, emoji, { fontSize: '12px' }).setOrigin(0.5).setDepth(4);
    p.bubble = b;
    b.setText(emoji).setVisible(true);
  }

  private startWander(n: Person): void {
    n.behavior = 'wander';
    n.path = [];
    n.partner = null;
    this.setBubble(n, null);
  }

  private startIdle(n: Person, now: number): void {
    n.behavior = 'idle';
    n.walking = false; n.timer = 0;
    n.until = now + Phaser.Math.Between(4000, 9000);
    n.dir = Phaser.Utils.Array.GetRandom(LOOK_DIRS);
    this.setBubble(n, Phaser.Utils.Array.GetRandom(IDLE_EMOJI));
  }

  /** Mencoba mengajak NPC lain di dekat sini ngobrol. true kalau berhasil memulai. */
  private startChat(n: Person, now: number): boolean {
    const cands = this.npcs.filter(o => o !== n && (o.behavior === 'wander' || o.behavior === 'idle')
      && dist(o.x, o.y, n.x, n.y) < 350 && !(this.dialogueOpen && this.dialogueNpc === o));
    if (cands.length === 0) return false;
    const p = Phaser.Utils.Array.GetRandom(cands);
    const spots: Pt[] = [{ x: p.x - 20, y: p.y }, { x: p.x + 20, y: p.y }, { x: p.x, y: p.y + 14 }, { x: p.x, y: p.y - 14 }];
    const spot = spots.find(s => !this.footBlocked(s.x, s.y));
    if (!spot || !this.setDestination(n, spot.x, spot.y)) return false;
    // lawan bicara berhenti & menunggu
    p.behavior = 'chatting'; p.path = []; p.walking = false; p.timer = 0;
    p.partner = n; p.until = now + 20000;
    this.setBubble(p, '💬');
    n.behavior = 'toChat'; n.partner = p; n.until = now + 20000;
    this.setBubble(n, null);
    return true;
  }

  private endChat(n: Person): void {
    const p = n.partner;
    this.startWander(n);
    if (p && p.partner === n && p.behavior === 'chatting') this.startWander(p);
  }

  /** Dipanggil saat NPC selesai berjalan ke tujuan wander: pilih aktivitas berikutnya. */
  private onArrive(n: Person, now: number): void {
    const r = Math.random();
    if (r < 0.5) this.startIdle(n, now);
    else if (r < 0.75 && this.startChat(n, now)) return;
    else if (r < 0.75) this.startIdle(n, now);
    else n.path = [];   // langsung jalan lagi ke titik lain
  }

  /** Atur perilaku satu NPC sipil tiap frame. Semua gerak mengikuti jalur yang menghindari
   *  tembok/bangunan (Infrastruktur), sama seperti avatar. Diam total kalau sedang diajak ngobrol pemain. */
  private updateNpcBehavior(n: Person): void {
    if (this.dialogueOpen && this.dialogueNpc === n) {
      n.walking = false;
      this.applyPersonVisual(n);
      return;
    }
    const now = this.time.now;

    // Sesekali tertarik beli bakso (hanya saat sedang santai).
    if ((n.behavior === 'wander' || n.behavior === 'idle') && now >= n.nextDecisionAt) {
      n.nextDecisionAt = now + Phaser.Math.Between(9000, 16000);
      if (Math.random() < 0.4) {
        n.behavior = 'toCart'; n.path = []; n.repathAt = 0; n.until = now + 15000;
        this.setBubble(n, null);
      }
    }

    switch (n.behavior) {
      case 'wander': {
        if (n.path.length === 0) {
          const t = this.randomPointNear(n, 240);
          if (!this.setDestination(n, t.x, t.y)) { this.startIdle(n, now); break; }
        }
        if (this.followPath(n)) this.onArrive(n, now);
        break;
      }
      case 'idle': {
        n.walking = false;
        if (now >= n.until) this.startWander(n);
        break;
      }
      case 'toChat': {
        const p = n.partner;
        if (!p || p.behavior !== 'chatting' || now > n.until) { this.endChat(n); break; }
        if (this.followPath(n)) {
          if (dist(n.x, n.y, p.x, p.y) < 40) {
            const end = now + Phaser.Math.Between(4000, 8000);
            n.behavior = 'chatting'; n.until = end; p.until = end;
            const a = dirFromDelta(p.x - n.x, p.y - n.y); if (a) n.dir = a;
            const b = dirFromDelta(n.x - p.x, n.y - p.y); if (b) p.dir = b;
            this.setBubble(n, '💬'); this.setBubble(p, '💬');
          } else this.endChat(n);
        }
        break;
      }
      case 'chatting': {
        n.walking = false;
        if (now >= n.until) this.endChat(n);
        break;
      }
      case 'toCart': {
        const c = this.cartCustomerSpot();
        if (now >= n.repathAt) {
          n.repathAt = now + 500;
          if (!this.setDestination(n, c.x, c.y)) { this.startWander(n); break; }
        }
        this.followPath(n);
        if (dist(n.x, n.y, c.x, c.y) < 20) {
          n.path = []; n.walking = false; n.timer = 0;
          n.behavior = 'buying'; n.until = now + 1600;
          this.setBubble(n, '🍜');
          this.jualBakso(n);
        } else if (now > n.until) this.startWander(n);
        break;
      }
      case 'buying': {
        n.walking = false;
        if (now >= n.until) {
          this.startWander(n);
          n.nextDecisionAt = now + Phaser.Math.Between(10000, 18000);
        }
        break;
      }
    }
    this.applyPersonVisual(n);
  }

  private stepOwner(): void {
    const o = this.owner;
    const now = this.time.now;
    if (o.path.length === 0) {
      const d = dist(o.x, o.y, o.target.x, o.target.y);
      if (d > 8) {
        if (now >= o.repathAt) { o.repathAt = now + 1000; this.setDestination(o, o.target.x, o.target.y); }
      } else if (this.state.currentStatus === 'ada') {
        o.visible = false;
      } else {
        o.target = this.randomFarPointFromHouse();
        o.repathAt = 0;
      }
    }
    this.followPath(o);
    this.applyPersonVisual(o);
    o.sprite.setVisible(o.visible);
    o.label?.setVisible(o.visible);
  }

  private applyPersonVisual(p: Person): void {
    const frame = p.walking ? (Math.floor(p.timer / 10) % 2) as 0 | 1 : 0;
    const { frame: fi, flipX } = charFrame(p.charKey, p.dir, frame);
    p.sprite.setFrame(fi).setFlipX(flipX).setPosition(Math.round(p.x), Math.round(p.y));
    p.label?.setPosition(p.x, p.y + 10);
    p.bubble?.setPosition(p.x, p.y - CHAR_HEIGHT_MAP - 6);
  }
}

/* ===================== CATATAN: asset =====================
 * Peta: public/assets/maps/ch1.json ... ch6.json (hasil export Tiled, format JSON/.tmj).
 * Tileset (public/assets/tilesets/): city.png, tiny-town.png, buildings-country_town_clean.png, overlay.png.
 * Key & path di-load di BootScene.ts; titik spawn/boss/rumah/pintu per chapter ada di Chapters.ts (field `map`)
 * dan bisa ditimpa lewat layer objek 'Objek' di Tiled (termasuk npc_<nama> utk posisi awal NPC).
 * Warga acak: template di AMBIENT_NPCS (Chapters.ts); jumlah per chapter = ambientCount atau AMBIENT_COUNT.
 * ========================================================= */