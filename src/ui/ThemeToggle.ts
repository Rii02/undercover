/**
 * Tombol mode terang / gelap (pojok kiri bawah, tersedia di semua layar: menu, Story, Simulasi).
 *
 * - Warna game diatur lewat variabel CSS di index.html; tema dipilih lewat atribut <html data-theme="light|dark">.
 * - Atribut itu sudah dipasang lebih awal oleh skrip kecil di <head> (tema tersimpan, atau preferensi sistem kalau
 *   belum pernah memilih) supaya tidak ada kilatan warna. Modul ini hanya menyediakan tombol & menyimpan pilihan.
 * - Pilihan disimpan di localStorage. Selama pemain belum memilih sendiri, tema mengikuti perubahan pengaturan sistem.
 * - Terminal hacking sengaja tetap gelap di kedua tema (lihat komentar di index.html).
 */
export type Theme = 'light' | 'dark';

/** Harus sama dengan kunci di skrip <head> index.html. */
const THEME_KEY = 'undercover-theme';
const BTN_ID = 'themeBtn';
const STYLE_ID = 'themeStyle';

const CSS = `
#${BTN_ID}{position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:1100;width:44px;height:44px;padding:0;
  border-radius:10px;border:2px solid var(--accent);background:var(--panel);color:var(--text);font-size:20px;line-height:1;cursor:pointer;
  box-shadow:0 2px 8px var(--shadow-lg)}
/* Tombol layar penuh ada di pojok yang sama (kalau didukung browser): tumpuk di atasnya. */
#${BTN_ID}.stacked{bottom:calc(12px + 44px + 8px + env(safe-area-inset-bottom,0px))}
#${BTN_ID}:hover,#${BTN_ID}:focus-visible{background:var(--accent);outline:none}
/* Jendela file manager (bukti) menutup layar & punya tombol di pojok bawah: sembunyikan tombol tema selama terbuka. */
body:has(#fmOverlay.show) #${BTN_ID}{display:none}`;

const root = document.documentElement;
const media = window.matchMedia('(prefers-color-scheme: light)');

function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch { return null; }
}

/** Tema yang sedang aktif. */
export function currentTheme(): Theme {
  return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function applyTheme(theme: Theme): void {
  root.setAttribute('data-theme', theme);
  // Warna bilah browser di HP ikut latar tema.
  const meta = document.querySelector('meta[name="theme-color"]');
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (meta && bg) meta.setAttribute('content', bg);
}

/** Pasang tombol ganti tema (panggil sekali, setelah mountFullscreenButton supaya posisinya bisa menyesuaikan). */
export function mountThemeToggle(): void {
  if (document.getElementById(BTN_ID)) return;
  if (!document.getElementById(STYLE_ID)) {
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  applyTheme(currentTheme());   // sinkronkan <meta theme-color> dengan tema awal

  const b = document.createElement('button');
  b.id = BTN_ID;
  b.type = 'button';
  if (document.getElementById('fullscreenBtn')) b.classList.add('stacked');

  const refresh = () => {
    const dark = currentTheme() === 'dark';
    b.textContent = dark ? '☀️' : '🌙';
    const label = dark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap';
    b.setAttribute('aria-label', label);
    b.title = label;
  };

  b.onclick = () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* penyimpanan diblokir: tema tetap berganti utk sesi ini */ }
    refresh();
    b.blur();   // supaya Spasi/Enter di game tidak menekan tombol ini lagi
  };

  // Belum pernah memilih sendiri -> ikuti perubahan tema sistem.
  media.addEventListener('change', e => {
    if (storedTheme()) return;
    applyTheme(e.matches ? 'light' : 'dark');
    refresh();
  });

  refresh();
  document.body.appendChild(b);
}
