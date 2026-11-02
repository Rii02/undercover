import Phaser from 'phaser';
import type { StealthConfig } from '../state/Chapters';
import type { Direction } from '../state/GameState';
import { dist } from '../state/GameState';
import { Hud } from '../state/Hud';
import { charFrame, CHAR_SCALE_MAP, CHAR_HEIGHT_MAP } from '../state/Sprites';

/**
 * Tantangan stealth di interior: CCTV berputar (Chapter 4), bodyguard patroli (Chapter 5), keduanya (Chapter 6).
 *
 * ATURAN
 *  - CCTV  : kerucut pandang menyapu bolak-balik (pelan), terhalang tembok. Tidak ada bar deteksi: begitu pemain tertangkap
 *            lensa lebih dari sekejap (spotMs), 1 KESEMPATAN CCTV hangus. Jatah default 2 (cctv.chances); habis = pemain terusir.
 *            Tepat di bawah kamera ada titik buta. Tanpa bodyguard, pemain didorong balik ke pintu masuk;
 *            dengan bodyguard, alarm berbunyi dan semua bodyguard menuju posisi pemain.
 *  - Guard : patroli acak di sekitar jangkarnya (atau mengikuti polyline Tiled). Begitu melihat pemain -> mengejar.
 *            Sampai di titik terakhir pemain terlihat (atau kehilangan pandangan) -> mencari -> kembali patroli.
 *            Menyentuh pemain = 1 peringatan + balik ke pintu masuk.
 *            Gerak: rute BFS diperhalus (string-pulling) jadi garis lurus, kecepatan & arah hadap berubah halus,
 *            ada deteksi macet (repath / snap ke tile bebas) dan dorongan lembut antar-penjaga supaya tidak menumpuk.
 *  - Peringatan penjaga mencapai maxStrikes ATAU kesempatan CCTV habis -> pemain terusir dari rumah (InteriorScene.onEject).
 *
 * PENEMPATAN
 *  - Otomatis: sepanjang rute terpendek spawn -> komputer (lewat tangga kalau perlu), tanpa perlu mengubah peta Tiled.
 *  - Manual (opsional) di layer objek 'Objek' pada Tiled:
 *      cctv*   Point. Properti 'arah' (derajat; 0 = kanan, 90 = bawah, 180 = kiri, 270 = atas), 'sapu' (total sudut sapuan, derajat).
 *      guard*  Polyline = rute patroli bolak-balik; Point = posisi awal patroli acak.
 *    Jika jumlah objek manual < count di Chapters.ts, sisanya ditempatkan otomatis.
 */

interface Pt { x: number; y: number }
export interface StairsSpot { x: number; y: number; tujuan?: Pt }

export interface StealthInit {
  scene: Phaser.Scene;
  map: Phaser.Tilemaps.Tilemap;
  cfg: StealthConfig;
  isSolid: (x: number, y: number) => boolean;
  groundLayer: string;
  spawn: Pt;
  /** Titik komputer (hack*) — dipakai menentukan rute pemain. */
  goals: Pt[];
  stairs: StairsSpot[];
  /** Objek Tiled bernama cctv* / guard* dari layer 'Objek'. */
  objects: Phaser.Types.Tilemaps.TiledObject[];
  /** Pemain dikembalikan ke titik masuk. */
  onSendBack: () => void;
  /** Peringatan habis: pemain diusir dari rumah. */
  onEject: () => void;
}

interface Cctv {
  x: number; y: number;
  base: number; swing: number; period: number; phase: number; angle: number;
}

type GuardMode = 'patrol' | 'chase' | 'search';
interface Guard {
  x: number; y: number;
  home: Pt;
  anchor: number;
  sprite: Phaser.GameObjects.Sprite;
  bubble: Phaser.GameObjects.Text;
  mode: GuardMode;
  facing: number;
  dir: Direction;
  path: Pt[];
  route: Pt[] | null;
  routeIdx: number;
  wait: number;
  lost: number;
  searchMs: number;
  lastSeen: Pt;
  repathAt: number;
  walking: boolean;
  /** Jarak tempuh (px) untuk animasi langkah. */
  stride: number;
  /** Kecepatan saat ini (px per frame 60fps) — naik/turun halus menuju target. */
  speed: number;
  /** Arah hadap dasar & penghitung waktu untuk gerakan menoleh saat diam. */
  idleBase: number;
  idleT: number;
  /** Deteksi macet. */
  stuckT: number;
  stuckN: number;
  lx: number;
  ly: number;
}

const DEFAULT_CCTV = { range: 120, fovDeg: 50, sweepDeg: 180, periodMs: 6500, spotMs: 300, chances: 2 };
const DEFAULT_GUARD = { charKey: 'G', patrolSpeed: 0.7, chaseSpeed: 1.15, range: 100, fovDeg: 70, wanderTiles: 5 };
const DEFAULT_MAX_STRIKES = 3;

