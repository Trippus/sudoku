// Background music: one recorded track (assets/music/theme.mp3, see LICENSES.md), quietly under the
// sounds. The track starts at full strength and fades out over its last seconds, so near the end a
// second copy starts from the beginning and fades in over the fade-out. It goes through Web Audio,
// since iOS ignores an audio element's own volume.
//
// Needs `Sound.context` from audio.js. Wire it up like this:
//   document.addEventListener('pointerdown', () => { Sound.unlock(); Music.play(); }, { capture: true });
//   document.addEventListener('visibilitychange', () => (document.hidden ? Music.pause() : Music.play()));
//   Music.enabled = settings.music;  // and Music.play() / Music.pause() when the setting changes
import { Sound } from './audio.js';

const TRACK = 'assets/music/theme.mp3';
const VOLUME = 0.3; // the track is loud; this puts it under the sounds
const OVERLAP = 4; // seconds of fade-out at the track's end
let music = null; // { out, decks: [{ el, gain }], at: the deck playing, on }

export const Music = {
  enabled: true,

  get playing() {
    return !!music?.on;
  },

  // From a tap, after Sound.unlock(). Does nothing while it plays.
  play() {
    const ctx = Sound.context;
    if (!this.enabled || !ctx || document.hidden) return;
    try {
      music ??= setUp(ctx);
      if (music.on) return;
      music.on = true;
      ramp(music.out, VOLUME, 2);
      music.decks[music.at].el.play().catch(() => (music.on = false));
    } catch {
      /* no music: the game works fine without it */
    }
  },

  pause() {
    if (!music?.on) return;
    music.on = false;
    ramp(music.out, 0, 0.5);
    setTimeout(() => !music.on && music.decks.forEach((d) => d.el.pause()), 550);
  },
};

function setUp(ctx) {
  const out = ctx.createGain();
  out.gain.value = 0;
  out.connect(ctx.destination);
  const decks = [0, 1].map(() => {
    const el = new Audio(TRACK);
    el.preload = 'auto';
    const gain = ctx.createGain();
    ctx.createMediaElementSource(el).connect(gain).connect(out);
    el.addEventListener('timeupdate', () => nearEnd(el));
    return { el, gain };
  });
  return { out, decks, at: 0, on: false };
}

// The playing copy is in its fade-out: the other one starts over and fades in.
function nearEnd(el) {
  if (!music.on || el !== music.decks[music.at].el || !(el.duration - el.currentTime < OVERLAP)) return;
  music.at = 1 - music.at;
  const next = music.decks[music.at];
  ramp(next.gain, 1, OVERLAP - 1, 0);
  next.el.currentTime = 0;
  next.el.play().catch(() => {});
}

function ramp(node, to, secs, from = node.gain.value) {
  const ctx = Sound.context;
  const g = node.gain;
  g.cancelScheduledValues(ctx.currentTime);
  g.setValueAtTime(from, ctx.currentTime);
  g.linearRampToValueAtTime(to, ctx.currentTime + secs);
}
