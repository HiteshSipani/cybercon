#!/usr/bin/env node
// Renders the announcer lines to arcade-voice MP3 clips.
//
//   node tools/make-voice.mjs            rebuild the default library
//   node tools/make-voice.mjs <slug>     also render that event's custom lines
//
// Why clips rather than the browser's own speech: speechSynthesis uses
// whatever voice the machine has, which is a different voice on every laptop,
// reads "SOC" as "society", and is missing entirely on some Linux builds.
// Shipping the audio makes the stand sound the same everywhere, offline.
//
// The voice is eSpeak, a formant synthesiser, run through a speech-chip
// treatment: band-limited, bit-crushed and slightly ring-modulated, which is
// how arcade cabinets of the era actually sounded.
//
// eSpeak is GPL. It runs here as a build tool and only its audio output ships,
// the way a compiler's output is not covered by the compiler's licence. No
// GPL code goes into the game.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import * as lame from '@breezystack/lamejs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const p = (...a) => path.join(ROOT, ...a);

const OUT_RATE = 11025;

// Named treatments. Pick one with VOICE_STYLE in an event file, or hear them
// side by side with: node tools/make-voice.mjs --compare
export const STYLES = {
  // The 1980s speech chip. Gritty and band-limited.
  chip:      { voice:'en-us', speed:148, pitch:32, amp:150, lo:260, hi:3600,
               bits:7, hold:2, ringHz:42, ringDepth:0.18, drive:1.6 },

  // Deeper and heavier, doubled with a detuned copy so it sounds like a
  // cabinet with a big speaker rather than a small one.
  announcer: { voice:'en-rp', speed:138, pitch:18, amp:160, lo:180, hi:4200,
               bits:9, hold:1, ringHz:0,  ringDepth:0,    drive:1.9,
               double:14, doubleMix:0.45, reverb:0.22, reverbMs:70 },

  // Full robot. Strong ring modulation.
  robot:     { voice:'en-us', speed:150, pitch:25, amp:150, lo:300, hi:3200,
               bits:6, hold:3, ringHz:78, ringDepth:0.42, drive:2.1 },

  // Tannoy in a big hall. Narrow band, driven, roomy.
  pa:        { voice:'en-rp', speed:142, pitch:30, amp:160, lo:420, hi:3000,
               bits:10, hold:1, ringHz:0, ringDepth:0,    drive:3.0,
               reverb:0.38, reverbMs:130 },

  // Least processed. Clearest across a noisy hall.
  clear:     { voice:'en-us', speed:150, pitch:40, amp:150, lo:200, hi:4800,
               bits:12, hold:1, ringHz:0, ringDepth:0,    drive:1.2 },

  // As close to a fighting-game announcer as a formant synthesiser gets:
  // pitched and formant-shifted down, an octave underneath, driven hard,
  // widened, and thrown into a large room.
  mk:        { voice:'en-rp', speed:168, pitch:0,  amp:170, lo:110, hi:3400,
               bits:11, hold:1, ringHz:0, ringDepth:0, drive:3.4,
               pitchDown:5.5, sub:0.42, double:19, doubleMix:0.4,
               chorusMix:0.34, chorusMs:17, chorusHz:0.55,
               reverb:0.42, reverbMs:150 },

  // The same idea with less grit, if the full one is too muddy in a hall.
  mkLite:    { voice:'en-rp', speed:160, pitch:5,  amp:165, lo:140, hi:3800,
               bits:12, hold:1, ringHz:0, ringDepth:0, drive:2.2,
               pitchDown:3.5, sub:0.26, double:16, doubleMix:0.35,
               chorusMix:0.22, chorusMs:14, chorusHz:0.7,
               reverb:0.3, reverbMs:110 },

  // Low, slow and wide. The "in a world..." trailer read.
  deep:      { voice:'en-n',  speed:128, pitch:5,  amp:165, lo:150, hi:3800,
               bits:10, hold:1, ringHz:0, ringDepth:0,    drive:2.2,
               double:22, doubleMix:0.5, reverb:0.3, reverbMs:95 },
};
export const DEFAULT_STYLE = 'announcer';

/* ---------- pronunciation -------------------------------------------------
   The synthesiser reads some security acronyms as words. These rewrites apply
   to the spoken text only; what appears on screen is untouched. */
export const SAY_AS = [
  [/\bSOC\b/g,  'sock'],
  [/\bSOCs\b/g, 'socks'],
  [/\bAI\b/g,   'A.I.'],
  [/\bIR\b/g,   'I.R.'],
  [/\bMFA\b/g,  'M.F.A.'],
  [/\bIOC\b/g,  'I.O.C.'],
  [/\bSIEM\b/g, 'seem'],
  [/\bEDR\b/g,  'E.D.R.'],
  [/\bC2\b/g,   'C. two'],
  [/\bStrike48\b/g, 'Strike forty eight'],
];
export function spokenForm(text) {
  return SAY_AS.reduce((s, [re, to]) => s.replace(re, to), String(text));
}