const GRACE_MS = 1500;        // kebal sebentar setelah dikembalikan ke pintu masuk
const ALARM_MS = 9000;        // lama alarm (bodyguard tahu posisi pemain)
const CCTV_LOCK_MS = 4000;    // jeda CCTV setelah memicu alarm, supaya tidak memicu beruntun
const LOSE_SIGHT_MS = 3500;   // lama mengejar sebelum menyerah kalau kehilangan pandangan
const SEARCH_MS = 2500;
const CATCH_RADIUS = 13;
const HEAR_RADIUS = 28;       // dalam jarak ini guard "merasakan" pemain walau tidak menghadap
const CCTV_BLIND_RADIUS = 16; // titik buta tepat di bawah kamera

// ---- gerak penjaga
const BODY_R = 5;             // setengah lebar badan penjaga utk cek garis lurus (px)
const TURN_WALK = 0.009;      // laju putar badan saat jalan (rad/ms)
const TURN_CHASE = 0.014;     // laju putar saat mengejar
const TURN_IDLE = 0.004;      // laju putar saat diam / menoleh
const ACCEL_MS = 260;         // waktu menuju kecepatan target
const DECEL_MS = 160;         // waktu melambat
const REPATH_MS = 400;        // selang hitung ulang rute saat mengejar tanpa garis lurus
const STRIDE_PX = 7;          // ganti frame langkah tiap sekian px
const STUCK_CHECK_MS = 600;   // periksa kemajuan gerak tiap sekian ms
const GUARD_GAP = 14;         // jarak minimum antar-penjaga sebelum saling dorong

const DIRS8: ReadonlyArray<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const rad = (deg: number) => (deg * Math.PI) / 180;

function getProp(o: any, key: string): string | undefined {
  const p = o.properties;
  if (!p) return undefined;
  if (Array.isArray(p)) return p.find((q: any) => q.name === key)?.value;
  return p[key];
}

export class StealthSystem {
  private readonly scene: Phaser.Scene;
  private readonly map: Phaser.Tilemaps.Tilemap;
  private readonly cfg: StealthConfig;
  private readonly isSolid: (x: number, y: number) => boolean;
  private readonly groundLayer: string;
  private readonly spawn: Pt;
  private readonly goals: Pt[];
  private readonly stairs: StairsSpot[];
  private readonly objects: Phaser.Types.Tilemaps.TiledObject[];
  private readonly onSendBack: () => void;
  private readonly onEject: () => void;

  private readonly cc: typeof DEFAULT_CCTV & { count: number };
  private readonly gc: typeof DEFAULT_GUARD & { count: number };
  private readonly maxStrikes: number;

  // grid jalan (tile bebas tembok) utk penempatan & pathfinding guard
  private W = 0; private H = 0; private T = 16;
  private walk = new Uint8Array(0);

  private cctvs: Cctv[] = [];
  private guards: Guard[] = [];
  private gfx: Phaser.GameObjects.Graphics;
  private hudEl: HTMLDivElement | null = null;
  private lastHud = '';

  private strikes = 0;
  private cctvLeft = 0;       // sisa kesempatan CCTV (0 = terusir)
  private spotMs = 0;         // lama pemain terus terlihat lensa (tanpa bar; hanya penanda kerucut oranye)
  private graceMs = 0;
  private alarmMs = 0;
  private cctvLockMs = 0;
  private cctvSeenNow = false;
  private ejected = false;

  constructor(init: StealthInit) {
    this.scene = init.scene; this.map = init.map; this.cfg = init.cfg;
    this.isSolid = init.isSolid; this.groundLayer = init.groundLayer;
    this.spawn = init.spawn; this.goals = init.goals; this.stairs = init.stairs; this.objects = init.objects;
    this.onSendBack = init.onSendBack; this.onEject = init.onEject;
    this.cc = { ...DEFAULT_CCTV, count: 0, ...(init.cfg.cctv ?? {}) };
    this.gc = { ...DEFAULT_GUARD, count: 0, ...(init.cfg.guards ?? {}) };
    this.maxStrikes = init.cfg.maxStrikes ?? DEFAULT_MAX_STRIKES;
    this.cctvLeft = Math.max(1, Math.round(this.cc.chances));

    this.gfx = this.scene.add.graphics().setDepth(4);

    this.buildGrid(true);
    // Kalau lantai tidak digambar di layer ground, grid-nya kosong -> ulangi tanpa syarat ground.
    if (this.bfs(this.nearestWalk(this.spawn, 10)).order.length < 30) this.buildGrid(false);

    this.placeHazards();
    this.createHud();
    this.renderHud();
  }

  // ------------------------------------------------------------------ API untuk scene

