import Phaser from 'phaser';
import { GameState, Direction, TIME_INTERVAL_MS, dist, dirFromDelta } from '../state/GameState';
import { NpcLine, DialogueLine, AMBIENT_NPCS } from '../state/Chapters';
import { Hud } from '../state/Hud';
import { charFrame, CHAR_SCALE_MAP, CHAR_HEIGHT_MAP } from '../state/Sprites';
import { showMissionComplete } from '../ui/MissionComplete';

// Nama tileset (kiri) HARUS sama dgn nama di Tiled; key (kanan) HARUS sama dgn key di BootScene.
const TILESETS = [
  { name: 'city', key: 'tiles_city' },
  { name: 'tiny-town', key: 'tiles_tiny' },
  { name: 'buildings-country_town', key: 'tiles_town' },
  { name: 'overlay-suasana', key: 'tiles_overlay' }
];
const LAYER_GROUND = 'Tile Layer 1';
const LAYER_INFRA = 'Infrastruktur';   // bangunan & pohon -> juga dipakai sebagai tembok (collision)
const LAYER_EXTRA = 'Tambahan';        // hiasan & overlay -> digambar DI ATAS karakter

const CAMERA_ZOOM = 1.5;
const PLAYER_SPEED = 180;              // px per detik
const NEAR_HOUSE_RADIUS = 50;
const TALK_RADIUS = 44;
/** Jarak horizontal pusat gerobak dari pemain (px dunia). */
const CART_OFFSET_X = 20 * CHAR_SCALE_MAP;
/** Gerobak yang sudah ditaruh bisa diambil lagi kalau pemain lebih dekat dari ini. */
const CART_PICKUP_RADIUS = 56;
/** Syarat masuk rumah target: gerobak sudah ditaruh DAN pemain sudah menjauh sekurang-kurangnya sejauh ini darinya. */
const CART_LEAVE_DIST = 90;
const BOSS_RADIUS = 40;               // jarak maksimal ke Bos agar "Lapor" aktif
const DOOR_RADIUS = 34;               // jarak maksimal ke pintu agar "Coba Masuk" aktif               // jarak maksimal untuk ngobrol dengan warga          // jarak ke tepi rumah agar pengamatan tercatat

/** Peta dunia: pemain berjalan, jam berganti, rumah target diamati, dan warga bisa diajak ngobrol. */
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
  /** Obrolan Aku <-> NPC. dialogueIndex = baris yang sedang tampil. */
  dialogues: NpcLine[];
  dialogueIndex: number;
  behavior: Behavior;
  /** Timestamp (this.time.now) kapan NPC boleh mengambil keputusan baru. */
  nextDecisionAt: number;
  /** Timestamp berakhirnya aktivitas saat ini (idle/chatting) atau batas waktu (toChat). */
  until: number;
  /** Lawan bicara saat toChat/chatting. */
  partner: Person | null;
  /** Kapan jalur boleh dihitung ulang (dipakai untuk target yang bergerak). */
  repathAt: number;
  /** Hitungan frame tertahan tembok; kalau terlalu lama, jalur dibatalkan. */
  stuck: number;
}

/** Jumlah warga acak (ambient) per chapter kalau chapter tidak menentukan sendiri. */
const AMBIENT_COUNT = 5;

const DIRS: ReadonlyArray<[number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]
];
const IDLE_EMOJI = ['📱', '☕', '💭', '📰', '🎧'];
const LOOK_DIRS: Direction[] = ['down', 'left', 'right', 'up'];