/* ---------- the default announcer library ------------------------------- */
export const DEFAULT_LINES = [
  'Beat the Bot!',
  'Can you out-think an Agentic SOC?',
  'One alert. Three calls. Seconds on the clock.',
  'Think you are faster than artificial intelligence?',
  'Step up. Take the challenge.',
  'The machine is waiting.',
  'How fast can you triage?',
  'Challenger approaching!',
  'Ready when you are.',
];

/* ---------- WAV in --------------------------------------------------------- */
function readWav(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error('not a WAV');
  let off = 12, rate = 22050, bits = 16, ch = 1, data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') { ch = buf.readUInt16LE(off + 10); rate = buf.readUInt32LE(off + 12); bits = buf.readUInt16LE(off + 22); }
    else if (id === 'data') { data = buf.subarray(off + 8, off + 8 + size); break; }
    off += 8 + size + (size & 1);
  }
  if (!data) throw new Error('no data chunk');
  if (bits !== 16) throw new Error('expected 16-bit, got ' + bits);
  const n = Math.floor(data.length / 2 / ch);
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = data.readInt16LE(i * 2 * ch) / 32768;
  return { rate, samples: f };
}

/* ---------- the speech-chip chain ---------------------------------------- */
function biquad(x, b0, b1, b2, a1, a2) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
function bandpass(x, rate, lo, hi) {
  const mk = (f, type) => {
    const w = 2 * Math.PI * f / rate, c = Math.cos(w), s = Math.sin(w), al = s / (2 * 0.707);
    const a0 = 1 + al;
    return type === 'hp'
      ? [(1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, (-2 * c) / a0, (1 - al) / a0]
      : [(1 - c) / 2 / a0,  (1 - c) / a0, (1 - c) / 2 / a0, (-2 * c) / a0, (1 - al) / a0];
  };
  let y = biquad(x, ...mk(lo, 'hp'));
  y = biquad(y, ...mk(hi, 'lp'));
  return y;
}
function resample(x, from, to) {
  const n = Math.round(x.length * to / from), y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i * from / to, i0 = Math.floor(t), f = t - i0;
    y[i] = (x[i0] || 0) * (1 - f) + (x[i0 + 1] || 0) * f;
  }
  return y;
}
function delayMix(x, rate, ms, amount) {
  if (!amount) return x;
  const d = Math.max(1, Math.round(rate * ms / 1000));
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    y[i] = x[i] + amount * (y[i - d] !== undefined ? y[i - d] : 0) + amount * (x[i - d] || 0);
  }
  return y;
}

// A second copy, pitched slightly, mixed under the first. Cheap way to make a
// thin formant voice sound like it is coming out of a real cabinet.
function doubleUp(x, cents, mix) {
  if (!cents) return x;
  const r = Math.pow(2, -cents / 1200);
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const t = i * r, i0 = Math.floor(t), f = t - i0;
    y[i] = x[i] + mix * ((x[i0] || 0) * (1 - f) + (x[i0 + 1] || 0) * f);
  }
  return y;
}


// Resampling the whole line slower drops pitch AND formants together, which is
// what makes a voice sound physically bigger rather than just lower. Pitching
// without the formants only sounds slowed down.
function pitchDown(x, semitones) {
  if (!semitones) return x;
  const r = Math.pow(2, semitones / 12);        // >1 = longer and lower
  const n = Math.round(x.length * r), y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / r, i0 = Math.floor(t), f = t - i0;
    y[i] = (x[i0] || 0) * (1 - f) + (x[i0 + 1] || 0) * f;
  }
  return y;
}

// An octave below, mixed underneath. Adds weight without muddying the words.
function subOctave(x, mix) {
  if (!mix) return x;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const t = i / 2, i0 = Math.floor(t), f = t - i0;
    y[i] = x[i] + mix * ((x[i0] || 0) * (1 - f) + (x[i0 + 1] || 0) * f);
  }
  return y;
}

// Modulated delay. Widens a thin synthetic voice into something choral.
function chorus(x, rate, depthMs, mix, lfoHz) {
  if (!mix) return x;
  const depth = depthMs * rate / 1000;
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const d = depth * (1 + Math.sin(2 * Math.PI * (lfoHz || 0.8) * i / rate)) / 2 + 2;
    const t = i - d, i0 = Math.floor(t), f = t - i0;
    const s = i0 >= 0 ? ((x[i0] || 0) * (1 - f) + (x[i0 + 1] || 0) * f) : 0;
    y[i] = x[i] + mix * s;
  }
  return y;
}

