/**
 * Tombol layar penuh (Fullscreen API) di pojok kiri bawah, tersedia di semua layar (menu, Story, Simulasi).
 * Dibuat lewat kode (tanpa mengubah index.html). Esc / tombol yang sama keluar dari layar penuh.
 * Kalau browser tidak mendukung (mis. Safari iPhone), tombol tidak ditampilkan.
 */
const BTN_ID = 'fullscreenBtn';
const STYLE_ID = 'fullscreenStyle';

const CSS = `
#${BTN_ID}{position:fixed;bottom:calc(12px + env(safe-area-inset-bottom,0px));left:12px;z-index:980;min-width:44px;min-height:44px;
  padding:10px 16px;border-radius:10px;border:2px solid #445566;background:rgba(0,0,0,.72);color:#eef2f7;
  font:700 16px monospace;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.5)}
#${BTN_ID}:hover,#${BTN_ID}:focus-visible{border-color:#3dff6a;color:#3dff6a;outline:none}`;

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void; webkitFullscreenEnabled?: boolean };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const doc = document as FsDoc;
const isFull = () => !!(doc.fullscreenElement || doc.webkitFullscreenElement);
const supported = () => !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);

async function toggle(): Promise<void> {
  try {
    if (isFull()) {
      if (doc.exitFullscreen) await doc.exitFullscreen();
      else await doc.webkitExitFullscreen?.();
    } else {
      const el = document.documentElement as FsEl;
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else await el.webkitRequestFullscreen?.();
    }
  } catch (e) {
    console.warn('[Fullscreen] Gagal berpindah mode layar penuh:', e);
  }
}

/** Pasang tombol layar penuh (panggil sekali, mis. dari main.ts). */
export function mountFullscreenButton(): void {
  if (!supported() || document.getElementById(BTN_ID)) return;
  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const b = document.createElement('button');
  b.id = BTN_ID;
  b.type = 'button';
  const refresh = () => {
    b.textContent = isFull() ? '✕ Keluar' : '⛶ Full';
    b.setAttribute('aria-label', isFull() ? 'Keluar dari layar penuh' : 'Layar penuh');
  };
  b.onclick = () => { void toggle(); b.blur(); };   // blur: supaya Spasi/Enter di game tidak menekan tombol ini lagi
  document.addEventListener('fullscreenchange', refresh);
  document.addEventListener('webkitfullscreenchange', refresh);
  refresh();
  document.body.appendChild(b);
}