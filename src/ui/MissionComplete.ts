/**
 * Dua layar overlay (dibuat lewat kode, tanpa mengubah index.html):
 *  - showMissionComplete()   : "MISSION COMPLETE" — HANYA dipakai di chapter terakhir.
 *  - showChapterTransition() : transisi masuk chapter (awal Story = chapter 1, dan pindah peta chapter 1..N-1):
 *                              layar menutup -> peta diganti -> layar membuka.
 *
 * Animasi Mission Complete, setelah pemain menutup laporan ke Bos.
 * Seluruh elemen & CSS dibuat lewat kode (tidak perlu mengubah index.html).
 *
 * Urutan animasi: layar menggelap + kilat -> sinar berputar -> centang tergambar -> huruf judul muncul satu per satu
 * -> garis menyapu -> subjudul + bintang -> konfeti naik -> tombol lanjut muncul.
 * Pengguna dengan "prefers-reduced-motion" langsung melihat keadaan akhir tanpa gerakan.
 */

export interface MissionCompleteOptions {
  chapterId: number;
  chapterTitle: string;
}

export interface ChapterTransitionOptions {
  /** Chapter tujuan. */
  chapterId: number;
  title: string;
  /** Teks kecil di atas nomor chapter. Default: "MENUJU LOKASI BERIKUTNYA". */
  tag?: string;
}

const STYLE_ID = 'missionCompleteStyle';
const TITLE = ['MISSION', 'COMPLETE'];
const SPARK_COLORS = ['#3dff6a', '#f5a623', '#00d9a3', '#ffe066', '#ffffff'];

