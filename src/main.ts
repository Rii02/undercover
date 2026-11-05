import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { MapScene } from './scenes/MapScene';
import { InteriorScene } from './scenes/InteriorScene';
import { HackingScene } from './scenes/HackingScene';
import { GameState } from './state/GameState';
import { mountFullscreenButton } from './ui/FullscreenButton';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 360,
  height: 300,
  parent: 'mapCanvasSlot',
  backgroundColor: '#0a0e1a',
  pixelArt: true,
  // Ukuran game di-resize manual per Scene (this.scale.resize) dan canvas dipindah
  // antar panel (map/interior), jadi scale mode dibiarkan NONE — CSS (max-width:100%)
  // yang menangani responsivitasnya, sama seperti canvas asli.
  scale: { mode: Phaser.Scale.NONE },
  scene: [BootScene, MenuScene, MapScene, InteriorScene, HackingScene]
});

// State global dipasang di registry supaya semua Scene bisa mengaksesnya
// tanpa saling import (registry.get('state') di masing-masing Scene).
game.registry.set('state', new GameState());

// Tombol layar penuh (pojok kanan atas, tersedia di menu, Story, dan Simulasi).
mountFullscreenButton();