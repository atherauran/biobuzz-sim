import { Game } from './game/game.js';

const loading = document.getElementById('loading');
try {
  const game = new Game(document.getElementById('stage'));
  window.__sim = game;            // handy for debugging from the console
  loading.remove();
} catch (err) {
  console.error(err);
  loading.textContent = 'The simulator failed to start: ' + err.message;
  loading.style.fontSize = '18px';
}