export class MapScene extends Phaser.Scene {
  private state!: GameState;
  private infraLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private player!: Phaser.GameObjects.Sprite;
  private facing: Direction = 'down';
  private walkFrame: 0 | 1 = 0;
  private nextStepAt = 0;
  private nearHouseNow = false;
  private npcs: Person[] = [];
  private dialogueNpc: Person | null = null;
  // ---- grid jalan (dari layer Infrastruktur) untuk pathfinding NPC ----
  private walkGrid: Uint8Array = new Uint8Array(0);
  private gridW = 0;
  private gridH = 0;
  private tileSize = 16;
  /** Indeks cell yang terhubung dengan titik spawn — titik acak NPC hanya diambil dari sini supaya selalu terjangkau. */
  private reachCells: number[] = [];
  private cart!: Phaser.GameObjects.Sprite;
  /** Gerobak sedang ditaruh di tanah (true) atau didorong pemain (false). */
  private cartPlaced = false;
  private cartSpot: Pt = { x: 0, y: 0 };
  private cartFlip = false;
  private lastDoorHintAt = 0;
  private boss!: { label: Phaser.GameObjects.Text; alert: Phaser.GameObjects.Text };
  /** Lapisan hijau di atas rumah target: penanda "kasus terungkap". */
  private houseOverlay!: Phaser.GameObjects.Rectangle;
  /** Layar Mission Complete sedang tampil: kunci input peta. */
  private overlayOpen = false;
  // ---- dialog cerita Bos <-> Aku ----
  private storyActive = false;
  private storyLines: DialogueLine[] = [];
  private storyIndex = 0;
  private storyCta = '';
  private storyOnDone: (() => void) | null = null;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
  private pad: Record<Direction, boolean> = { up: false, down: false, left: false, right: false };

  constructor() {
    super('Map');
  }

  create(): void {
    this.state = this.registry.get('state') as GameState;
    const { map: cfg } = this.state.chapter;

    // ---- tilemap ----
    const map = this.make.tilemap({ key: cfg.key });
    const tilesets = TILESETS
      .map(t => map.addTilesetImage(t.name, t.key))
      .filter((t): t is Phaser.Tilemaps.Tileset => !!t);
    if (tilesets.length !== TILESETS.length) {
      console.warn(`[MapScene] Ada tileset yang gagal dipasang di '${cfg.key}' — cek nama tileset di Tiled & key texture di BootScene.`);
    }
    map.createLayer(LAYER_GROUND, tilesets)?.setDepth(0);
    this.infraLayer = map.createLayer(LAYER_INFRA, tilesets)?.setDepth(1) ?? null;
    map.createLayer(LAYER_EXTRA, tilesets)?.setDepth(6);

    // ---- label rumah target ----
    const h = cfg.house;
    this.add.text(h.x + h.w / 2, h.y - 4, `🏠 Rumah ${this.state.chapter.suspectName}`, {
      fontSize: '9px', color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 3, y: 2 }
    }).setOrigin(0.5, 1).setDepth(7);

    this.buildWalkGrid(map);
    this.spawnNpcs();
    this.buildBoss();
    const hs = this.state.chapter.map.house;
    this.houseOverlay = this.add.rectangle(hs.x, hs.y, hs.w, hs.h, 0x5affa0, 0.28).setOrigin(0, 0).setDepth(2).setVisible(false);

    // ---- pemain ----
    this.player = this.add.sprite(cfg.spawn.x, cfg.spawn.y, 'sheet', 0)
      .setOrigin(0.5, 1).setScale(CHAR_SCALE_MAP).setDepth(3);
    this.applyFrame();

    // Gerobak bakso (sprite beranimasi). Gagang di sisi kiri gambar -> gerobak di kanan pemain; saat menghadap kiri di-flip.
    this.cart = this.add.sprite(0, 0, 'gerobak', 0).setOrigin(0.5, 1).setScale(CHAR_SCALE_MAP).setDepth(3);
    this.cart.play('gerobak_idle');

    // ---- kamera ----
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.setZoom(CAMERA_ZOOM);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.startFollow(this.player, true, 1, 1);

    this.bindInput();

