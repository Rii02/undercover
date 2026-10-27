import Phaser from 'phaser';
import { GameState, dist, dirFromDelta, Direction } from '../state/GameState';
import { Hud } from '../state/Hud';
import { charFrame, CHAR_SCALE_MAP } from '../state/Sprites';

/**
 * Interior sekarang dibangun dari peta Tiled (CHAPTERS[i].interiorMap), bukan lagi dari add.rectangle.
 *
 * Layer yang dibaca (nama HARUS sama dengan di Tiled):
 *   'Tile Layer 1'  -> lantai                                    (depth 0)
 *   'Infrastruktur' -> dinding + perabot; tile apa pun di sini = SOLID (collision)  (depth 1)
 *   'Tambahan'      -> hiasan yang digambar DI ATAS karakter    (depth 6)
 *   'Suasana'       -> overlay cahaya/redup, DI ATAS karakter    (depth 7)
 *   'Objek' (object layer), dikenali dari NAMA objek:
 *      spawn            titik awal pemain (posisi kaki)
 *      door             pintu keluar (tekan E / tombol "Keluar" saat dekat)
 *      hack*            titik komputer/panel yang bisa dibobol (nama diawali "hack")
 *      stairs*          tangga; properti 'tujuan' berisi "(titik X,Y)" = tile tujuan. Otomatis teleport saat didekati.
 *      clue*            petunjuk; properti 'teks' ditampilkan di baris petunjuk saat pemain dekat
 */

const ZOOM = 2;                     // tile 16px terlalu kecil di kanvas ini, jadi diperbesar 2x
const SPEED = 1.5;                  // px dunia per frame (2x zoom = 3px layar); posisi gambar dibulatkan di update()

// Nama (kiri) HARUS sama dgn nama tileset di Tiled; key (kanan) HARUS sama dgn yang di-load di BootScene.ts.
const INTERIOR_TILESETS = [
  { name: 'city', key: 'tiles_city' },
  { name: 'tiny-town', key: 'tiles_tiny' },
  { name: 'buildings-country_town', key: 'tiles_town' },
  { name: 'overlay-suasana', key: 'tiles_overlay' },
  { name: 'interior-kustom', key: 'tiles_interior' }
];
const LAYER_GROUND = 'Tile Layer 1';
const LAYER_INFRA = 'Infrastruktur';
const LAYER_EXTRA = 'Tambahan';
const LAYER_MOOD = 'Suasana';
const OBJECT_LAYER = 'Objek';

const HACK_RADIUS = 44;    // jarak (px dunia) agar tombol/E "bobol" aktif
const DOOR_RADIUS = 36;
const CLUE_RADIUS = 30;
const STAIRS_RADIUS = 22;

interface Spot { x: number; y: number; name: string; teks?: string; tujuan?: { x: number; y: number } }

function getProp(o: any, key: string): string | undefined {
  const p = o.properties;
  if (!p) return undefined;
  if (Array.isArray(p)) return p.find((q: any) => q.name === key)?.value;
  return p[key];
}

export class InteriorScene extends Phaser.Scene {
  private state!: GameState;
  private tilemap!: Phaser.Tilemaps.Tilemap;
  private avatar!: { x: number; y: number; sprite: Phaser.GameObjects.Sprite; walking: boolean; timer: number; dir: Direction };
  private highlight!: Phaser.GameObjects.Graphics;

  private spawn: Spot = { x: 0, y: 0, name: 'spawn' };
  private door: Spot | null = null;
  private hacks: Spot[] = [];
  private stairs: Spot[] = [];
  private clues: Spot[] = [];
  private stairsArmed = true;
  private ready = false;