function arcadeify(samples, rate, st) {
  let y = samples;
  if (st.pitchDown) y = pitchDown(y, st.pitchDown);
  y = bandpass(y, rate, st.lo, st.hi);
  if (st.sub) y = subOctave(y, st.sub);
  y = doubleUp(y, st.double || 0, st.doubleMix || 0);
  if (st.chorusMix) y = chorus(y, rate, st.chorusMs || 14, st.chorusMix, st.chorusHz);

  const step = 2 / (Math.pow(2, st.bits) - 1);
  const hold = Math.max(1, st.hold || 1);
  const out = new Float32Array(y.length);
  let held = 0;
  for (let i = 0; i < y.length; i++) {
    if (i % hold === 0) held = y[i];
    let v = Math.round(held / step) * step;
    if (st.ringDepth) v += st.ringDepth * v * Math.sin(2 * Math.PI * st.ringHz * i / rate);
    out[i] = Math.tanh(v * (st.drive || 1.6));
  }

  let z = delayMix(out, rate, st.reverbMs || 60, st.reverb || 0);
  z = bandpass(z, rate, st.lo, st.hi);

  let peak = 0;
  for (let i = 0; i < z.length; i++) peak = Math.max(peak, Math.abs(z[i]));
  if (peak > 0) { const g = 0.89 / peak; for (let i = 0; i < z.length; i++) z[i] *= g; }
  return resample(z, rate, OUT_RATE);
}

/* ---------- synth + encode ------------------------------------------------ */
// mespeak is an emscripten build with its own virtual filesystem, and that
// filesystem degrades after enough calls in one process: it eventually reports
// "Bad data: en_dict" and throws. Rendering every voice for a comparison build
// is well past that point, so the engine is torn down and rebuilt periodically
// and whenever a render fails.
let engine = null, loadedVoice = null, renders = 0;
const RECYCLE_AFTER = 20;

function freshEngine(voice) {
  const B = p('node_modules', 'mespeak') + '/';
  for (const k of Object.keys(require.cache)) {
    if (k.includes(`${path.sep}mespeak${path.sep}`)) delete require.cache[k];
  }
  const me = require(B + 'src/index.js');
  me.loadConfig(require(B + 'src/mespeak_config.json'));
  me.loadVoice(require(B + 'voices/en/' + voice + '.json'));
  engine = me; loadedVoice = voice; renders = 0;
  return me;
}

function synth(text, st) {
  const B = p('node_modules', 'mespeak') + '/';
  if (!engine || renders >= RECYCLE_AFTER) freshEngine(st.voice);
  else if (loadedVoice !== st.voice) {
    engine.loadVoice(require(B + 'voices/en/' + st.voice + '.json'));
    loadedVoice = st.voice;
  }
  const opts = { rawdata: 'buffer', speed: st.speed, pitch: st.pitch, amplitude: st.amp };
  try {
    renders++;
    return Buffer.from(engine.speak(text, opts));
  } catch (e) {
    // One retry on a fresh engine before giving up.
    freshEngine(st.voice);
    renders++;
    return Buffer.from(engine.speak(text, opts));
  }
}

function toMp3(f32) {
  const pcm = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767)));
  const enc = new lame.Mp3Encoder(1, OUT_RATE, 32);
  const parts = [];
  const BLK = 1152;
  for (let i = 0; i < pcm.length; i += BLK) {
    const b = enc.encodeBuffer(pcm.subarray(i, Math.min(i + BLK, pcm.length)));
    if (b.length) parts.push(Buffer.from(b));
  }
  const tail = enc.flush();
  if (tail.length) parts.push(Buffer.from(tail));
  return Buffer.concat(parts);
}

export function renderLine(text, styleName) {
  const st = STYLES[styleName] || STYLES[DEFAULT_STYLE];
  const wav = readWav(synth(spokenForm(text), st));
  const mp3 = toMp3(arcadeify(wav.samples, wav.rate, st));
  return { text, mp3, seconds: +(wav.samples.length / wav.rate).toFixed(2) };
}

export async function buildClips(lines, styleName) {
  const clips = {};
  let bytes = 0;
  for (const line of lines) {
    const r = renderLine(line, styleName);
    clips[line] = 'data:audio/mpeg;base64,' + r.mp3.toString('base64');
    bytes += r.mp3.length;
  }
  return { clips, bytes };
}