const CSS = `
.mc-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
  background:radial-gradient(ellipse at center,rgba(8,20,16,.94) 0%,rgba(2,6,10,.98) 70%);
  font-family:monospace;color:#eef2f7;overflow:hidden;animation:mc-fade-in .45s ease-out both}
.mc-overlay.mc-out{animation:mc-fade-out .35s ease-in both}
.mc-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;animation:mc-flash .7s ease-out .1s both}
.mc-rays{position:absolute;width:150vmax;height:150vmax;left:50%;top:50%;margin:-75vmax 0 0 -75vmax;pointer-events:none;
  background:repeating-conic-gradient(from 0deg,rgba(61,255,106,.10) 0deg 8deg,rgba(0,0,0,0) 8deg 24deg);
  -webkit-mask-image:radial-gradient(circle,#000 0%,transparent 55%);mask-image:radial-gradient(circle,#000 0%,transparent 55%);
  opacity:0;animation:mc-rays-in 1s ease-out .3s both,mc-spin 40s linear infinite}
.mc-card{position:relative;display:flex;flex-direction:column;align-items:center;gap:14px;padding:24px;text-align:center;max-width:92vw}
.mc-badge{width:84px;height:84px;border-radius:50%;border:3px solid #3dff6a;display:flex;align-items:center;justify-content:center;
  background:rgba(13,43,22,.9);box-shadow:0 0 0 0 rgba(61,255,106,.6);
  transform:scale(0);animation:mc-pop .6s cubic-bezier(.2,1.6,.4,1) .35s both,mc-pulse 2s ease-out 1.2s infinite}
.mc-badge svg{width:46px;height:46px}
.mc-badge path{fill:none;stroke:#3dff6a;stroke-width:6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:60;stroke-dashoffset:60;
  animation:mc-draw .5s ease-out .85s forwards}
.mc-title{display:flex;flex-direction:column;gap:2px;font-weight:900;line-height:1.05}
.mc-word{display:flex;justify-content:center;font-size:clamp(28px,9vw,54px);letter-spacing:.08em}
.mc-word:nth-child(2){color:#00d9a3}
.mc-word:nth-child(1){color:#3dff6a}
.mc-letter{display:inline-block;opacity:0;transform:translateY(24px) scale(.4) rotate(-8deg);
  text-shadow:0 0 12px currentColor,0 0 30px currentColor;animation:mc-letter .5s cubic-bezier(.2,1.5,.4,1) both}
.mc-line{height:3px;width:0;border-radius:2px;background:linear-gradient(90deg,transparent,#f5a623,transparent);
  animation:mc-line .8s ease-out 1.9s forwards}
.mc-sub{font-size:13px;color:#f5a623;letter-spacing:.06em;opacity:0;animation:mc-up .5s ease-out 2.1s forwards}
.mc-stars{display:flex;gap:10px;font-size:26px}
.mc-stars span{opacity:0;transform:scale(0) rotate(-90deg);animation:mc-star .5s cubic-bezier(.2,1.6,.4,1) both}
.mc-btn{margin-top:6px;padding:11px 22px;border-radius:8px;border:2px solid #3dff6a;background:#0d2b16;color:#3dff6a;
  font:700 14px monospace;cursor:pointer;opacity:0;transform:translateY(10px);animation:mc-up .5s ease-out 2.7s forwards}
.mc-btn:hover,.mc-btn:focus-visible{background:#3dff6a;color:#001208;outline:none}
.mc-spark{position:absolute;bottom:-12px;width:8px;height:12px;opacity:0;pointer-events:none;border-radius:2px;
  animation:mc-rise var(--d) ease-out var(--t) infinite}
@keyframes mc-fade-in{from{opacity:0}to{opacity:1}}
@keyframes mc-fade-out{from{opacity:1}to{opacity:0}}
@keyframes mc-flash{0%{opacity:.85}100%{opacity:0}}
@keyframes mc-rays-in{from{opacity:0;transform:scale(.4)}to{opacity:1;transform:scale(1)}}
@keyframes mc-spin{to{transform:rotate(360deg)}}
@keyframes mc-pop{from{transform:scale(0)}to{transform:scale(1)}}
@keyframes mc-pulse{0%{box-shadow:0 0 0 0 rgba(61,255,106,.55)}100%{box-shadow:0 0 0 26px rgba(61,255,106,0)}}
@keyframes mc-draw{to{stroke-dashoffset:0}}
@keyframes mc-letter{to{opacity:1;transform:none}}
@keyframes mc-line{to{width:min(320px,70vw)}}
@keyframes mc-up{to{opacity:1;transform:none}}
@keyframes mc-star{to{opacity:1;transform:none}}
@keyframes mc-rise{0%{opacity:0;transform:translateY(0) rotate(0)}10%{opacity:1}100%{opacity:0;transform:translateY(-105vh) rotate(var(--r))}}
/* ---- transisi pindah chapter ---- */
.ct-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:#02060a;
  font-family:monospace;color:#eef2f7;opacity:0;animation:ct-in .5s ease-in forwards}
.ct-overlay.ct-out{animation:ct-out .6s ease-out forwards}
.ct-scan{position:absolute;left:0;right:0;height:2px;top:0;background:linear-gradient(90deg,transparent,#3dff6a,transparent);opacity:.5;
  animation:ct-scan 1.8s linear .4s infinite}
.ct-card{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:20px}
.ct-tag{font-size:12px;letter-spacing:.3em;color:#f5a623;opacity:0;animation:ct-up .5s ease-out .6s forwards}
.ct-num{font-size:clamp(34px,11vw,64px);font-weight:900;letter-spacing:.12em;color:#3dff6a;text-shadow:0 0 14px #3dff6a,0 0 34px #3dff6a;
  opacity:0;transform:scale(1.5);animation:ct-num .6s cubic-bezier(.2,1.2,.4,1) .8s forwards}
.ct-line{height:3px;width:0;background:linear-gradient(90deg,transparent,#00d9a3,transparent);animation:ct-line .7s ease-out 1.1s forwards}
.ct-title{font-size:clamp(14px,4vw,20px);color:#eef2f7;letter-spacing:.08em;opacity:0;animation:ct-up .5s ease-out 1.3s forwards}
.ct-dots{font-size:12px;color:#7a8a99;opacity:0;animation:ct-up .4s ease-out 1.5s forwards}
.ct-dots i{font-style:normal;animation:ct-blink 1s steps(1) infinite}
.ct-dots i:nth-child(2){animation-delay:.2s}.ct-dots i:nth-child(3){animation-delay:.4s}
@keyframes ct-in{to{opacity:1}}
@keyframes ct-out{from{opacity:1}to{opacity:0}}
@keyframes ct-scan{from{top:0}to{top:100%}}
@keyframes ct-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes ct-num{to{opacity:1;transform:none}}
@keyframes ct-line{to{width:min(260px,60vw)}}
@keyframes ct-blink{0%{opacity:.2}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){
  .ct-overlay,.ct-overlay.ct-out,.ct-scan,.ct-tag,.ct-num,.ct-line,.ct-title,.ct-dots,.ct-dots i{animation:none!important}
  .ct-overlay{opacity:1}.ct-overlay.ct-out{opacity:0}.ct-scan{display:none}
  .ct-tag,.ct-num,.ct-title,.ct-dots{opacity:1;transform:none}.ct-line{width:min(260px,60vw)}
}
@media (prefers-reduced-motion:reduce){
  .mc-overlay,.mc-flash,.mc-rays,.mc-badge,.mc-badge path,.mc-letter,.mc-line,.mc-sub,.mc-stars span,.mc-btn,.mc-spark{animation:none!important}
  .mc-flash,.mc-spark{display:none}
  .mc-rays{opacity:1}.mc-badge{transform:none}.mc-badge path{stroke-dashoffset:0}
  .mc-letter,.mc-sub,.mc-stars span,.mc-btn{opacity:1;transform:none}.mc-line{width:min(320px,70vw)}
}`;

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = CSS;
  document.head.appendChild(st);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Layar Mission Complete (chapter terakhir). `onContinue` dipanggil setelah pemain menekan tombol (overlay sudah hilang). */