    // ---- jam & HUD ----
    Hud.hideDialogue();
    Hud.talkBtn.onclick = () => this.handleInteract();
    Hud.enterBtn.onclick = () => this.tryEnter();
    Hud.cartBtn.onclick = () => this.toggleCart();
    Hud.reportBtn.onclick = () => this.laporBos();
    this.events.on(Phaser.Scenes.Events.RESUME, () => { document.body.classList.remove('inside'); Hud.renderLog(this.state); });
    Hud.dialogText.onclick = () => this.advance();
    Hud.dialogCtaBtn.onclick = () => this.advanceStory();
    Hud.updateClock(this.state);
    Hud.renderLog(this.state);
    this.time.addEvent({
      delay: TIME_INTERVAL_MS, loop: true,
      callback: () => {
        this.state.advanceTime();
        Hud.updateClock(this.state);
        this.nearHouseNow = false;   // paksa cek ulang: slot baru berarti pengamatan baru
      }
    });
    this.time.addEvent({ delay: 1000, loop: true, callback: () => Hud.updateClockCountdown(this.state) });
    this.showBriefing();
  }

  update(_time: number, delta: number): void {
    this.movePlayer(delta);
    const cp = this.cartPosition();
    this.cart.setFlipX(this.cartPlaced ? this.cartFlip : this.facing === 'left').setPosition(Math.round(cp.x), Math.round(cp.y));
    this.npcs.forEach(n => this.updateNpcBehavior(n));
    this.checkHouse();
    this.updateSuspicion();
    const busy = !!this.dialogueNpc || this.storyActive || this.overlayOpen;
    Hud.talkBtn.disabled = !this.nearestNpc() || busy;
    Hud.enterBtn.disabled = !this.nearDoor() || this.state.caseSolved || busy;
    const nearCart = dist(this.player.x, this.player.y, this.cartSpot.x, this.cartSpot.y) <= CART_PICKUP_RADIUS;
    const cartLabel = this.cartPlaced ? '🛒 Ambil Gerobak (F)' : '🛒 Taruh Gerobak (F)';
    if (Hud.cartBtn.textContent !== cartLabel) Hud.cartBtn.textContent = cartLabel;
    Hud.cartBtn.disabled = busy || (this.cartPlaced && !nearCart);
    // Petunjuk sekali-sekali saat pemain di depan pintu tapi belum memenuhi syarat gerobak.
    if (this.nearDoor() && !this.state.caseSolved && this.cartRuleMessage() && this.time.now - this.lastDoorHintAt > 6000) {
      this.lastDoorHintAt = this.time.now;
      Hud.setToast(this.cartRuleMessage()!, '#f5a623');
    }
    Hud.reportBtn.disabled = !(this.nearBoss() && this.state.caseSolved && !this.state.missionReported) || busy;
    this.houseOverlay.setVisible(this.state.caseSolved);
    this.boss.label.setText(this.state.missionReported ? 'Kasus Selesai ✅' : 'Bos (Telepon)');
    this.boss.alert.setVisible(this.state.caseSolved && !this.state.missionReported);
  }

  // ---------- input ----------
  private bindInput(): void {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    // E lewat window (bukan Phaser): Scene yang di-pause tak menerima event, jadi E yang menutup interior tidak ikut "bocor" ke peta.
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.repeat) return;
      if (k === 'e') this.handleInteract();
      if (k === 'f') this.toggleCart();
    };
    window.addEventListener('keydown', onKey);
    this.events.once('shutdown', () => window.removeEventListener('keydown', onKey));

    // Tombol arah layar sentuh (di index.html)
    const bindings: Array<[string, Direction]> = [
      ['btnUp', 'up'], ['btnDown', 'down'], ['btnLeft', 'left'], ['btnRight', 'right']
    ];
    for (const [id, dir] of bindings) {
      const el = document.getElementById(id)!;
      const on = (e: Event) => { e.preventDefault(); this.pad[dir] = true; };
      const off = () => { this.pad[dir] = false; };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointerleave', off);
      el.addEventListener('pointercancel', off);
    }
  }

  // ---------- gerak & tabrakan ----------
  private isSolid(x: number, y: number): boolean {
    return !!this.infraLayer && this.infraLayer.hasTileAtWorldXY(x, y);
  }
  /** Kaki pemain dianggap selebar 10px (5px kiri-kanan dari titik tengah). */
  private footBlocked(x: number, y: number): boolean {
    return this.isSolid(x - 5, y) || this.isSolid(x + 5, y);
  }

  private movePlayer(delta: number): void {
    if (this.dialogueNpc || this.storyActive) return;   // gerakan dikunci selama dialog
    const left = this.cursors.left.isDown || this.wasd.A.isDown || this.pad.left;
    const right = this.cursors.right.isDown || this.wasd.D.isDown || this.pad.right;
    const up = this.cursors.up.isDown || this.wasd.W.isDown || this.pad.up;
    const down = this.cursors.down.isDown || this.wasd.S.isDown || this.pad.down;
    const dx = (right ? 1 : 0) - (left ? 1 : 0);
    const dy = (down ? 1 : 0) - (up ? 1 : 0);
    if (dx === 0 && dy === 0) {
      this.walkFrame = 0;
      this.applyFrame();
      return;
    }

    // Normalisasi supaya gerak diagonal tidak lebih cepat.
    const len = Math.hypot(dx, dy);
    const step = (PLAYER_SPEED * delta) / 1000;
    const world = this.cameras.main.getBounds();
    // Sumbu X dan Y dicek terpisah agar pemain bisa "menyusur" tembok.
    const nx = Phaser.Math.Clamp(this.player.x + (dx / len) * step, world.x + 8, world.right - 8);
    if (!this.footBlocked(nx, this.player.y)) this.player.x = nx;
    const ny = Phaser.Math.Clamp(this.player.y + (dy / len) * step, world.y + 16, world.bottom);
    if (!this.footBlocked(this.player.x, ny)) this.player.y = ny;

    this.facing = dx !== 0 ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    if (this.time.now >= this.nextStepAt) {
      this.walkFrame = this.walkFrame === 0 ? 1 : 0;
      this.nextStepAt = this.time.now + 150;
    }
    this.applyFrame();
  }

  private applyFrame(): void {
    const { frame, flipX } = charFrame('A', this.facing, this.walkFrame);
    this.player.setFrame(frame).setFlipX(flipX);
  }

  // ---------- pengamatan rumah ----------
  private nearHouse(): boolean {
    const h = this.state.chapter.map.house;
    // Jarak ke TEPI persegi rumah (bukan ke pusat), karena ukuran rumah di peta bebas.
    const cx = Phaser.Math.Clamp(this.player.x, h.x, h.x + h.w);
    const cy = Phaser.Math.Clamp(this.player.y, h.y, h.y + h.h);
    return dist(this.player.x, this.player.y, cx, cy) < NEAR_HOUSE_RADIUS;
  }

  private checkHouse(): void {
    const near = this.nearHouse();
    if (!near) { this.nearHouseNow = false; return; }
    if (this.nearHouseNow) return;           // hanya reaksi saat baru mendekat
    this.nearHouseNow = true;

    if (this.state.recordObservationIfNew()) {
      Hud.renderLog(this.state);
      const ada = this.state.currentStatus === 'ada';
      Hud.setToast(
        ada ? `👤 ${this.state.currentSlot}: ada orang di rumah ${this.state.chapter.suspectName}.`
            : `✅ ${this.state.currentSlot}: rumah ${this.state.chapter.suspectName} tampak kosong!`,
        ada ? '#ff6b6b' : '#00d9a3'
      );
    } else {
      Hud.setToast(`📋 Slot ${this.state.currentSlot} sudah dicatat. Tunggu pergantian waktu.`, '#f5a623');
    }
  }

  // ---------- warga ----------
  /** Bangun NPC penting dari data chapter + beberapa warga acak (ambient) sebagai figuran. */
  private spawnNpcs(): void {
    const now = this.time.now;
    const chapter = this.state.chapter;
    const sp = chapter.map.spawn;
    const list: Person[] = chapter.npcs.map(cfg =>
      this.makePerson(cfg.charKey, cfg.name, cfg.x, cfg.y, cfg.speed, true, cfg.conversation));

    const taken = new Set(chapter.npcs.map(c => c.name));
    const pool = Phaser.Utils.Array.Shuffle(AMBIENT_NPCS.filter(a => !taken.has(a.name)).slice());
    const count = Math.min(pool.length, chapter.ambientCount ?? AMBIENT_COUNT);
    for (let i = 0; i < count; i++) {
      const t = pool[i];
      let pt = this.randomPointInWorld(), tries = 0;
      while (dist(pt.x, pt.y, sp.x, sp.y) < 90 && tries++ < 15) pt = this.randomPointInWorld();
      list.push(this.makePerson(t.charKey, t.name, pt.x, pt.y, Phaser.Math.FloatBetween(0.8, 1.2), true, t.conversation));
    }

    list.forEach(p => {
      this.nudgeToWalkable(p);
      p.nextDecisionAt = now + Phaser.Math.Between(3000, 12000);
      this.applyPersonVisual(p);
    });
    this.npcs = list;
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

  private nearestNpc(): Person | null {
    let best: Person | null = null, bestD = TALK_RADIUS;
    for (const n of this.npcs) {
      const d = dist(this.player.x, this.player.y, n.x, n.y);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  // ---------- dialog ----------
  /** Tombol E / tombol "Ajak Bicara": mulai obrolan, atau lanjut ke baris berikutnya kalau dialog sudah terbuka. */
  private handleInteract(): void {
    if (this.overlayOpen) return;
    if (this.storyActive) { this.advanceStory(); return; }
    if (this.dialogueNpc) { this.advanceDialogue(); return; }
    const npc = this.nearestNpc();
    if (!npc) {
      if (this.nearDoor() && !this.state.caseSolved) this.tryEnter();
      else if (this.nearBoss()) this.laporBos();
      return;
    }
    if (npc.dialogues.length === 0) return;
    this.dialogueNpc = npc;
    npc.dialogueIndex = 0;   // tiap ngobrol diputar dari awal
    const face = dirFromDelta(this.player.x - npc.x, this.player.y - npc.y);   // NPC menghadap pemain
    if (face) npc.dir = face;
    this.showLine(npc);
  }

  private showLine(npc: Person): void {
    const line = npc.dialogues[npc.dialogueIndex];
    Hud.showDialogue(line.who === 'Aku' ? '🧑 Aku' : npc.name, line.text);
  }

  private advanceDialogue(): void {
    const npc = this.dialogueNpc;
    if (!npc) return;
    if (npc.dialogueIndex < npc.dialogues.length - 1) {
      npc.dialogueIndex++;
      this.showLine(npc);
      return;
    }
    this.dialogueNpc = null;   // obrolan habis -> tutup
    Hud.hideDialogue();
  }

  /** Ketuk kotak dialog: lanjutkan cerita atau obrolan, mana yang sedang aktif. */
  private advance(): void {
    if (this.storyActive) this.advanceStory();
    else this.advanceDialogue();
  }

  // ---------- dialog cerita Bos <-> Aku ----------
  /** Putar obrolan cerita baris demi baris. Jam desa dihentikan selama cerita berjalan. */
  private playStory(lines: DialogueLine[], ctaLabel: string, onDone: () => void): void {
    this.storyLines = lines;
    this.storyIndex = 0;
    this.storyCta = ctaLabel;
    this.storyActive = true;
    this.storyOnDone = onDone;
    this.time.paused = true;
    this.showStoryLine();
  }

  private showStoryLine(): void {
    const isLast = this.storyIndex === this.storyLines.length - 1;
    Hud.showStoryLine(this.storyLines[this.storyIndex], isLast, this.storyCta);
  }

  private advanceStory(): void {
    if (!this.storyActive) return;
    if (this.storyIndex < this.storyLines.length - 1) {
      this.storyIndex++;
      this.showStoryLine();
      return;
    }
    this.storyActive = false;
    this.time.paused = false;
    Hud.hideStoryLine();
    const done = this.storyOnDone;
    this.storyOnDone = null;
    done?.();
  }

  /** Briefing awal chapter: telepon Bos, lalu tombol "Mulai Misi" menampilkan tujuan. */
  private showBriefing(): void {
    this.playStory(this.state.chapter.briefingLog, '▶ Mulai Misi', () => {
      this.state.nextTimeChange = Date.now() + TIME_INTERVAL_MS;   // jam mulai dari awal setelah briefing
      Hud.setToast(`🎯 ${this.state.chapter.objective}  🛒 Tekan F untuk menaruh/mengambil gerobak; taruh dulu sebelum masuk rumah.`, '#00d9a3');
    });
  }

  // ---------- kecurigaan warga ----------
  /** Dekat rumah target = makin dicurigai; menjauh = pelan-pelan mereda. Penuh = diusir kembali ke titik awal. */
  private updateSuspicion(): void {
    if (this.nearHouse()) this.state.suspicion = Math.min(100, this.state.suspicion + 0.35);
    else this.state.suspicion = Math.max(0, this.state.suspicion - 0.15);
    Hud.updateSuspicion(this.state);
    if (this.state.suspicion >= 100) {
      Hud.setToast('🚨 Kamu terlalu lama nongkrong, warga curiga! Menjauh dulu...', '#ff6b6b');
      this.state.suspicion = 0;
      const sp = this.state.chapter.map.spawn;
      this.player.x = sp.x; this.player.y = sp.y;
    }
  }

  // ---------- masuk rumah ----------
  private nearDoor(): boolean {
    const d = this.state.chapter.map.door;
    return dist(this.player.x, this.player.y, d.x, d.y) < DOOR_RADIUS;
  }

  /** "Coba Masuk": rumah kosong = menyelinap masuk (pindah ke InteriorScene); ada orang = ketahuan dan terusir. */
  private tryEnter(): void {
    if (!this.nearDoor() || this.dialogueNpc || this.storyActive || this.overlayOpen) return;
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
      const sp = this.state.chapter.map.spawn;
      this.player.x = sp.x; this.player.y = sp.y;
    }
  }

  // ---------- Bos & laporan ----------
  private buildBoss(): void {
    const b = this.state.chapter.map.boss;
    const { frame } = charFrame('F', 'down', 0);
    this.add.sprite(b.x, b.y, 'sheet', frame).setOrigin(0.5, 1).setScale(CHAR_SCALE_MAP).setDepth(3);
    this.add.text(b.x + 11, b.y - CHAR_HEIGHT_MAP * 0.6, '📞', { fontSize: '13px' }).setOrigin(0.5).setDepth(3);
    const label = this.add.text(b.x, b.y + 10, 'Bos (Telepon)', { fontSize: '9px', color: '#eef2f7', fontFamily: 'monospace' }).setOrigin(0.5, 0).setDepth(3);
    const alert = this.add.text(b.x, b.y - CHAR_HEIGHT_MAP - 8, '❗ Ada laporan', { fontSize: '9px', color: '#f5a623', fontFamily: 'monospace' })
      .setOrigin(0.5).setDepth(3).setVisible(false);
    this.boss = { label, alert };
  }

  private nearBoss(): boolean {
    const b = this.state.chapter.map.boss;
    return dist(this.player.x, this.player.y, b.x, b.y) < BOSS_RADIUS;
  }

  /** Lapor ke Bos: putar dialog penutup, lalu layar Mission Complete. */
  private laporBos(): void {
    if (this.overlayOpen || this.storyActive || this.dialogueNpc) return;
    if (!this.nearBoss() || !this.state.caseSolved || this.state.missionReported) return;
    this.state.missionReported = true;
    Hud.setToast('📞 Menghubungi Bos...', '#00d9a3');
    const chapter = this.state.chapter;
    this.playStory(chapter.debriefingLog, '✅ Complete', () => {
      this.overlayOpen = true;
      showMissionComplete({ chapterId: chapter.id, chapterTitle: chapter.title }, () => {
        // Tamat. Menu utama baru ada di versi berikutnya, jadi untuk sementara muat ulang halaman = main lagi dari awal.
        window.location.reload();
      });
    });
  }

  /** Posisi gerobak bakso pemain saat ini (gerobak menempel & ikut bergerak bersama pemain). */
  private cartPosition(): { x: number; y: number } {
    if (this.cartPlaced) return this.cartSpot;
    const side = this.facing === 'left' ? -1 : 1;
    return { x: this.player.x + side * CART_OFFSET_X, y: this.player.y + 2 };
  }

  /** Titik gerobak kalau ditaruh di sisi `side` (-1 kiri / +1 kanan) pemain. */
  private cartSpotAt(side: number): Pt {
    return { x: this.player.x + side * CART_OFFSET_X, y: this.player.y + 2 };
  }

  /** Tempat gerobak muat? (tidak menimpa tembok/pohon & tidak di dalam persegi rumah target) */
  private cartSpotFree(p: Pt): boolean {
    const half = 14;   // setengah lebar kaki gerobak (px dunia)
    if (this.footBlocked(p.x - half, p.y) || this.footBlocked(p.x, p.y) || this.footBlocked(p.x + half, p.y)) return false;
    const H = this.state.chapter.map.house;
    return !(p.x > H.x && p.x < H.x + H.w && p.y > H.y && p.y < H.y + H.h);
  }

  /** Tombol F: taruh gerobak di samping pemain, atau ambil lagi kalau sudah ditaruh & pemain dekat. */
  private toggleCart(): void {
    if (this.overlayOpen || this.storyActive || this.dialogueNpc || !this.scene.isActive()) return;
    if (this.cartPlaced) {
      if (dist(this.player.x, this.player.y, this.cartSpot.x, this.cartSpot.y) > CART_PICKUP_RADIUS) {
        Hud.setToast('🛒 Terlalu jauh dari gerobak. Dekati gerobakmu dulu, baru tekan F.', '#f5a623');
        return;
      }
      this.cartPlaced = false;
      Hud.setToast('🛒 Gerobak diambil lagi.', '#00d9a3');
      return;
    }
    const pref = this.facing === 'left' ? -1 : 1;
    const spot = [this.cartSpotAt(pref), this.cartSpotAt(-pref)].find(p => this.cartSpotFree(p));
    if (!spot) {
      Hud.setToast('🛒 Tidak ada ruang untuk menaruh gerobak di sini. Pindah ke tempat yang lebih lapang.', '#ff6b6b');
      return;
    }
    this.cartPlaced = true;
    this.cartSpot = { x: spot.x, y: spot.y };
    this.cartFlip = spot.x < this.player.x;
    Hud.setToast('🛒 Gerobak ditaruh. Tekan F di dekatnya untuk mengambil lagi.', '#00d9a3');
  }

  /** Boleh masuk rumah target? Gerobak harus sudah ditaruh dan ditinggalkan (pemain menjauh >= CART_LEAVE_DIST). */
  private cartRuleMessage(): string | null {
    if (!this.cartPlaced) return '🛒 Kamu masih mendorong gerobak bakso! Taruh dulu gerobaknya (tekan F) sebelum masuk rumah.';
    if (dist(this.player.x, this.player.y, this.cartSpot.x, this.cartSpot.y) < CART_LEAVE_DIST) {
      return '🚶 Gerobakmu masih terlalu dekat. Tinggalkan gerobak (jauhi sedikit) baru masuk rumah.';
    }
    return null;
  }

  /** Titik pembeli berdiri: tepat di depan (bawah) gerobak. */
  private cartCustomerSpot(): { x: number; y: number } {
    const c = this.cartPosition();
    return { x: c.x, y: c.y + 10 };
  }

  private jualBakso(npc: Person): void {
    const target = npc;
    this.state.suspicion = 0;
    Hud.setToast('🍜 ' + (target ? target.name : 'Warga') + ' beli bakso — kecurigaan mereda, penyamaranmu makin kuat!', '#00d9a3');
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
    const start = this.nearestWalkableCell(this.state.chapter.map.spawn.x, this.state.chapter.map.spawn.y, 10);
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
    if (this.reachCells.length === 0) return { x: this.gridW * this.tileSize / 2, y: this.gridH * this.tileSize / 2 };
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
    const H = this.state.chapter.map.house;
    return x > H.x - 25 && x < H.x + H.w + 25 && y > H.y - 25 && y < H.y + H.h + 25;
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
      && dist(o.x, o.y, n.x, n.y) < 350 && this.dialogueNpc !== o);
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
    if (this.dialogueNpc === n) {
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

  private applyPersonVisual(p: Person): void {
    const frame = p.walking ? (Math.floor(p.timer / 10) % 2) as 0 | 1 : 0;
    const { frame: fi, flipX } = charFrame(p.charKey, p.dir, frame);
    p.sprite.setFrame(fi).setFlipX(flipX).setPosition(Math.round(p.x), Math.round(p.y));
    p.label?.setPosition(p.x, p.y + 10);
    p.bubble?.setPosition(p.x, p.y - CHAR_HEIGHT_MAP - 6);
  }
}
