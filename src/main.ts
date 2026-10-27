import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MapScene } from './scenes/MapScene';
import { InteriorScene } from './scenes/InteriorScene';
import { GameState } from './state/GameState';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 480,
  height: 320,
  parent: 'mapCanvasSlot',
  backgroundColor: '#0a0e1a',
  pixelArt: true,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, MapScene, InteriorScene]
});

// State global dipasang di registry supaya semua Scene bisa mengaksesnya.
game.registry.set('state', new GameState());
