/**
 * Tombol "☰ Menu" melayang (pojok kanan bawah) selama mode Story, lengkap dengan dialog konfirmasi.
 * Dibuat lewat kode (tanpa mengubah index.html). Tombol ini hanya dipasang oleh MapScene, jadi
 * tidak muncul di menu maupun mode Simulasi. Layar transisi / Mission Complete (z-index 9999) menutupinya.
 */
const BTN_ID = 'storyMenuBtn';
const MODAL_ID = 'storyMenuModal';
const STYLE_ID = 'storyMenuStyle';

const CSS = `
#${BTN_ID}{position:fixed;bottom:calc(12px + env(safe-area-inset-bottom,0px));right:12px;z-index:900;min-width:96px;min-height:44px;padding:12px 20px;border-radius:10px;border:2px solid #445566;
  background:rgba(0,0,0,.72);color:#eef2f7;font:700 17px monospace;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.5)}
#${BTN_ID}:hover,#${BTN_ID}:focus-visible{border-color:#3dff6a;color:#3dff6a;outline:none}
#${MODAL_ID}{position:fixed;inset:0;z-index:950;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7);font-family:monospace}
#${MODAL_ID} .sm-card{max-width:min(340px,88vw);padding:18px;border-radius:10px;background:#0b1a12;border:2px solid #3dff6a;color:#eef2f7;text-align:center}
#${MODAL_ID} .sm-title{font-weight:900;font-size:15px;color:#3dff6a;margin-bottom:8px}
#${MODAL_ID} .sm-text{font-size:12px;line-height:1.5;margin-bottom:14px;opacity:.9}
#${MODAL_ID} .sm-row{display:flex;gap:10px;justify-content:center}
#${MODAL_ID} button{padding:8px 14px;border-radius:6px;border:2px solid #3dff6a;background:#0d2b16;color:#3dff6a;font:700 12px monospace;cursor:pointer}
#${MODAL_ID} button.sm-ok{background:#3dff6a;color:#001208}
#${MODAL_ID} button:focus-visible{outline:2px solid #fff}`;

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = CSS;
  document.head.appendChild(st);
}

function confirmExit(onOk: () => void): void {
  if (document.getElementById(MODAL_ID)) return;
  const m = document.createElement('div');
  m.id = MODAL_ID;
  m.innerHTML = '<div class="sm-card" role="dialog" aria-modal="true">'
    + '<div class="sm-title">Kembali ke Menu Utama?</div>'
    + '<div class="sm-text">Progres chapter ini tersimpan. Kamu bisa melanjutkannya dari menu lewat tombol “Lanjutkan Story”. Posisi di peta dan progres minigame akan diulang dari awal.</div>'
    + '<div class="sm-row"><button type="button" class="sm-cancel">Batal</button><button type="button" class="sm-ok">Ke Menu</button></div></div>';
  document.body.appendChild(m);
  const close = () => m.remove();
  (m.querySelector('.sm-cancel') as HTMLButtonElement).onclick = close;
  (m.querySelector('.sm-ok') as HTMLButtonElement).onclick = () => { close(); onExitSafe(onOk); };
  m.addEventListener('pointerdown', e => { if (e.target === m) close(); });
  (m.querySelector('.sm-cancel') as HTMLButtonElement).focus();
}
const onExitSafe = (fn: () => void) => fn();

/** Pasang tombol Menu. `onExit` dipanggil setelah pemain mengonfirmasi. Mengembalikan fungsi pelepas. */
export function mountStoryMenuButton(onExit: () => void): () => void {
  injectStyle();
  document.getElementById(BTN_ID)?.remove();
  const b = document.createElement('button');
  b.id = BTN_ID;
  b.type = 'button';
  b.textContent = '☰ Menu';
  b.onclick = () => confirmExit(onExit);
  document.body.appendChild(b);
  return () => { b.remove(); document.getElementById(MODAL_ID)?.remove(); };
}