  /** Panggil tiap frame dari InteriorScene.update(). px,py = posisi kaki pemain, dt = ms. */
  update(px: number, py: number, dtRaw: number): void {
    if (this.ejected) return;
    const dt = Math.min(dtRaw || 16, 50);
    const now = this.scene.time.now;
    this.graceMs = Math.max(0, this.graceMs - dt);
    this.alarmMs = Math.max(0, this.alarmMs - dt);
    this.cctvLockMs = Math.max(0, this.cctvLockMs - dt);

    // --- CCTV
    this.cctvSeenNow = false;
    for (const c of this.cctvs) {
      c.angle = c.base + c.swing * Math.sin((now / c.period) * Math.PI * 2 + c.phase);
      if (this.graceMs <= 0 && this.cctvLockMs <= 0
        && this.sees(c.x, c.y - 2, c.angle, this.cc.range, rad(this.cc.fovDeg), px, py - 2, CCTV_BLIND_RADIUS, 0)) {
        this.cctvSeenNow = true;
      }
    }
    if (this.cctvs.length) {
      // Tanpa bar: terlihat lebih dari spotMs = 1 kesempatan hangus. Lepas dari lensa -> penanda cepat padam.
      if (this.cctvSeenNow) this.spotMs += dt;
      else this.spotMs = Math.max(0, this.spotMs - dt * 2);
      if (this.spotMs >= this.cc.spotMs) { this.cctvLockMs = CCTV_LOCK_MS; this.addStrike('cctv', px, py); if (this.ejected) return; }
    }

    // --- Guard
    for (const g of this.guards) {
      this.updateGuard(g, dt, now, px, py);
      if (this.ejected) return;
    }
    this.separateGuards();
    for (const g of this.guards) this.syncGuard(g);

    this.draw();
    this.renderHud();
  }

  /** Teks petunjuk yang menimpa baris petunjuk interior saat ada bahaya; null = tidak ada. */
  statusHint(): string | null {
    if (this.alarmMs > 0) return '🚨 ALARM! Penjaga menuju posisimu — putus pandangan dan menjauh!';
    if (this.guards.some(g => g.mode === 'chase')) return '❗ Penjaga mengejarmu! Lari dan hilang dari pandangannya.';
    if (this.spotMs > 0) return '📹 Kamu terlihat CCTV! Keluar dari jangkauan lensanya.';
    return null;
  }

  /** Sedang dikejar / alarm / hampir terdeteksi? Dipakai untuk menolak membobol komputer di saat genting. */
  isAlerted(): boolean {
    return this.alarmMs > 0 || this.spotMs > 0 || this.guards.some(g => g.mode === 'chase');
  }

  destroy(): void {
    this.gfx.destroy();
    this.guards.forEach(g => { g.sprite.destroy(); g.bubble.destroy(); });
    this.guards = []; this.cctvs = [];
    this.hudEl?.remove(); this.hudEl = null;
  }

  // ------------------------------------------------------------------ strike

  private addStrike(reason: 'cctv' | 'guard', px: number, py: number): void {
    // CCTV punya jatah sendiri (cctvLeft); penjaga memakai jatah peringatan (strikes/maxStrikes).
    let left: number;
    if (reason === 'cctv') { this.cctvLeft = Math.max(0, this.cctvLeft - 1); left = this.cctvLeft; }
    else { this.strikes++; left = this.maxStrikes - this.strikes; }
    this.spotMs = 0;
    this.scene.cameras.main.flash(180, 255, 40, 40);
    this.scene.cameras.main.shake(160, 0.004);
    if (left <= 0) {
      this.ejected = true;
      this.renderHud();
      this.onEject();
      return;
    }
    if (reason === 'cctv' && this.guards.length) {
      // Combo CCTV + bodyguard: kamera memanggil penjaga, pemain tidak dipindah.
      this.alarmMs = ALARM_MS;
      this.guards.forEach(g => this.startChase(g, px, py));
      Hud.setToast(`📹 CCTV menangkap wajahmu! Alarm berbunyi, penjaga menuju lokasimu! (sisa kesempatan CCTV: ${left})`, '#ff6b6b');
    } else {
      this.sendBack();
      Hud.setToast(reason === 'cctv'
        ? `📹 CCTV mendeteksimu! Lorong dikunci dan kamu terdorong ke pintu masuk. (sisa kesempatan CCTV: ${left})`
        : `👮 Penjaga menangkapmu dan menyeretmu ke pintu masuk! (sisa peringatan: ${left})`, '#ff6b6b');
    }
  }

  private sendBack(): void {
    this.onSendBack();
    this.graceMs = GRACE_MS;
    this.alarmMs = 0;
    this.spotMs = 0;
    this.guards.forEach(g => this.resetGuard(g));
  }

  // ------------------------------------------------------------------ penglihatan

