import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { CHAPTERS } from '../state/Chapters';
import { showChapterTransition } from '../ui/MissionComplete';

/**
 * Menu pilih mode (popup HTML #modeOverlay di index.html).
 *  - Story     -> animasi masuk Chapter 1, lalu scene 'Map' (progres di-reset dari chapter 1)
 *  - Lanjutkan -> (hanya muncul kalau ada Story yang belum tamat) kembali ke chapter terakhir
 *  - Simulasi  -> scene 'Hacking' dgn data { mode: 'sim' } (sandbox gerbang logika tanpa tantangan)
 * Dipanggil dari BootScene, dari HackingScene saat "Kembali ke Menu" di simulasi, dari tombol "☰ Menu" di Story,
 * dan dari MapScene setelah chapter terakhir selesai.
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    const overlay = document.getElementById('modeOverlay')!;
    const state = this.registry.get('state') as GameState;
    state.mode = 'menu';   // refresh saat di menu -> tetap di menu
    state.save();

    // Sembunyikan semua panel game di balik popup.
    for (const id of ['mapView', 'interiorView', 'hackView']) document.getElementById(id)!.style.display = 'none';
    overlay.classList.add('show');

    const close = () => overlay.classList.remove('show');
    let starting = false; // cegah klik ganda selama animasi berjalan
    const storyBtn = document.getElementById('modeStoryBtn') as HTMLButtonElement;

    // ---- Lanjutkan Story (dibuat dari salinan tombol Story supaya gayanya sama; tanpa ubah index.html)
    document.getElementById('modeContinueBtn')?.remove();
    if (state.storyInProgress) {
      const ch = state.chapter;
      const cont = storyBtn.cloneNode(false) as HTMLButtonElement;
      cont.id = 'modeContinueBtn';
      cont.textContent = `▶ Lanjutkan Story (Chapter ${ch.id})`;
      cont.onclick = () => {
        if (starting) return;
        starting = true;
        showChapterTransition(
          { chapterId: ch.id, title: ch.title, tag: 'MELANJUTKAN KASUS' },
          () => {
            close();
            state.mode = 'story';
            state.save();
            this.scene.start('Map');   // briefing yang sudah dibaca tidak diputar ulang
          },
          () => { /* selesai */ }
        );
      };
      storyBtn.parentElement?.insertBefore(cont, storyBtn);
    }

    storyBtn.onclick = () => {
      if (starting) return;
      if (state.storyInProgress && !window.confirm(`Mulai Story baru? Progres Chapter ${state.chapter.id} akan terhapus.`)) return;
      starting = true;
      const first = CHAPTERS[0];
      showChapterTransition(
        { chapterId: first.id, title: first.title, tag: 'KASUS DIMULAI' },
        () => {
          // Layar sudah tertutup: reset progres ke chapter 1, tutup popup, dan mulai peta di balik layar.
          close();
          state.mode = 'story';
          state.storyInProgress = true;
          state.loadChapter(0);   // sekaligus menyimpan progres awal
          this.scene.start('Map'); // MapScene.activateView() menampilkan #mapView sendiri
        },
        () => { /* briefing chapter 1 sudah dimainkan MapScene saat layar terbuka */ }
      );
    };
    (document.getElementById('modeSimBtn') as HTMLButtonElement).onclick = () => {
      if (starting) return;
      close();
      state.mode = 'sim';
      state.save();
      this.scene.start('Hacking', { mode: 'sim' });
    };
  }
}