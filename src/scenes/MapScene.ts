import Phaser from 'phaser';
import { GameState, Direction, TIME_INTERVAL_MS, dist, dirFromDelta } from '../state/GameState';
import { NpcConfig } from '../state/Chapters';
import { Hud } from '../state/Hud';
import { charFrame, CHAR_SCALE_MAP } from '../state/Sprites';

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
const TALK_RADIUS = 44;               // jarak maksimal untuk ngobrol dengan warga          // jarak ke tepi rumah agar pengamatan tercatat

/** Peta dunia: pemain berjalan, jam berganti, rumah target diamati, dan warga bisa diajak ngobrol. */
interface Npc {
  cfg: NpcConfig;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  /** Indeks baris obrolan yang sedang tampil. */
  line: number;
}

export class MapScene extends Phaser.Scene {
  private state!: GameState;
  private infraLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private player!: Phaser.GameObjects.Sprite;
  private facing: Direction = 'down';
  private walkFrame: 0 | 1 = 0;
  private nextStepAt = 0;
  private nearHouseNow = false;
  private npcs: Npc[] = [];
  private dialogueNpc: Npc | null = null;
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

    this.spawnNpcs();

    // ---- pemain ----
    this.player = this.add.sprite(cfg.spawn.x, cfg.spawn.y, 'sheet', 0)
      .setOrigin(0.5, 1).setScale(CHAR_SCALE_MAP).setDepth(3);
    this.applyFrame();

    // ---- kamera ----
    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.setZoom(CAMERA_ZOOM);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.startFollow(this.player, true, 1, 1);

    this.bindInput();

    // ---- jam & HUD ----
    Hud.hideDialogue();
    Hud.talkBtn.onclick = () => this.handleInteract();
    Hud.dialogText.onclick = () => this.advanceDialogue();
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
    Hud.setToast(`🎯 ${this.state.chapter.objective}`);
  }

  update(_time: number, delta: number): void {
    this.movePlayer(delta);
    this.checkHouse();
    Hud.talkBtn.disabled = !this.nearestNpc() || !!this.dialogueNpc;
  }

  // ---------- input ----------
  private bindInput(): void {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;
    kb.on('keydown-E', (e: KeyboardEvent) => { if (!e.repeat) this.handleInteract(); });

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
    if (this.dialogueNpc) return;   // gerakan dikunci selama ngobrol
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
  private spawnNpcs(): void {
    for (const cfg of this.state.chapter.npcs) {
      const { frame } = charFrame(cfg.charKey, 'down', 0);
      const sprite = this.add.sprite(cfg.x, cfg.y, 'sheet', frame).setOrigin(0.5, 1).setScale(CHAR_SCALE_MAP).setDepth(3);
      const label = this.add.text(cfg.x, cfg.y + 10, cfg.name, { fontSize: '9px', color: '#eef2f7', fontFamily: 'monospace' })
        .setOrigin(0.5, 0).setDepth(3);
      this.npcs.push({ cfg, sprite, label, line: 0 });
    }
  }

  private nearestNpc(): Npc | null {
    let best: Npc | null = null, bestD = TALK_RADIUS;
    for (const n of this.npcs) {
      const d = dist(this.player.x, this.player.y, n.cfg.x, n.cfg.y);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  // ---------- dialog ----------
  /** Tombol E / tombol "Ajak Bicara": mulai obrolan, atau lanjut ke baris berikutnya kalau dialog sudah terbuka. */
  private handleInteract(): void {
    if (this.dialogueNpc) { this.advanceDialogue(); return; }
    const npc = this.nearestNpc();
    if (!npc) return;
    this.dialogueNpc = npc;
    npc.line = 0;   // tiap ngobrol diputar dari awal
    // NPC menghadap pemain
    const face = dirFromDelta(this.player.x - npc.cfg.x, this.player.y - npc.cfg.y);
    if (face) {
      const { frame, flipX } = charFrame(npc.cfg.charKey, face, 0);
      npc.sprite.setFrame(frame).setFlipX(flipX);
    }
    this.showLine(npc);
  }

  private showLine(npc: Npc): void {
    const line = npc.cfg.conversation[npc.line];
    Hud.showDialogue(line.who === 'Aku' ? '🧑 Aku' : npc.cfg.name, line.text);
  }

  private advanceDialogue(): void {
    const npc = this.dialogueNpc;
    if (!npc) return;
    if (npc.line < npc.cfg.conversation.length - 1) {
      npc.line++;
      this.showLine(npc);
      return;
    }
    this.dialogueNpc = null;   // obrolan habis -> tutup
    Hud.hideDialogue();
  }
}

