import Phaser from 'phaser';
import { GameState, Direction } from '../state/GameState';
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

/** Peta dunia: pemain berjalan di peta Tiled dengan tabrakan bangunan/pohon. */
export class MapScene extends Phaser.Scene {
  private state!: GameState;
  private infraLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private player!: Phaser.GameObjects.Sprite;
  private facing: Direction = 'down';
  private walkFrame: 0 | 1 = 0;
  private nextStepAt = 0;
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
  }

  update(_time: number, delta: number): void {
    this.movePlayer(delta);
  }

  // ---------- input ----------
  private bindInput(): void {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = kb.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

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
}
