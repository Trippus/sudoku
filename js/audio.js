// All sounds are synthesized with Web Audio — no audio files to download.
let ctx = null;
let master = null;
let noise = null;

const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19];

export const Sound = {
  enabled: true,

  // iOS only allows audio to start from inside a user gesture.
  unlock() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.8;
        master.connect(ctx.destination);
        const len = Math.floor(ctx.sampleRate * 0.4);
        noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
    } catch {
      /* no audio — the game works fine without it */
    }
  },

  play(name, opt = {}) {
    if (!this.enabled || !ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + (opt.delay || 0);
    const vol = opt.vol ?? 1;
    switch (name) {
      case 'tap':
        burst(t, 2600, 1.2, 0.03, 0.12 * vol);
        break;
      case 'place': {
        // a soft wooden "tock", pitched a little by the digit
        const f = 330 * 2 ** (PENTATONIC[(opt.digit || 1) - 1] / 24);
        burst(t, 1100, 0.8, 0.05, 0.3 * vol);
        tone(t, f, 0.12, 0.14 * vol, 'sine', f * 0.8);
        break;
      }
      case 'note':
        tone(t, 1400, 0.05, 0.05 * vol, 'sine');
        break;
      case 'erase':
        burst(t, 700, 0.7, 0.08, 0.25 * vol);
        break;
      case 'unit':
        [0, 4, 7].forEach((s, i) => tone(t + i * 0.07, 659.25 * 2 ** (s / 12), 0.35, 0.08 * vol, 'sine'));
        break;
      case 'hint':
        tone(t, 880, 0.25, 0.08 * vol, 'triangle');
        tone(t + 0.08, 1318.5, 0.3, 0.06 * vol, 'triangle');
        break;
      case 'error':
        tone(t, 220, 0.14, 0.22 * vol, 'sine', 120);
        break;
      case 'win':
        [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone(t + i * 0.09, 523.25 * 2 ** (s / 12), 0.6, 0.12 * vol, 'triangle'));
        break;
    }
  },
};

function burst(t, freq, q, dur, gain) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.3, dur + 0.02);
}

function tone(t, freq, dur, gain, type, endFreq) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}