  /** Titik (tx,ty) terlihat dari (ox,oy) yg menghadap `ang`? Dibatasi jarak, sudut pandang, & tembok.
   *  blind = radius titik buta; hear = radius "mendengar" (terlihat tanpa peduli arah). */
  private sees(ox: number, oy: number, ang: number, range: number, fov: number, tx: number, ty: number, blind: number, hear: number): boolean {
    const dx = tx - ox, dy = ty - oy;
    const d = Math.hypot(dx, dy);
    if (d > range || d < blind) return false;
    if (d > hear) {
      const diff = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - ang));
      if (diff > fov / 2) return false;
    }
    return !this.rayBlocked(ox, oy, tx, ty);
  }

  private rayBlocked(x1: number, y1: number, x2: number, y2: number): boolean {
    const d = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.ceil(d / 4);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this.isSolid(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return true;
    }
    return false;
  }

  private castRay(ox: number, oy: number, ang: number, range: number): Pt {
    const cx = Math.cos(ang), cy = Math.sin(ang);
    let last = { x: ox, y: oy };
    for (let d = 3; d <= range; d += 3) {
      const x = ox + cx * d, y = oy + cy * d;
      if (this.isSolid(x, y)) return last;
      last = { x, y };
    }
    return last;
  }

  // ------------------------------------------------------------------ guard

  private startChase(g: Guard, px: number, py: number): void {
    if (g.mode !== 'chase') { this.setBubble(g, '❗'); g.path = []; g.repathAt = 0; }
    g.mode = 'chase'; g.lost = 0; g.lastSeen = { x: px, y: py };
  }

  private enterSearch(g: Guard): void {
    g.mode = 'search'; g.searchMs = SEARCH_MS; g.path = [];
    g.idleBase = g.facing; g.idleT = 0;
    this.setBubble(g, '❓');
  }

  private resetGuard(g: Guard): void {
    g.x = g.home.x; g.y = g.home.y; g.path = []; g.mode = 'patrol'; g.wait = 800; g.lost = 0; g.routeIdx = 0;
    g.speed = 0; g.walking = false; g.stuckT = 0; g.stuckN = 0; g.lx = g.x; g.ly = g.y;
    g.idleBase = g.facing; g.idleT = 0;
    this.setBubble(g, null);
  }

  private setBubble(g: Guard, txt: string | null): void {
    if (!txt) { g.bubble.setVisible(false); return; }
    g.bubble.setText(txt).setVisible(true);
  }

  /** Putar badan menuju `target` dengan laju terbatas (rad/ms) — tidak pernah menyentak. */
  private turn(g: Guard, target: number, dt: number, rate: number): void {
    const diff = Phaser.Math.Angle.Wrap(target - g.facing);
    const m = rate * dt;
    g.facing = Phaser.Math.Angle.Wrap(g.facing + Phaser.Math.Clamp(diff, -m, m));
  }

  /** Arah sprite 4 penjuru dengan histeresis, supaya tidak berkedip di sudut 45°. */
  private facingDir(cur: Direction, ang: number): Direction {
    const fx = Math.cos(ang), fy = Math.sin(ang);
    const horiz = cur === 'left' || cur === 'right';
    const useH = horiz ? Math.abs(fx) > Math.abs(fy) * 0.8 : Math.abs(fx) > Math.abs(fy) * 1.25;
    if (useH) return fx < 0 ? 'left' : 'right';
    return fy < 0 ? 'up' : 'down';
  }

  private updateGuard(g: Guard, dt: number, now: number, px: number, py: number): void {
    const gc = this.gc;

    // Pengaman: kalau posisi entah kenapa berada di tile tak bebas, tarik ke tile bebas terdekat.
    if (!this.ok(Math.floor(g.x / this.T), Math.floor(g.y / this.T))) this.snapToWalk(g);

    const seen = this.graceMs <= 0
      && this.sees(g.x, g.y - 2, g.facing, gc.range, rad(gc.fovDeg), px, py - 2, 0, HEAR_RADIUS);
    const live = this.graceMs <= 0 && (seen || this.alarmMs > 0);

    if (live) {
      this.startChase(g, px, py);
    } else if (g.mode === 'chase') {
      g.lost += dt;
      if (g.lost > LOSE_SIGHT_MS) this.enterSearch(g);
    }

    let goal = 0;            // kecepatan target (px/frame)
    let rate = TURN_WALK;    // laju putar

    if (g.mode === 'chase') {
      goal = gc.chaseSpeed; rate = TURN_CHASE;
      const t = g.lastSeen;
      if (live && this.clearLine(g.x, g.y, t.x, t.y)) {
        g.path = [t];                       // pemain kelihatan & jalan lurus: kejar langsung, tanpa hitung ulang rute
      } else if (now >= g.repathAt) {
        g.repathAt = now + REPATH_MS;
        const cell = this.nearestWalk(t, 3);
        g.path = cell < 0 ? [] : this.planPath(g, cell, t);
      }
      // Sudah sampai titik terakhir pemain terlihat tapi orangnya tidak ada -> langsung mencari (tidak berdiri bengong).
      if (g.path.length === 0 && !live) this.enterSearch(g);
    } else if (g.mode === 'patrol') {
      goal = gc.patrolSpeed;
      if (g.path.length === 0) {
        if (g.wait > 0) {
          g.wait -= dt;
          g.idleT += dt;                     // menoleh pelan kiri-kanan sambil berhenti
          this.turn(g, g.idleBase + Math.sin(g.idleT / 900) * 0.9, dt, TURN_IDLE);
        } else {
          this.pickPatrolPath(g);
          if (g.path.length === 0) g.wait = Phaser.Math.Between(800, 1600);  // tidak ada tujuan: jangan hitung ulang tiap frame
        }
      }
    }

    if (g.mode === 'search') {
      g.searchMs -= dt;
      g.idleT += dt;
      this.turn(g, g.idleBase + Math.sin(g.idleT / 600) * 1.3, dt, TURN_IDLE * 1.5);
      if (g.searchMs <= 0) { g.mode = 'patrol'; g.wait = 600; g.idleBase = g.facing; g.idleT = 0; this.setBubble(g, null); }
    }

    const hadPath = g.path.length > 0;
    this.stepPath(g, goal, rate, dt);
    if (hadPath && g.path.length === 0 && g.mode === 'patrol') {
      g.wait = Phaser.Math.Between(1200, 2400);   // tiba di tujuan: berhenti sebentar
      g.idleBase = g.facing; g.idleT = 0;
    }

    if (g.mode === 'chase' && this.graceMs <= 0 && dist(g.x, g.y, px, py) < CATCH_RADIUS) {
      this.addStrike('guard', px, py);
      return;
    }

    this.checkStuck(g, dt);
    g.dir = this.facingDir(g.dir, g.facing);
  }

  /** Jalan menyusuri g.path. Kecepatan naik/turun halus, melambat saat mendekati tujuan, badan berputar mengikuti arah jalan. */
  private stepPath(g: Guard, goal: number, rate: number, dt: number): void {
    const scale = dt / 16.667;
    const has = g.path.length > 0;
    let target = has ? goal : 0;
    if (has && g.mode !== 'chase') {
      const last = g.path[g.path.length - 1];
      target *= Phaser.Math.Clamp(dist(g.x, g.y, last.x, last.y) / 14, 0.4, 1);
    }
    g.speed += (target - g.speed) * Math.min(1, dt / (target > g.speed ? ACCEL_MS : DECEL_MS));
    if (target === 0 && g.speed < 0.03) g.speed = 0;

    g.walking = false;
    if (!has) return;

    const w0 = g.path[0];
    if (Math.hypot(w0.x - g.x, w0.y - g.y) > 0.5) this.turn(g, Math.atan2(w0.y - g.y, w0.x - g.x), dt, rate);

    let rem = g.speed * scale, moved = 0;
    while (rem > 0 && g.path.length) {
      const w = g.path[0];
      const dx = w.x - g.x, dy = w.y - g.y, d = Math.hypot(dx, dy);
      if (d <= rem) { g.x = w.x; g.y = w.y; g.path.shift(); rem -= d; moved += d; }
      else { g.x += (dx / d) * rem; g.y += (dy / d) * rem; moved += rem; rem = 0; }
    }
    if (moved > 0.01) { g.walking = true; g.stride += moved; }
  }

  /** Penjaga "berjalan" tapi tidak maju -> hitung ulang rute; kalau masih macet, tarik ke tile bebas terdekat. */
  private checkStuck(g: Guard, dt: number): void {
    g.stuckT += dt;
    if (g.stuckT < STUCK_CHECK_MS) return;
    const moved = dist(g.x, g.y, g.lx, g.ly);
    g.stuckT = 0; g.lx = g.x; g.ly = g.y;
    const far = g.path.length > 0 && dist(g.x, g.y, g.path[0].x, g.path[0].y) > 4;
    if (far && moved < 1.2) {
      g.stuckN++;
      g.path = []; g.repathAt = 0;
      if (g.mode === 'patrol') g.wait = 0;
      if (g.stuckN >= 2) { this.snapToWalk(g); g.stuckN = 0; }
    } else if (moved >= 1.2) {
      g.stuckN = 0;
    }
  }

  private snapToWalk(g: Guard): void {
    const c = this.nearestWalk(g, 4);
    if (c < 0) return;
    const p = this.ptOf(c);
    g.x = p.x; g.y = p.y; g.path = []; g.speed = 0; g.lx = g.x; g.ly = g.y;
  }

  /** Dorongan lembut supaya dua penjaga tidak menumpuk di satu titik. */
  private separateGuards(): void {
    const gs = this.guards;
    for (let i = 0; i < gs.length; i++) {
      for (let j = i + 1; j < gs.length; j++) {
        const a = gs[i], b = gs[j];
        let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d >= GUARD_GAP) continue;
        if (d < 0.01) { dx = 1; dy = 0; d = 1; }
        const push = (GUARD_GAP - d) * 0.12, ux = dx / d, uy = dy / d;
        this.nudge(a, -ux * push, -uy * push);
        this.nudge(b, ux * push, uy * push);
      }
    }
  }

  private nudge(g: Guard, dx: number, dy: number): void {
    const nx = g.x + dx, ny = g.y + dy;
    if (this.ok(Math.floor(nx / this.T), Math.floor(ny / this.T))) { g.x = nx; g.y = ny; }
  }

  private syncGuard(g: Guard): void {
    const walkFrame = g.walking ? (Math.floor(g.stride / STRIDE_PX) % 2) as 0 | 1 : 0;
    const { frame, flipX } = charFrame(this.gc.charKey, g.dir, walkFrame);
    g.sprite.setFrame(frame).setFlipX(flipX).setPosition(Math.round(g.x), Math.round(g.y));
    g.bubble.setPosition(Math.round(g.x), Math.round(g.y) - CHAR_HEIGHT_MAP - 6);
  }

  private pickPatrolPath(g: Guard): void {
    let to = -1;
    if (g.route && g.route.length > 1) {
      g.routeIdx = (g.routeIdx + 1) % g.route.length;
      to = this.nearestWalk(g.route[g.routeIdx], 4);
    } else {
      const { depth, order } = this.bfs(g.anchor, -1, this.gc.wanderTiles * 2);
      const cands = order.filter(c => depth[c] >= 3);
      if (cands.length) to = Phaser.Utils.Array.GetRandom(cands);
    }
    g.path = to < 0 ? [] : this.planPath(g, to);
  }

  // ------------------------------------------------------------------ rute halus

  /** Badan penjaga (selebar 2*BODY_R) bisa lewat garis lurus a->b tanpa menyentuh tile tak bebas? */
  private clearLine(x1: number, y1: number, x2: number, y2: number): boolean {
    const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
    if (d < 0.01) return true;
    const nx = (-dy / d) * BODY_R, ny = (dx / d) * BODY_R;
    return !this.moveBlocked(x1, y1, x2, y2)
      && !this.moveBlocked(x1 + nx, y1 + ny, x2 + nx, y2 + ny)
      && !this.moveBlocked(x1 - nx, y1 - ny, x2 - nx, y2 - ny);
  }

  private moveBlocked(x1: number, y1: number, x2: number, y2: number): boolean {
    const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 4));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (!this.ok(Math.floor((x1 + (x2 - x1) * t) / this.T), Math.floor((y1 + (y2 - y1) * t) / this.T))) return true;
    }
    return false;
  }

  /** Rute dari posisi penjaga SAAT INI ke cell tujuan. Titik tengah cell asal dibuang (penyebab bolak-balik/getar di rute lama),
   *  lalu rute diperhalus: lompat ke titik terjauh yang masih bisa dicapai lurus. `exact` = titik pasti di cell tujuan (mis. posisi pemain). */
  private planPath(g: Guard, goalCell: number, exact?: Pt): Pt[] {
    const cells = this.pathCells(this.cellOf(g), goalCell);
    if (!cells) return [];
    const pts = cells.slice(1).map(c => this.ptOf(c));
    if (exact && this.cellOf(exact) === goalCell) {
      if (pts.length) pts[pts.length - 1] = exact; else pts.push(exact);
    }
    const out: Pt[] = [];
    let cur: Pt = { x: g.x, y: g.y };
    let i = 0;
    while (i < pts.length) {
      let j = i;
      for (let k = pts.length - 1; k > i; k--) {
        if (this.clearLine(cur.x, cur.y, pts[k].x, pts[k].y)) { j = k; break; }
      }
      out.push(pts[j]);
      cur = pts[j];
      i = j + 1;
    }
    return out;
  }

  // ------------------------------------------------------------------ grid & pathfinding

  private buildGrid(requireGround: boolean): void {
    this.W = this.map.width; this.H = this.map.height; this.T = this.map.tileWidth;
    this.walk = new Uint8Array(this.W * this.H);
    for (let ty = 0; ty < this.H; ty++) {
      for (let tx = 0; tx < this.W; tx++) {
        const solid = this.isSolid(tx * this.T + this.T / 2, ty * this.T + this.T / 2);
        const ground = !requireGround || !!this.map.hasTileAt(tx, ty, this.groundLayer);
        this.walk[ty * this.W + tx] = !solid && ground ? 1 : 0;
      }
    }
  }

  private ok(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.W && ty < this.H && this.walk[ty * this.W + tx] === 1;
  }

  private cellOf(p: Pt): number {
    const tx = Phaser.Math.Clamp(Math.floor(p.x / this.T), 0, this.W - 1);
    const ty = Phaser.Math.Clamp(Math.floor(p.y / this.T), 0, this.H - 1);
    return ty * this.W + tx;
  }

  private ptOf(c: number): Pt {
    return { x: (c % this.W) * this.T + this.T / 2, y: Math.floor(c / this.W) * this.T + this.T / 2 };
  }

  /** Cell bebas terdekat (mencari melingkar). -1 kalau tidak ada. */
  private nearestWalk(p: Pt, maxR = 6): number {
    const c0 = this.cellOf(p);
    const tx0 = c0 % this.W, ty0 = Math.floor(c0 / this.W);
    if (this.ok(tx0, ty0)) return c0;
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.ok(tx0 + dx, ty0 + dy)) return (ty0 + dy) * this.W + (tx0 + dx);
        }
      }
    }
    return -1;
  }

  /** BFS 8 arah (diagonal tidak boleh memotong sudut tembok). goal >= 0 = berhenti begitu ketemu. */
  private bfs(src: number, goal = -1, maxDepth = Infinity): { prev: Int32Array; depth: Int16Array; order: number[] } {
    const N = this.W * this.H;
    const prev = new Int32Array(N).fill(-1);
    const depth = new Int16Array(N).fill(-1);
    if (src < 0) return { prev, depth, order: [] };
    const q: number[] = [src];
    depth[src] = 0; prev[src] = src;
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      if (c === goal) break;
      if (depth[c] >= maxDepth) continue;
      const cx = c % this.W, cy = Math.floor(c / this.W);
      for (const [dx, dy] of DIRS8) {
        const nx = cx + dx, ny = cy + dy;
        if (!this.ok(nx, ny)) continue;
        if (dx !== 0 && dy !== 0 && (!this.ok(cx + dx, cy) || !this.ok(cx, cy + dy))) continue;
        const ni = ny * this.W + nx;
        if (depth[ni] >= 0) continue;
        depth[ni] = depth[c] + 1; prev[ni] = c; q.push(ni);
      }
    }
    return { prev, depth, order: q };
  }

  private pathCells(a: number, b: number): number[] | null {
    if (a < 0 || b < 0) return null;
    const { prev, depth } = this.bfs(a, b);
    if (depth[b] < 0) return null;
    const out: number[] = [];
    for (let c = b; ; c = prev[c]) { out.push(c); if (c === a) break; }
    return out.reverse();
  }

  // ------------------------------------------------------------------ penempatan

  /** Rute pemain dari spawn ke komputer (lewat tangga kalau komputer ada di lantai lain). */
  private findRoute(): number[] {
    const sc = this.nearestWalk(this.spawn, 10);
    if (sc < 0) return [];
    for (const g of this.goals) {
      const p = this.pathCells(sc, this.nearestWalk(g, 4));
      if (p) return p;
    }
    for (const s of this.stairs) {
      const p1 = this.pathCells(sc, this.nearestWalk(s, 4));
      if (!p1 || !s.tujuan) continue;
      const land = this.nearestWalk(s.tujuan, 6);
      for (const g of this.goals) {
        const p2 = this.pathCells(land, this.nearestWalk(g, 4));
        if (p2) return p1.concat(p2);
      }
    }
    const { order } = this.bfs(sc);
    return this.pathCells(sc, order[order.length - 1]) ?? [sc];
  }

  private placeHazards(): void {
    const route = this.findRoute();
    const L = route.length;
    if (L === 0) console.warn('[Stealth] Tidak ada rute dari spawn — penempatan otomatis dilewati (objek manual tetap dipakai).');

    // Hindari menaruh bahaya persis di pintu masuk atau di depan komputer.
    const clear = (c: number) => {
      const p = this.ptOf(c);
      return dist(p.x, p.y, this.spawn.x, this.spawn.y) >= 64 && this.goals.every(g => dist(p.x, p.y, g.x, g.y) >= 56);
    };
    const pickIdx = (frac: number): number => {
      if (!L) return -1;
      const i = Math.min(L - 1, Math.floor(L * frac));
      for (let k = 0; k < L; k++) { const j = (i + k) % L; if (clear(route[j])) return j; }
      return i;
    };
    const named = (prefix: string) => this.objects.filter(o => (o.name || '').toLowerCase().startsWith(prefix));

    // ---- CCTV
    if (this.cfg.cctv) {
      const manual = named('cctv');
      manual.forEach((o, i) => {
        const sweep = getProp(o, 'sapu');
        this.addCctv(o.x ?? 0, o.y ?? 0, rad(Number(getProp(o, 'arah') ?? 0)), i, sweep !== undefined ? rad(Number(sweep)) / 2 : undefined);
      });
      const auto = Math.max(0, this.cc.count - manual.length);
      for (let i = 0; i < auto; i++) {
        const idx = pickIdx(auto === 1 ? 0.45 : 0.2 + (0.55 * i) / (auto - 1));
        if (idx < 0) break;
        const p = this.ptOf(route[idx]);
        const back = route[Math.max(0, idx - 5)], fwd = route[Math.min(L - 1, idx + 5)];
        const ref = this.ptOf(back !== route[idx] ? back : fwd);
        // Kamera menatap ke arah pemain datang; sapuannya lebar sehingga ada saatnya lensa berpaling ke tembok.
        this.addCctv(p.x, p.y, Math.atan2(ref.y - p.y, ref.x - p.x), manual.length + i);
      }
    }

    // ---- Bodyguard
    if (this.cfg.guards) {
      const manual = named('guard');
      manual.forEach(o => {
        const poly = (o as any).polyline as Pt[] | undefined;
        const ox = o.x ?? 0, oy = o.y ?? 0;
        const patrol = poly && poly.length > 1 ? poly.map(p => ({ x: ox + p.x, y: oy + p.y })) : null;
        this.addGuard({ x: ox, y: oy }, patrol);
      });
      const auto = Math.max(0, this.gc.count - manual.length);
      for (let i = 0; i < auto; i++) {
        const idx = pickIdx(auto === 1 ? 0.5 : 0.35 + (0.45 * i) / (auto - 1));
        if (idx < 0) break;
        this.addGuard(this.ptOf(route[idx]), null);
      }
    }
  }

  private addCctv(x: number, y: number, base: number, i: number, swing?: number): void {
    this.cctvs.push({
      x, y, base, swing: swing ?? rad(this.cc.sweepDeg) / 2,
      period: this.cc.periodMs, phase: i * Math.PI * 0.8, angle: base
    });
  }

  private addGuard(pt: Pt, route: Pt[] | null): void {
    const anchor = this.nearestWalk(pt, 6);
    if (anchor < 0) return;
    const p = this.ptOf(anchor);
    const { frame } = charFrame(this.gc.charKey, 'down', 0);
    const sprite = this.scene.add.sprite(p.x, p.y, 'sheet', frame).setOrigin(0.5, 1).setScale(CHAR_SCALE_MAP).setDepth(3);
    const bubble = this.scene.add.text(p.x, p.y - CHAR_HEIGHT_MAP - 6, '❗', { fontSize: '12px' }).setOrigin(0.5).setDepth(4).setVisible(false);
    this.guards.push({
      x: p.x, y: p.y, home: p, anchor, sprite, bubble, mode: 'patrol', facing: Math.PI / 2, dir: 'down',
      path: [], route, routeIdx: 0, wait: 800, lost: 0, searchMs: 0, lastSeen: p, repathAt: 0, walking: false,
      stride: 0, speed: 0, idleBase: Math.PI / 2, idleT: 0, stuckT: 0, stuckN: 0, lx: p.x, ly: p.y
    });
  }

  // ------------------------------------------------------------------ gambar

  private drawCone(ox: number, oy: number, ang: number, range: number, fov: number, color: number, alpha: number): void {
    const g = this.gfx;
    const steps = 12;
    g.fillStyle(color, alpha);
    g.beginPath();
    g.moveTo(ox, oy);
    for (let i = 0; i <= steps; i++) {
      const p = this.castRay(ox, oy, ang - fov / 2 + (fov * i) / steps, range);
      g.lineTo(p.x, p.y);
    }
    g.closePath();
    g.fillPath();
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    const alarm = this.alarmMs > 0;
    for (const c of this.cctvs) {
      const hot = alarm || this.spotMs > 0;
      this.drawCone(c.x, c.y - 2, c.angle, this.cc.range, rad(this.cc.fovDeg), alarm ? 0xff3030 : hot ? 0xffa030 : 0xffe066, hot ? 0.3 : 0.2);
      g.fillStyle(0x1a1a1a, 1).fillRect(c.x - 4, c.y - 8, 8, 6);
      g.fillStyle(hot ? 0xff2020 : 0x30ff70, 1).fillCircle(c.x + Math.cos(c.angle) * 3, c.y - 5 + Math.sin(c.angle) * 2, 1.5);
    }
    for (const gd of this.guards) {
      const chasing = gd.mode === 'chase';
      this.drawCone(gd.x, gd.y - 2, gd.facing, this.gc.range, rad(this.gc.fovDeg), chasing ? 0xff3030 : 0xff7a3d, chasing ? 0.3 : 0.2);
    }
  }

  // ------------------------------------------------------------------ HUD (elemen DOM dibuat otomatis, tidak perlu ubah index.html)

  private createHud(): void {
    const slot = document.getElementById('mapCanvasSlot');
    if (!slot) return;
    document.getElementById('stealthHud')?.remove();
    if (getComputedStyle(slot).position === 'static') slot.style.position = 'relative';
    const el = document.createElement('div');
    el.id = 'stealthHud';
    Object.assign(el.style, {
      position: 'absolute', left: '6px', top: '6px', zIndex: '5', pointerEvents: 'none',
      font: '11px monospace', color: '#eef2f7', background: 'rgba(0,0,0,.6)', padding: '4px 6px', borderRadius: '4px'
    } as Partial<CSSStyleDeclaration>);
    slot.appendChild(el);
    this.hudEl = el;
  }

  private renderHud(): void {
    if (!this.hudEl) return;
    const parts: string[] = [];
    if (this.guards.length) {
      const dots = Array.from({ length: this.maxStrikes }, (_, i) => (i < this.strikes ? '🔴' : '⚪')).join('');
      parts.push(`👮 Peringatan ${dots}`);
    }
    if (this.cctvs.length) {
      const total = Math.max(1, Math.round(this.cc.chances));
      const hearts = Array.from({ length: total }, (_, i) => (i < this.cctvLeft ? '🟢' : '🔴')).join('');
      parts.push(`📹 Kesempatan CCTV ${hearts}` + (this.spotMs > 0 ? ' <span style="color:#ffa030">⚠ terlihat!</span>' : ''));
    }
    const html = parts.join('<div style="height:3px"></div>');
    if (html !== this.lastHud) { this.hudEl.innerHTML = html; this.lastHud = html; }
  }
}