async function compare() {
  const demo = ['Beat the Bot!', 'Can you out-think an Agentic SOC?',
                'One alert. Three calls. Seconds on the clock.'];
  const names = Object.keys(STYLES);
  console.log('\n  rendering ' + demo.length + ' lines in ' + names.length + ' styles\n');
  const rows = [];
  for (const name of names) {
    const clips = [];
    let kb = 0;
    for (const line of demo) {
      const r = renderLine(line, name);
      clips.push({ line, src: 'data:audio/mpeg;base64,' + r.mp3.toString('base64'), s: r.seconds });
      kb += r.mp3.length / 1024;
    }
    rows.push({ name, clips, kb: kb.toFixed(0), st: STYLES[name] });
    console.log('   ' + name.padEnd(10) + String(kb.toFixed(0)).padStart(4) + ' KB  ' +
                STYLES[name].voice + '  pitch ' + STYLES[name].pitch + '  ' + STYLES[name].bits + '-bit');
  }
  const BLURB = {
    mk:        'Pitched and formant-shifted down, an octave underneath, driven and thrown into a big room.',
    mkLite:    'The same idea with less grit, if the full one is too muddy in a hall.',
    chip:      'A 1980s speech chip. Gritty, narrow, unmistakably retro.',
    announcer: 'Deeper, doubled with a detuned copy so it sounds like a big cabinet speaker.',
    robot:     'Full robot. Heavy ring modulation.',
    pa:        'A tannoy in a large hall. Narrow and driven, with room on it.',
    clear:     'Barely processed. The easiest to understand across a noisy floor.',
    deep:      'Low, slow and wide. The movie-trailer read.',
  };
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Announcer Voices</title>
<style>:root{--bg:#070C16;--panel:#0E1726;--line:#223149;--ink:#EAEFF8;--dim:#8FA0BD;--gold:#F5B301}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 ui-sans-serif,system-ui,sans-serif;padding:28px 20px}
.w{max-width:760px;margin:0 auto}h1{font-size:21px;margin:0 0 6px}
.lede{color:var(--dim);margin:0 0 26px;font-size:14px}
.s{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin-bottom:16px}
.hd{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px}
.nm{font-size:16px;font-weight:700;color:var(--gold);letter-spacing:.3px}
.tag{font:11px ui-monospace,monospace;color:var(--dim);border:1px solid var(--line);border-radius:999px;padding:2px 9px}
.bl{color:var(--dim);font-size:13.5px;margin:0 0 14px}
.c{display:flex;align-items:center;gap:12px;padding:7px 0;border-top:1px solid rgba(34,49,73,.6)}
.c:first-of-type{border-top:none}
.tx{flex:1;font-size:13px;color:#cfdaea;min-width:0}
audio{height:34px}
code{background:#121D30;border:1px solid var(--line);border-radius:5px;padding:2px 7px;font-size:12.5px}
.use{margin-top:12px;font-size:12.5px;color:var(--dim)}</style></head><body><div class="w">
<h1>Beat the Bot — announcer voices</h1>
<p class="lede">The same three lines in every treatment. Pick one and tell me which, or say what to change about it.</p>
${rows.map(r => `<div class="s">
  <div class="hd"><span class="nm">${r.name}</span>
    <span class="tag">${r.st.voice}</span><span class="tag">pitch ${r.st.pitch}</span>
    <span class="tag">${r.st.bits}-bit</span><span class="tag">${r.st.lo}\u2013${r.st.hi} Hz</span>
    <span class="tag">${r.kb} KB</span></div>
  <p class="bl">${BLURB[r.name] || ''}</p>
  ${r.clips.map(c => `<div class="c"><audio controls preload="none" src="${c.src}"></audio>
    <span class="tx">${c.line.replace(/</g,'&lt;')}</span></div>`).join('')}
  <div class="use">Use it with <code>"audio": { "style": "${r.name}" }</code></div>
</div>`).join('')}
</div></body></html>`;
  await writeFile(p('voice-styles.html'), html);
  console.log('\n  wrote voice-styles.html\n');
}

async function main() {
  if (process.argv.includes('--compare')) return compare();
  const extra = [];
  const slug = process.argv[2];
  if (slug) {
    const f = p('events', slug + '.json');
    if (existsSync(f)) {
      const ev = JSON.parse(await readFile(f, 'utf8'));
      if (ev.audio && Array.isArray(ev.audio.lines)) extra.push(...ev.audio.lines);
    }
  }
  const lines = [...new Set([...DEFAULT_LINES, ...extra])];
  const style = process.env.VOICE_STYLE || DEFAULT_STYLE;
  console.log('  style: ' + style);
  console.log('\n  rendering ' + lines.length + ' announcer lines\n');
  const { clips, bytes } = await buildClips(lines, style);
  for (const l of lines) {
    const kb = (clips[l].length * 0.75 / 1024).toFixed(1);
    console.log('   ' + kb.padStart(6) + ' KB  ' + JSON.stringify(l));
    const said = spokenForm(l);
    if (said !== l) console.log('            spoken as: ' + JSON.stringify(said));
  }
  clips.__style = style;      // so the build knows whether it can reuse this
  await writeFile(p('lib', 'voice-clips.json'), JSON.stringify(clips));
  console.log('\n  wrote lib/voice-clips.json  (' + (bytes / 1024).toFixed(0) + ' KB of audio)\n');
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
