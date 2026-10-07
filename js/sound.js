// SILO — sound effects and music, all made in the browser (no audio files).
// The whole soundtrack is rendered once into one buffer when the page loads. Playback then follows the film's
// timeline: the film says "we are at second T" and the buffer is started (or re-started) at T. So pause, skip,
// the seek bar and replay always stay in sync. Every sound is placed against the beats in story.js.
window.SND = (function () {
  'use strict';
  const AC = window.AudioContext || window.webkitAudioContext;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  let ctx = null, out = null, buf = null, src = null, on = true, playing = false, t0 = 0, off0 = 0;
  const api = { state: 'idle', info: null };

  function build(S) {
    if (!OAC) { api.state = 'unsupported'; return; }
    api.state = 'building';
    const BE = S.beats, B = [], ID = {}; let acc = 0;
    BE.forEach((b, i) => { B.push(acc); ID[b.id] = i; acc += b.d; });
    const END = acc, TOTAL = acc + S.endCard + S.brandCard, SR = 44100;
    const at = (id, u) => B[ID[id]] + (u || 0) * BE[ID[id]].d;
    const oc = new OAC(2, Math.ceil(SR * (TOTAL + 0.2)), SR);

    let seed = 7; const rr = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

    // ---- buses ----
    const master = oc.createGain(); master.gain.value = 0.85;
    const comp = oc.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.22;
    master.connect(comp); comp.connect(oc.destination);
    const rev = oc.createConvolver();
    (function () { const len = Math.floor(SR * 3.0), ib = oc.createBuffer(2, len, SR); for (let c = 0; c < 2; c++) { const d = ib.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (rr() * 2 - 1) * Math.pow(1 - i / len, 2.6); } rev.buffer = ib; })();
    const revG = oc.createGain(); revG.gain.value = 0.42; rev.connect(revG); revG.connect(master);
    const nb = oc.createBuffer(1, SR * 3, SR); (function () { const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rr() * 2 - 1; })();

    function bus(send, pan) {
      const g = oc.createGain(); let n = g;
      if (pan && oc.createStereoPanner) { const p = oc.createStereoPanner(); p.pan.value = pan; g.connect(p); n = p; }
      n.connect(master);
      if (send) { const s = oc.createGain(); s.gain.value = send; n.connect(s); s.connect(rev); }
      return g;
    }
    // one note: attack, optional hold, exponential decay
    function tone(t, f, o) {
      o = o || {}; if (t < 0) return;
      const a = o.a || 0.005, hold = o.hold || 0, dec = o.dec || 0.3, v = o.v || 0.2;
      const os = oc.createOscillator(); os.type = o.type || 'sine'; os.frequency.setValueAtTime(f, t);
      if (o.f1) os.frequency.exponentialRampToValueAtTime(o.f1, t + (o.ft || (a + hold + dec)));
      if (o.det) os.detune.value = o.det;
      const g = oc.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a);
      if (hold) g.gain.setValueAtTime(v, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + dec);
      let n = os; if (o.lp) { const fl = oc.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; fl.Q.value = o.q || 0.7; os.connect(fl); n = fl; }
      n.connect(g); g.connect(bus(o.send || 0, o.pan || 0)); os.start(t); os.stop(t + a + hold + dec + 0.05);
    }
    // filtered noise: attack, hold, release; the filter can sweep from f to f1
    function noise(t, d, o) {
      o = o || {}; if (t < 0) return;
      const v = o.v || 0.2, a = Math.min(o.a || 0.005, d * 0.9), r = Math.min(o.r || d * 0.6, d - a);
      const s = oc.createBufferSource(); s.buffer = nb; s.loop = true;
      const fl = oc.createBiquadFilter(); fl.type = o.type || 'bandpass'; fl.frequency.setValueAtTime(o.f || 1000, t);
      if (o.f1) fl.frequency.exponentialRampToValueAtTime(o.f1, t + d); fl.Q.value = o.q || 1;
      const g = oc.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a);
      g.gain.setValueAtTime(v, t + d - r); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      s.connect(fl); fl.connect(g); g.connect(bus(o.send || 0, o.pan || 0)); s.start(t, rr() * 2); s.stop(t + d + 0.05);
    }
    // a held layer (drone, pad): oscillators through a low-pass, gain drawn as points [[time, volume], ...]
    function layer(freqs, type, lp, pts, send, det) {
      const g = oc.createGain(); g.gain.setValueAtTime(0.0001, 0);
      pts.forEach(p => g.gain.linearRampToValueAtTime(Math.max(0.0001, p[1]), Math.max(0.001, p[0])));
      const fl = oc.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; fl.Q.value = 0.6; fl.connect(g); g.connect(bus(send || 0, 0));
      const lfo = oc.createOscillator(); lfo.frequency.value = 0.13 + rr() * 0.1; const lg = oc.createGain(); lg.gain.value = lp * 0.25; lfo.connect(lg); lg.connect(fl.frequency);
      const t1 = pts[pts.length - 1][0] + 0.1, tS = Math.max(0, pts[0][0] - 0.05); lfo.start(tS); lfo.stop(t1);
      freqs.forEach((f, i) => [-(det || 6), det || 6].forEach(dc => { const os = oc.createOscillator(); os.type = type; os.frequency.value = f; os.detune.value = dc + i * 2; os.connect(fl); os.start(tS); os.stop(t1); }));
    }

    // ---- instruments ----
    const bell = (t, f, v, d) => { tone(t, f, { v: v, dec: d || 2.6, send: 0.7 }); tone(t, f * 2, { v: v * 0.28, dec: (d || 2.6) * 0.6, send: 0.6 }); tone(t, f * 3.01, { v: v * 0.09, dec: 0.8, send: 0.5 }); };
    const pluck = (t, f, v) => tone(t, f, { type: 'sawtooth', lp: 520, q: 2, v: v, dec: 0.2, send: 0.15 });
    const thump = (t, v) => { tone(t, 62, { f1: 38, v: v, dec: 0.16 }); tone(t + 0.19, 54, { f1: 36, v: v * 0.7, dec: 0.2 }); };
    const step = (t, v, metal, pan) => { noise(t, 0.07, { f: metal ? 1900 : 420, q: metal ? 3 : 0.8, v: v, pan: pan, send: metal ? 0.3 : 0.05 }); tone(t, metal ? 150 : 95, { f1: 55, v: v * 0.9, dec: 0.09, pan: pan }); if (metal) tone(t, 760 + rr() * 500, { v: v * 0.25, dec: 0.25, send: 0.5, pan: pan }); };
    const clang = (t, v, f0) => { [1, 2.76, 5.4, 8.93].forEach((m, i) => tone(t, (f0 || 150) * m, { v: v / (i + 1), dec: 1.3 - i * 0.22, send: 0.6 })); noise(t, 0.12, { f: 900, q: 0.6, v: v * 0.9, send: 0.4 }); };
    const hiss = (t, d, v, pan) => noise(t, d, { type: 'highpass', f: 3800, v: v, a: 0.04, r: d * 0.8, pan: pan, send: 0.2 });
    const whoosh = (t, d, v, f, f1) => noise(t, d, { f: f || 250, f1: f1 || 2600, q: 0.9, v: v, a: d * 0.5, r: d * 0.5, send: 0.3 });
    const boom = (t, v) => { tone(t, 82, { f1: 27, ft: 1.6, v: v, a: 0.004, dec: 3.2, send: 0.3 }); noise(t, 2.2, { type: 'lowpass', f: 900, f1: 90, v: v * 0.55, a: 0.004, r: 2.1, send: 0.5 }); noise(t, 1.4, { type: 'highpass', f: 5200, v: v * 0.12, a: 0.004, r: 1.35, send: 0.6 }); };
    const chirp = (t, v, pan) => { const f = 2500 + rr() * 1500, n = 2 + Math.floor(rr() * 3); for (let k = 0; k < n; k++) tone(t + k * 0.085, f, { f1: f * (k % 2 ? 0.78 : 1.32), v: v, a: 0.006, dec: 0.065, pan: pan, send: 0.25 }); };
    const breath = (t, d, v) => { noise(t, d * 0.45, { f: 620, q: 0.7, v: v, a: d * 0.3, r: d * 0.14 }); noise(t + d * 0.5, d * 0.5, { f: 420, q: 0.7, v: v * 0.8, a: d * 0.12, r: d * 0.36 }); };
    const glitch = (t, d, v) => { for (let x = 0; x < d; x += 0.028) { if (rr() < 0.72) noise(t + x, 0.022, { type: 'highpass', f: 1500 + rr() * 5000, v: v * (0.5 + rr() * 0.5), pan: rr() * 1.4 - 0.7 }); if (rr() < 0.5) tone(t + x, 90 * Math.pow(2, Math.floor(rr() * 5)), { type: 'square', lp: 3500, v: v * 0.5, a: 0.002, dec: 0.02 }); } };
    const klaxon = (t, d, v) => { for (let x = 0, k = 0; x < d; x += 0.3, k++) tone(t + x, k % 2 ? 392 : 494, { type: 'square', lp: 1700, v: v, a: 0.02, hold: 0.2, dec: 0.07, send: 0.35 }); };
    const hum = (t, d, v, f) => { [1, 2, 3].forEach(m => tone(t, (f || 60) * m, { v: v / m, a: 0.3, hold: d - 0.6, dec: 0.3 })); };
    const wind = (t, d, v, f) => { noise(t, d, { f: f || 420, f1: (f || 420) * 1.7, q: 1.6, v: v, a: d * 0.35, r: d * 0.4, send: 0.3 }); noise(t + d * 0.2, d * 0.8, { f: (f || 420) * 2.2, f1: (f || 420) * 1.3, q: 2.2, v: v * 0.5, a: d * 0.3, r: d * 0.4, pan: 0.4 }); };

    // ---- music ----
    const D1 = 36.71, D2 = 73.42, tTruth = at('ridge', BE[ID.ridge].truth || 0.56), tApp = at('airlock2', 0);
    layer([D1, D2], 'sawtooth', 210, [[0, 0], [1.3, 0.2], [at('tape', 0), 0.2], [tApp + 1, 0.13], [tTruth - 0.22, 0.2], [tTruth - 0.12, 0], [tTruth, 0], [tTruth + 0.05, 0.3], [END, 0.26], [END + 2.2, 0.1], [TOTAL - 0.5, 0]], 0.2, 7);
    // chords: D minor - B flat - G minor - a tense A - then a wide open D minor at the truth
    const pad = (fs, a, b, v) => layer(fs, 'triangle', 950, [[a - 0.05, 0], [a + 0.7, v], [b - 0.1, v], [b + 0.6, 0]], 0.6, 5);
    pad([146.83, 174.61, 220.0], at('cafe', 0), at('gen', 0), 0.07);
    pad([116.54, 146.83, 174.61], at('gen', 0), at('server', 0), 0.075);
    pad([98.0, 116.54, 146.83], at('server', 0), tApp, 0.085);
    pad([110.0, 164.81, 233.08], tApp, tTruth - 0.25, 0.08);
    layer([146.83, 220.0, 293.66, 349.23, 440.0], 'triangle', 1500, [[tTruth, 0], [tTruth + 0.08, 0.1], [END - 0.5, 0.095], [END + 1.8, 0.03], [TOTAL - 0.6, 0]], 0.7, 5);
    // the small bell theme
    [[0.45, 587.33], [1.3, 440.0], [2.15, 349.23]].forEach(n => bell(n[0], n[1], 0.13));
    bell(at('cafe', 0.15), 293.66, 0.1); bell(at('cafe', 0.55), 329.63, 0.09);
    [[0.42, 349.23], [0.62, 329.63], [0.82, 293.66]].forEach(n => bell(at('fall', n[0]), n[1], 0.12));
    [[0.5, 293.66], [1.1, 440.0], [1.7, 587.33], [2.3, 698.46], [3.1, 880.0], [4.0, 587.33], [4.9, 698.46], [5.8, 440.0]].forEach(n => { if (tTruth + n[0] < END + 0.4) bell(tTruth + n[0], n[1], 0.12, 3.2); });
    bell(END + 0.35, 293.66, 0.1, 3.5); bell(END + 0.35, 440.0, 0.06, 3.5);
    // the pulse: slow under the machines, double time in the chase, a heartbeat from the airlock to the ridge
    for (let t = at('gen', 0), k = 0; t < at('server', 0); t += 0.5, k++) pluck(t, k % 4 === 3 ? 87.31 : D2, 0.13);
    for (let t = at('server', 0), k = 0; t < at('tape', 0); t += 0.25, k++) pluck(t, [D2, D2, 87.31, D2, 98.0, D2, 87.31, 110.0][k % 8], t < at('chase', 0) ? 0.12 : 0.19);
    for (let t = tApp + 0.1, gap = 0.78; t < tTruth - 0.4; t += gap, gap = Math.max(0.46, gap * 0.955)) thump(t, 0.34);
    // the rise into the truth, a breath of silence, then the hit
    const tRise = at('climb', 0.35);
    noise(tRise, tTruth - 0.14 - tRise, { f: 220, f1: 5200, q: 1.2, v: 0.17, a: (tTruth - tRise) * 0.9, r: 0.05, send: 0.4 });
    tone(tRise, 55, { type: 'sawtooth', f1: 220, lp: 1400, v: 0.07, a: (tTruth - tRise) * 0.85, dec: 0.08 });
    boom(tTruth, 0.75); clang(tTruth, 0.12, 73.42);

    // ---- sound effects, beat by beat ----
    let t;
    // the shaft
    t = at('shaft', 0); whoosh(t, 3.2, 0.13, 180, 900); noise(t, 3.4, { type: 'lowpass', f: 160, v: 0.2, a: 0.6, r: 1 }); clang(t + 1.1, 0.07, 210); clang(t + 2.5, 0.05, 130);
    // the levels: steps on metal, voices
    t = at('levels', 0); for (let k = 0; k < 9; k++) step(t + 0.1 + k * 0.29 + rr() * 0.05, 0.07 + rr() * 0.05, true, rr() * 1.2 - 0.6);
    noise(t, 2.8, { f: 520, q: 1.4, v: 0.06, a: 0.5, r: 0.8, send: 0.6 }); noise(t + 0.3, 2.3, { f: 900, q: 2, v: 0.035, a: 0.6, r: 0.8, send: 0.6, pan: -0.5 });
    // the cafeteria screen
    t = at('cafe', 0); hum(t, 2.8, 0.05, 60); noise(t, 2.8, { type: 'highpass', f: 6500, v: 0.018, a: 0.3, r: 0.5 }); wind(t + 0.2, 2.5, 0.05, 300);
    // the sheriff in the airlock
    t = at('airlock1', 0); for (let k = 0; k < 5; k++) step(t + 0.15 + k * 0.5, 0.15, true, 0); hiss(at('airlock1', 0.45), 1.3, 0.14, -0.4); hiss(at('airlock1', 0.55), 1.1, 0.12, 0.4); clang(at('airlock1', 0.78), 0.2, 95); tone(at('airlock1', 0.8), 320, { f1: 760, v: 0.035, a: 0.1, dec: 0.5, send: 0.4 });
    // what he sees: birds, breath, and the wool on the lens
    t = at('clean', 0); for (let k = 0; k < 11; k++) chirp(t + 0.1 + rr() * 2.7, 0.045, rr() * 1.6 - 0.8); wind(t, 3.0, 0.035, 700); breath(t + 0.1, 1.3, 0.07); breath(t + 1.6, 1.3, 0.07);
    for (let k = 0; k < 6; k++) noise(at('clean', 0.14 + k * 0.125), 0.2, { f: 2600, f1: 1500, q: 1.3, v: 0.085, a: 0.05, r: 0.12 });
    // the truth on the screen: wind, and he falls
    t = at('fall', 0); wind(t, 2.8, 0.1, 260); hum(t, 2.8, 0.035, 60); tone(at('fall', 0.74), 70, { f1: 36, v: 0.4, dec: 0.4 }); noise(at('fall', 0.74), 0.25, { type: 'lowpass', f: 300, v: 0.2, r: 0.2 });
    // the generator
    t = at('gen', 0); tone(t, 46, { type: 'sawtooth', lp: 190, v: 0.22, a: 0.25, hold: 2.3, dec: 0.45 }); for (let x = 0; x < 3.0; x += 0.2) noise(t + x, 0.11, { f: 300, q: 1.1, v: 0.12, r: 0.08 });
    hiss(t + 0.6, 1.6, 0.07, 0.5); clang(t + 1.5, 0.08, 120); tone(t, 210, { f1: 250, type: 'triangle', v: 0.04, a: 0.4, hold: 2, dec: 0.5 });
    // up the stairs, and the star
    t = at('star', 0); for (let k = 0; k < 6; k++) step(t + 0.08 + k * 0.27, 0.13, true, 0); const tStar = at('star', 0.72); tone(tStar, 2637, { v: 0.085, dec: 1.4, send: 0.8 }); tone(tStar, 3951, { v: 0.045, dec: 1.0, send: 0.8 }); tone(tStar + 0.07, 5274, { v: 0.022, dec: 0.8, send: 0.8 });
    // the hard drive: static, spin-up, beeps, the picture
    t = at('relic', 0); noise(t, at('relic', 0.5) - t, { type: 'highpass', f: 2500, v: 0.045, a: 0.02, r: 0.03 }); tone(t + 0.1, 180, { f1: 1150, ft: 1.2, type: 'triangle', v: 0.05, a: 0.1, hold: 1.9, dec: 0.5 });
    tone(at('relic', 0.3), 988, { type: 'square', lp: 2600, v: 0.045, hold: 0.06, dec: 0.04 }); tone(at('relic', 0.38), 988, { type: 'square', lp: 2600, v: 0.045, hold: 0.06, dec: 0.04 }); tone(at('relic', 0.5), 1319, { type: 'square', lp: 3000, v: 0.05, hold: 0.14, dec: 0.1, send: 0.4 });
    for (let k = 0; k < 4; k++) chirp(at('relic', 0.56) + rr() * 1.0, 0.022, 0);
    // the server room
    t = at('server', 0); hum(t, 3.0, 0.06, 120); noise(t, 3.0, { type: 'highpass', f: 5000, v: 0.03, a: 0.3, r: 0.5 }); for (let k = 0; k < 16; k++) tone(t + rr() * 2.9, 1200 + Math.floor(rr() * 6) * 310, { v: 0.022, a: 0.003, dec: 0.05, pan: rr() * 1.6 - 0.8, send: 0.3 });
    tone(at('server', 0.62), 55, { v: 0.25, a: 0.05, dec: 1.2, send: 0.3 });
    // the chase
    t = at('chase', 0); klaxon(t, 3.0, 0.075); for (let x = 0.03, k = 0; x < 2.95; x += 0.155, k++) step(t + x, 0.1 + (k % 2) * 0.05, true, (k % 3 - 1) * 0.5);
    // the tape
    t = at('tape', 0); noise(t + 0.12, 0.6, { f: 1300, f1: 3800, q: 2.5, v: 0.16, a: 0.03, r: 0.1 }); noise(t + 1.0, 0.62, { f: 1500, f1: 4200, q: 2.5, v: 0.16, a: 0.03, r: 0.1 }); tone(t + 0.74, 190, { v: 0.1, dec: 0.08 }); tone(t + 1.66, 190, { v: 0.12, dec: 0.1 });
    // she goes out
    t = tApp; tone(t + 0.05, 110, { type: 'sawtooth', lp: 900, v: 0.085, a: 0.02, hold: 0.7, dec: 0.1, send: 0.4 }); hiss(t + 0.6, 1.6, 0.16, 0); clang(at('airlock2', 0.5), 0.24, 82); tone(at('airlock2', 0.5), 260, { f1: 900, v: 0.04, a: 0.2, dec: 0.9, send: 0.5 });
    for (let k = 0; k < 3; k++) step(at('airlock2', 0.58) + k * 0.42, 0.13, true, 0); whoosh(at('airlock2', 0.7), BE[ID.airlock2].d * 0.3, 0.2, 400, 6000);
    // the green world, and the display breaks
    t = at('green', 0); for (let k = 0; k < 12; k++) chirp(t + 0.25 + rr() * 2.8, 0.04, rr() * 1.6 - 0.8); breath(t + 0.2, 1.4, 0.08); breath(t + 1.8, 1.3, 0.08);
    (BE[ID.green].glitch || []).forEach(w => glitch(at('green', w[0]), (w[1] - w[0]) * BE[ID.green].d, 0.1));
    tone(at('green', 0.61), 120, { f1: 60, v: 0.14, dec: 0.12 }); noise(at('green', 0.61), 0.1, { type: 'lowpass', f: 500, v: 0.07, r: 0.08 });
    // up the hill
    t = at('climb', 0); noise(t, BE[ID.climb].d * 0.34, { f: 600, q: 1.2, v: 0.07, a: 0.2, r: 0.25, send: 0.6 }); hum(t, BE[ID.climb].d * 0.34, 0.03, 60);
    const tOut = at('climb', 0.36); wind(tOut, at('climb', 1) - tOut, 0.1, 280); for (let x = 0.1, k = 0; tOut + x < at('climb', 1); x += 0.46, k++) step(tOut + x, 0.13, false, (k % 2 - 0.5) * 0.3); breath(tOut + 0.1, 1.0, 0.07); breath(tOut + 1.15, 0.95, 0.075);
    // the ridge: the last of the birds, then the display dies
    t = at('ridge', 0); for (let k = 0; k < 7; k++) { const x = rr() * (tTruth - t - 0.35); chirp(t + x, 0.04, rr() * 1.6 - 0.8); } breath(t + 0.1, 0.9, 0.08);
    (BE[ID.ridge].glitch || []).forEach(w => glitch(at('ridge', w[0]), (w[1] - w[0]) * BE[ID.ridge].d - 0.03, 0.13));
    wind(tTruth + 0.1, END - tTruth + 1.2, 0.13, 240); wind(at('reveal', 0.3), 4, 0.07, 520); wind(at('aerial', 0), 4.2, 0.09, 180);

    function done(b) {
      let peak = 0; const rms = [];
      for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; } }
      if (peak > 0.97) { const k = 0.97 / peak; for (let c = 0; c < b.numberOfChannels; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; } }
      const d0 = b.getChannelData(0); for (let s = 0; s < Math.floor(d0.length / SR); s++) { let q = 0; for (let i = s * SR; i < (s + 1) * SR; i++) q += d0[i] * d0[i]; rms.push(+Math.sqrt(q / SR).toFixed(3)); }
      buf = b; api.state = 'ready'; api.info = { peak: +peak.toFixed(3), seconds: +b.duration.toFixed(2), rms: rms };
    }
    oc.oncomplete = e => { if (!buf) done(e.renderedBuffer); };
    try { const p = oc.startRendering(); if (p && p.then) p.then(b => { if (!buf) done(b); }).catch(e => { api.state = 'error: ' + e.message; }); } catch (e) { api.state = 'error: ' + e.message; }
  }

  // must be called from a click or a tap (browsers only allow sound after one)
  function unlock() {
    if (!AC) return;
    if (!ctx) { ctx = new AC(); out = ctx.createGain(); out.gain.value = 1; out.connect(ctx.destination); }
    if (ctx.state === 'suspended') ctx.resume();
  }
  function stop() { if (src) { try { src.stop(); } catch (e) {} src.disconnect(); src = null; } playing = false; }
  function startAt(T) {
    stop(); if (!ctx || !buf || T >= buf.duration) return;
    src = ctx.createBufferSource(); src.buffer = buf; src.connect(out); src.start(0, Math.max(0, T));
    t0 = ctx.currentTime; off0 = Math.max(0, T); playing = true;
  }
  function pos() { return playing ? off0 + (ctx.currentTime - t0) : -1; }
  // called every frame by the film: T = film time, want = the film is running
  function sync(T, want) {
    if (!ctx || !buf) return;
    if (!want || !on) { if (playing) stop(); return; }
    if (ctx.state !== 'running') return;
    if (!playing || Math.abs(pos() - T) > 0.3) startAt(T);
  }
  api.build = build; api.unlock = unlock; api.sync = sync; api.pos = pos; api.stop = stop;
  api.setOn = b => { on = !!b; if (!on) stop(); }; api.isOn = () => on; api.playing = () => playing;
  return api;
})();