  private keys: Record<string, boolean> = {};
  private readonly keyMap: Record<string, string> = {
    arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right'
  };
  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (this.keyMap[k]) this.keys[this.keyMap[k]] = true;
    if (k === 'e') this.interact();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (this.keyMap[k]) this.keys[this.keyMap[k]] = false;
  };
  private onResume = () => this.activateView();

  constructor() {
    super('Interior');
  }

  create(): void {
    this.state = this.registry.get('state') as GameState;
    this.keys = {};
    this.stairsArmed = true;
    this.ready = false;
    this.activateView();
    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume);
    if (Hud.interiorHeader) Hud.interiorHeader.textContent = `🏚️ Di Dalam ${this.state.chapter.interiorTitle}`;

    if (!this.buildMap()) {
      this.events.once('shutdown', () => this.events.off(Phaser.Scenes.Events.RESUME, this.onResume));
      return;
    }

    // Karakter
    const { frame } = charFrame('A', 'down', 0);
    const sprite = this.add.sprite(this.spawn.x, this.spawn.y, 'sheet', frame)
      .setOrigin(0.5, 1).setScale(CHAR_SCALE_MAP).setDepth(3);
    this.avatar = { x: this.spawn.x, y: this.spawn.y, sprite, walking: false, timer: 0, dir: 'down' };
    this.highlight = this.add.graphics().setDepth(5);

    // Kamera mengikuti pemain, dibatasi area peta yang benar-benar berisi tile.
    const cam = this.cameras.main;
    cam.setZoom(ZOOM).setBackgroundColor(0x111419).setRoundPixels(true);
    this.setCameraBounds();
    cam.centerOn(this.avatar.x, this.avatar.y);
    // Lerp 1 (tanpa smoothing) + roundPixels: kamera selalu pas di posisi sprite yang sudah dibulatkan -> peta tidak bergetar.
    cam.startFollow(sprite, true, 1, 1);
    cam.setFollowOffset(0, -14);

    // UI
    Hud.computerBtn.onclick = () => this.tryOpenHacking();
    (document.getElementById('exitHouseBtn') as HTMLButtonElement).onclick = () => this.exitHouse();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.events.once('shutdown', () => {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      this.events.off(Phaser.Scenes.Events.RESUME, this.onResume);
    });
    // onpointerdown (bukan addEventListener) supaya tidak menumpuk listener tiap masuk rumah.
    const bindHold = (id: string, dir: string) => {
      const el = document.getElementById(id)!;
      el.onpointerdown = () => { this.keys[dir] = true; };
      el.onpointerup = () => { this.keys[dir] = false; };
      el.onpointerleave = () => { this.keys[dir] = false; };
    };
    this.ready = true;
    bindHold('btnUp', 'up'); bindHold('btnDown', 'down'); bindHold('btnLeft', 'left'); bindHold('btnRight', 'right');
  }

  /** Tampilkan HUD interior (class `inside` di <body>). Dipanggil di create() dan tiap kali Scene ini resume (mis. batal dari minigame). */
  private activateView(): void {
    document.body.classList.add('inside');
  }

  // ------------------------------------------------------------------ peta

  private buildMap(): boolean {
    const cfg = this.state.chapter.interiorMap;
    if (!this.cache.tilemap.exists(cfg.key)) {
      console.error(`[InteriorScene] Peta interior '${cfg.key}' tidak ada di cache — file '${cfg.file}' gagal dimuat. Cek path di Chapters.ts & isi folder public/assets/maps/.`);
      Hud.setToast(`⚠️ Peta interior gagal dimuat (${cfg.file})`, '#ff5555');
      this.exitHouse();
      return false;
    }
    const map = this.make.tilemap({ key: cfg.key });
    const tilesets = INTERIOR_TILESETS
      .map(t => map.addTilesetImage(t.name, t.key))
      .filter((t): t is Phaser.Tilemaps.Tileset => !!t);
    if (tilesets.length !== INTERIOR_TILESETS.length) {
      console.warn(`[InteriorScene] Ada tileset yg gagal dipasang di '${cfg.key}' — cek nama tileset di Tiled & key texture di BootScene.`);
    }
    this.tilemap = map;

    map.createLayer(LAYER_GROUND, tilesets)?.setDepth(0);
    map.createLayer(LAYER_INFRA, tilesets)?.setDepth(1);
    map.createLayer(LAYER_EXTRA, tilesets)?.setDepth(6);
    map.createLayer(LAYER_MOOD, tilesets)?.setDepth(7);

    this.readObjects(map);
    return true;
  }

  private readObjects(map: Phaser.Tilemaps.Tilemap): void {
    this.door = null; this.hacks = []; this.stairs = []; this.clues = [];
    const layer = map.getObjectLayer(OBJECT_LAYER);
    if (!layer) { console.warn(`[InteriorScene] Layer objek '${OBJECT_LAYER}' tidak ada di peta interior.`); return; }
    const T = map.tileWidth;
    for (const o of layer.objects) {
      const nm = (o.name || '').toLowerCase();
      const spot: Spot = { x: o.x ?? 0, y: o.y ?? 0, name: nm };
      if (nm === 'spawn') this.spawn = spot;
      else if (nm === 'door') this.door = spot;
      else if (nm.startsWith('hack')) this.hacks.push(spot);
      else if (nm.startsWith('clue')) { spot.teks = getProp(o, 'teks'); this.clues.push(spot); }
      else if (nm.startsWith('stairs')) {
        // properti 'tujuan' berbentuk "lantai 2 (titik 27,6)" -> tile tujuan (27,6), titik tengah tile.
        const m = /titik\s*(\d+)\s*,\s*(\d+)/.exec(getProp(o, 'tujuan') ?? '');
        if (m) spot.tujuan = { x: Number(m[1]) * T + T / 2, y: Number(m[2]) * T + T / 2 };
        this.stairs.push(spot);
      }
    }
  }

  /** Batas kamera = persegi terkecil yang berisi tile lantai/dinding (area hitam kosong di tepi peta tidak ikut terlihat). */
  private setCameraBounds(): void {
    const T = this.tilemap.tileWidth;
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    for (const name of [LAYER_GROUND, LAYER_INFRA]) {
      const data = this.tilemap.getLayer(name)?.data;
      if (!data) continue;
      data.forEach((row, ty) => row.forEach((t, tx) => {
        if (t.index === -1) return;
        minX = Math.min(minX, tx); maxX = Math.max(maxX, tx);
        minY = Math.min(minY, ty); maxY = Math.max(maxY, ty);
      }));
    }
    if (maxX < 0) { this.cameras.main.setBounds(0, 0, this.tilemap.widthInPixels, this.tilemap.heightInPixels); return; }
    this.cameras.main.setBounds(minX * T, minY * T, (maxX - minX + 1) * T, (maxY - minY + 1) * T);
  }

  // ------------------------------------------------------------------ tabrakan

  /** Ada tile di layer Infrastruktur pada titik dunia (x,y)? = tembok/perabot. */
  private isSolid(x: number, y: number): boolean {
    const T = this.tilemap.tileWidth;
    return !!this.tilemap.hasTileAt(Math.floor(x / T), Math.floor(y / T), LAYER_INFRA);
  }

  /** Cek kaki karakter (2 titik kiri-kanan) menabrak solid atau tidak — sama seperti MapScene. */
  private footBlocked(x: number, y: number): boolean {
    return this.isSolid(x - 4, y) || this.isSolid(x + 4, y);
  }

  private moveWithCollision(dx: number, dy: number): void {
    const maxX = this.tilemap.widthInPixels - 4, maxY = this.tilemap.heightInPixels - 1;
    const nx = Phaser.Math.Clamp(this.avatar.x + dx, 4, maxX);
    if (!this.footBlocked(nx, this.avatar.y)) this.avatar.x = nx;
    const ny = Phaser.Math.Clamp(this.avatar.y + dy, 1, maxY);
    if (!this.footBlocked(this.avatar.x, ny)) this.avatar.y = ny;
  }

  // ------------------------------------------------------------------ aksi

  private nearest(spots: Spot[], radius: number): Spot | null {
    let best: Spot | null = null, bd = radius;
    for (const s of spots) {
      const d = dist(this.avatar.x, this.avatar.y, s.x, s.y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /** Tombol E: bobol komputer kalau dekat, kalau tidak dan dekat pintu -> keluar. */
  private interact(): void {
    if (this.nearest(this.hacks, HACK_RADIUS)) this.tryOpenHacking();
    else if (this.nearest(this.door ? [this.door] : [], DOOR_RADIUS)) this.exitHouse();
  }

  private tryOpenHacking(): void {
    if (!this.nearest(this.hacks, HACK_RADIUS)) return;
    // Minigame membobol komputer ditambahkan di versi berikutnya.
    Hud.setToast('💻 Komputernya menyala, tapi kamu belum bisa membobolnya.', '#f5a623');
  }

  private exitHouse(): void {
    Hud.setToast('🚶 Kamu keluar dari rumah tersangka.', '#f5a623');
    document.body.classList.remove('inside');
    this.scene.stop();
    this.scene.resume('Map');
  }

  /** Teleport otomatis saat mendekati tangga (peta 2 lantai ada dalam satu file). Baru aktif lagi setelah pemain menjauh. */
  private updateStairs(): void {
    const s = this.nearest(this.stairs, STAIRS_RADIUS);
    if (!s) {
      if (!this.nearest(this.stairs, STAIRS_RADIUS + 14)) this.stairsArmed = true;
      return;
    }
    if (!this.stairsArmed || !s.tujuan) return;
    this.stairsArmed = false;
    // Tile tujuan biasanya tile tangga di lantai seberang (solid) -> mendarat di tile bebas pertama di bawahnya.
    const T = this.tilemap.tileHeight;
    let ty = s.tujuan.y;
    for (let i = 0; i < 6 && this.footBlocked(s.tujuan.x, ty); i++) ty += T;
    this.avatar.x = s.tujuan.x; this.avatar.y = ty;
    this.cameras.main.centerOn(this.avatar.x, this.avatar.y);
    Hud.setToast('🪜 Kamu naik/turun tangga.', '#f5a623');
  }

  update(): void {
    if (!this.ready) return;
    let dx = 0, dy = 0;
    if (this.keys.up) dy -= SPEED;
    if (this.keys.down) dy += SPEED;
    if (this.keys.left) dx -= SPEED;
    if (this.keys.right) dx += SPEED;
    this.avatar.walking = !!(dx || dy);
    if (this.avatar.walking) {
      const nd = dirFromDelta(dx, dy); if (nd) this.avatar.dir = nd;
      this.moveWithCollision(dx, dy);
      this.avatar.timer++;
    } else { this.avatar.timer = 0; }

    const frame = this.avatar.walking ? (Math.floor(this.avatar.timer / 10) % 2) as 0 | 1 : 0;
    const { frame: fi, flipX } = charFrame('A', this.avatar.dir, frame);
    // Posisi logika (avatar.x/y) tetap pecahan utk tabrakan; yang digambar dibulatkan agar sinkron dgn kamera.
    this.avatar.sprite.setFrame(fi).setFlipX(flipX).setPosition(Math.round(this.avatar.x), Math.round(this.avatar.y));

    this.updateStairs();

    // Petunjuk & tombol sesuai apa yang ada di dekat pemain
    const hack = this.nearest(this.hacks, HACK_RADIUS);
    const clue = this.nearest(this.clues, CLUE_RADIUS);
    const nearDoor = !!this.nearest(this.door ? [this.door] : [], DOOR_RADIUS);

    if (hack) Hud.interiorHint.textContent = '💻 Ada komputer di sini — bobol untuk cari bukti!';
    else if (clue?.teks) Hud.interiorHint.textContent = '🔎 ' + clue.teks;
    else if (nearDoor) Hud.interiorHint.textContent = '🚪 Pintu keluar. Tekan E atau tombol Keluar.';
    else Hud.interiorHint.textContent = this.state.chapter.interiorIntro;
    Hud.computerBtn.disabled = !hack;

    // Kotak penanda berkedip di titik hack saat pemain dekat
    this.highlight.clear();
    if (hack) {
      const a = 0.6 + 0.4 * Math.sin(Date.now() / 150);
      this.highlight.lineStyle(1.5, 0xf5a623, a).strokeRect(hack.x - 10, hack.y - 12, 20, 20);
    }
  }
}