export function showMissionComplete(opts: MissionCompleteOptions, onContinue: () => void): void {
  injectStyle();
  document.getElementById('missionCompleteOverlay')?.remove();

  const overlay = el('div', 'mc-overlay');
  overlay.id = 'missionCompleteOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Mission Complete');

  overlay.appendChild(el('div', 'mc-rays'));

  // Konfeti
  for (let i = 0; i < 28; i++) {
    const s = el('span', 'mc-spark');
    s.style.left = Math.random() * 100 + '%';
    s.style.background = SPARK_COLORS[i % SPARK_COLORS.length];
    s.style.setProperty('--d', (2.4 + Math.random() * 2.2).toFixed(2) + 's');
    s.style.setProperty('--t', (0.6 + Math.random() * 3).toFixed(2) + 's');
    s.style.setProperty('--r', Math.round(-360 + Math.random() * 720) + 'deg');
    overlay.appendChild(s);
  }

  const card = el('div', 'mc-card');

  const badge = el('div', 'mc-badge');
  badge.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 25 L21 36 L39 14"/></svg>';
  card.appendChild(badge);

  const title = el('div', 'mc-title');
  let n = 0;
  for (const word of TITLE) {
    const w = el('div', 'mc-word');
    for (const ch of word) {
      const l = el('span', 'mc-letter', ch);
      l.style.animationDelay = (0.9 + n * 0.06).toFixed(2) + 's';
      w.appendChild(l);
      n++;
    }
    title.appendChild(w);
  }
  card.appendChild(title);

  card.appendChild(el('div', 'mc-line'));
  card.appendChild(el('div', 'mc-sub', `Chapter ${opts.chapterId} — ${opts.chapterTitle}`));

  const stars = el('div', 'mc-stars');
  for (let i = 0; i < 3; i++) {
    const s = el('span', '', '⭐');
    s.style.animationDelay = (2.3 + i * 0.15).toFixed(2) + 's';
    stars.appendChild(s);
  }
  card.appendChild(stars);

  const btn = el('button', 'mc-btn', '🏆 Selesai');
  btn.type = 'button';
  btn.style.pointerEvents = 'none'; // aktif setelah animasi tombol muncul
  card.appendChild(btn);

  overlay.appendChild(card);
  overlay.appendChild(el('div', 'mc-flash'));
  document.body.appendChild(overlay);

  let done = false;
  btn.onclick = () => {
    if (done) return;
    done = true;
    overlay.classList.add('mc-out');
    window.setTimeout(() => { overlay.remove(); onContinue(); }, 350);
  };
  // Tombol baru muncul setelah animasi; fokuskan agar Enter/Spasi langsung bisa dipakai.
  window.setTimeout(() => { btn.style.pointerEvents = ''; btn.focus({ preventScroll: true }); }, 2800);
}

/**
 * Transisi pindah chapter/peta (chapter 1..N-1):
 *  layar menutup (hitam) -> tampil "CHAPTER n" + judul -> `onCovered` (ganti peta di balik layar) -> layar membuka -> `onDone`.
 */
export function showChapterTransition(opts: ChapterTransitionOptions, onCovered: () => void, onDone: () => void): void {
  injectStyle();
  document.getElementById('chapterTransitionOverlay')?.remove();

  const overlay = el('div', 'ct-overlay');
  overlay.id = 'chapterTransitionOverlay';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.appendChild(el('div', 'ct-scan'));

  const card = el('div', 'ct-card');
  card.appendChild(el('div', 'ct-tag', opts.tag ?? 'MENUJU LOKASI BERIKUTNYA'));
  card.appendChild(el('div', 'ct-num', `CHAPTER ${opts.chapterId}`));
  card.appendChild(el('div', 'ct-line'));
  card.appendChild(el('div', 'ct-title', opts.title));
  const dots = el('div', 'ct-dots');
  dots.innerHTML = '<i>●</i> <i>●</i> <i>●</i>';
  card.appendChild(dots);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  // Layar sudah penuh hitam setelah ~0.5s; peta diganti saat judul sudah terbaca.
  window.setTimeout(() => {
    onCovered();
    window.setTimeout(() => {
      overlay.classList.add('ct-out');
      window.setTimeout(() => { overlay.remove(); onDone(); }, 600);
    }, 500);
  }, 2000);
}