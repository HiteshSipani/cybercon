#!/usr/bin/env node
// Beat the Bot event builder.
//
//   node tools/build.mjs <slug>      build one event
//   node tools/build.mjs --all       build every event in events/
//
// For each event it writes:
//   public/e/<slug>/index.html       the hosted game
//   public/e/<slug>/event-logo.png   normalised logo for the scorecard
//   public/e/<slug>/partner-logo.png
//   dist/beat-the-bot-<slug>.html    the offline file for the booth laptop
//   lib/registry.js                  what the share page and scorecard read
//
// Several events coexist: each owns a slug-scoped folder and a registry entry,
// so building one never touches another.

import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { captionsForEvent, buildHashtags } from '../lib/captions.js';
import { buildClips, DEFAULT_LINES, DEFAULT_STYLE, STYLES } from './make-voice.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const p = (...a) => path.join(ROOT, ...a);

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Scorecard logo boxes. Artwork is fitted inside these without distortion.
const LOGO_BOX = { event: { w: 233, h: 80 }, partner: { w: 288, h: 42 } };
// Game header logos render larger, so keep more pixels for them.
const GAME_BOX = { event: { w: 700, h: 240 }, partner: { w: 880, h: 130 } };

// The template pulls four typefaces from Google Fonts. A booth with no wifi,
// or a captive portal, therefore falls back to system fonts and the game looks
// wrong. Embedding them makes the offline file genuinely offline.
const FONT_FACES = [
  ['Space Grotesk', 'space-grotesk', [500, 700]],
  ['IBM Plex Mono', 'ibm-plex-mono', [400, 500, 600]],
  ['Press Start 2P', 'press-start-2p', [400]],
  ['Inter', 'inter', [400, 500, 600]],
];

async function buildFontCss() {
  const out = [];
  let bytes = 0;
  for (const [family, pkg, weights] of FONT_FACES) {
    for (const w of weights) {
      const f = p('node_modules', '@fontsource', pkg, 'files', `${pkg}-latin-${w}-normal.woff2`);
      if (!existsSync(f)) { console.log(`     note      font missing, left on the network: ${family} ${w}`); continue; }
      const b = await readFile(f);
      bytes += b.length;
      out.push(`@font-face{font-family:'${family}';font-style:normal;font-weight:${w};font-display:swap;` +
               `src:url(data:font/woff2;base64,${b.toString('base64')}) format('woff2')}`);
    }
  }
  return { css: out.length ? `<style id="embeddedFonts">${out.join('')}</style>` : '', bytes, count: out.length };
}

// Swap the Google Fonts <link> tags for the embedded faces.
function embedFonts(html, fontCss) {
  if (!fontCss) return html;
  let n = 0;
  html = html.replace(/<link[^>]+fonts\.(?:googleapis|gstatic)\.com[^>]*>/g, () => { n++; return ''; });
  html = html.replace(/<link[^>]+rel=["']preconnect["'][^>]*fonts[^>]*>/g, () => { n++; return ''; });
  return html.replace('</head>', fontCss + '</head>');
}

// Browsers will not start audio until someone interacts with the page, so the
// title screen carries a small prompt that disappears the moment it unlocks.
const AUDIO_HINT = '<button id="audioHint" type="button" style="position:fixed;left:50%;bottom:18px;' +
  'transform:translateX(-50%);z-index:60;font:12px/1 ui-monospace,monospace;' +
  'letter-spacing:1.5px;color:#0a1120;background:#F5B301;cursor:pointer;' +
  'border:none;border-radius:999px;padding:11px 18px;font-weight:700">' +
  'TAP FOR SOUND</button>';

// The game makes its own AudioContext and sends its blips straight to the
// speakers, which means they sit outside the mixer: the volume slider cannot
// touch them and they cannot be balanced against the music. These two
// rewrites put them on the same context and through a dedicated bus.
function routeGameSfx(html) {
  const ctxLine = 'if(!AC){try{AC=new(window.AudioContext||window.webkitAudioContext)();}catch(e){}}';
  const outLine = 'v.connect(c.destination);';
  if (html.indexOf(ctxLine) < 0 || html.indexOf(outLine) < 0)
    fail('could not find the game audio code to route through the mixer');
  return html
    .replace(ctxLine,
      'if(!AC){try{AC=window.__arcadeCtx||new(window.AudioContext||window.webkitAudioContext)();}catch(e){}}')
    .replace(outLine, 'v.connect(window.__sfxBus||c.destination);');
}

function addAudioBridge(html) {
  const anchor = 'MUTED=!CONFIG.sound;';
  if (html.indexOf(anchor) < 0) fail('could not find the CONFIG/MUTED declaration to bridge');
  if (html.indexOf('window.__bb=') >= 0) return html;
  return html.replace(anchor,
    anchor + 'window.__bb={cfg:CONFIG,muted:function(){return MUTED;}};');
}

// Ships the announcer audio for exactly the lines this event uses. A line
// already in the prebuilt library is reused; anything custom is rendered now,
// which is why the renderer is pure JavaScript and runs in the Vercel build.
async function addVoiceClips(html, cfg, lib, notes) {
  if (!cfg.audio || cfg.audio.voice === false) return html;
  const style = cfg.audio.style || DEFAULT_STYLE;
  if (!STYLES[style]) fail(`unknown voice style "${style}". Choose one of: ${Object.keys(STYLES).join(', ')}`);
  const lines = (cfg.audio.lines && cfg.audio.lines.length) ? cfg.audio.lines : DEFAULT_LINES;
  const clips = {};
  const missing = [];
  // The prebuilt library is only reusable when the event wants the style it
  // was rendered in; any other style has to be rendered from scratch.
  const libUsable = (lib.__style || DEFAULT_STYLE) === style;
  for (const l of lines) {
    if (l === '__style') continue;
    if (libUsable && lib[l]) clips[l] = lib[l]; else missing.push(l);
  }
  if (missing.length) {
    const made = await buildClips(missing, style);
    Object.assign(clips, made.clips);
    notes.push(`rendered ${missing.length} announcer line${missing.length === 1 ? '' : 's'} in the "${style}" voice`);
  }
  const bytes = Object.values(clips).reduce((n, v) => n + v.length * 0.75, 0);
  notes.push(`announcer: ${Object.keys(clips).length} lines in "${style}", ${(bytes / 1024).toFixed(0)} KB of audio`);
  let tag = '<script id="voiceClips">window.__voiceClips=' + JSON.stringify(clips) + ';<' + '/script>';

  // Carrying every voice lets the announcer be changed from the sound panel at
  // the stand, at the cost of roughly 90 KB per voice in the file.
  if (cfg.audio.allVoices) {
    const all = {};
    let extra = 0;
    for (const name of Object.keys(STYLES)) {
      const made = name === style ? { clips } : await buildClips(lines, name);
      all[name] = made.clips;
      if (name !== style) extra += Object.values(made.clips).reduce((n, v) => n + v.length * 0.75, 0);
    }
    tag = '<script id="voiceStyles">window.__voiceStyles=' + JSON.stringify(all) + ';<' + '/script>' + tag;
    notes.push(`all ${Object.keys(STYLES).length} voices embedded (+${(extra / 1024).toFixed(0)} KB)`);
  }

  const at = html.lastIndexOf('</body>');
  return html.slice(0, at) + tag + html.slice(at);
}

// A supplied music track replaces the synthesised bed. The offline build
// embeds it so the file still runs with no network; the hosted build points at
// a separate, better-quality copy that the browser caches.
async function addMusicTrack(ev, cfg, slug, outDir, notes) {
  const name = cfg.audio && cfg.audio.track;
  if (!name) return { offline: '', hosted: '' };
  const src = p('events', name);
  if (!existsSync(src)) fail(`music track not found at events/${name}`);
  const buf = await readFile(src);

  // The hosted copy: prefer a "-hifi" sibling when one exists.
  const hifi = src.replace(/\.mp3$/, '-hifi.mp3');
  const hostedBuf = existsSync(hifi) ? await readFile(hifi) : buf;
  await writeFile(path.join(outDir, 'music.mp3'), hostedBuf);

  notes.push(`music: ${name}, ${(buf.length / 1024).toFixed(0)} KB embedded, ` +
             `${(hostedBuf.length / 1024).toFixed(0)} KB served at /e/${slug}/music.mp3`);
  return {
    offline: 'data:audio/mpeg;base64,' + buf.toString('base64'),
    hosted: `/e/${slug}/music.mp3`,
  };
}

function addArcadeAudio(html, js, cfg) {
  if (!js || (cfg.audio && cfg.audio.music === false && cfg.audio.voice === false)) return html;
  if (html.indexOf('id="arcadeAudio"') >= 0) return html;
  // A real closing tag. The <\\/script> escape only works inside a JS string
  // literal; written into raw HTML it does not close the block, and the rest
  // of the document gets swallowed into the script.
  const block = AUDIO_HINT + '<script id="arcadeAudio">' + js + '<' + '/script>';
  const at = html.lastIndexOf('</body>');
  if (at < 0) fail('game template has no </body>');
  const out = html.slice(0, at) + block + html.slice(at);
  const open = out.indexOf('id="arcadeAudio"');
  if (out.indexOf('</script>', open) < 0) fail('the audio script block does not close');
  return out;
}

function fail(msg) { console.error('\n  build failed: ' + msg + '\n'); process.exit(1); }

function validate(ev, slug) {
  const errs = [];
  if (!SLUG_RE.test(slug)) errs.push(`slug "${slug}" must be lowercase words joined by hyphens`);
  if (!ev.eventName) errs.push('eventName is required');
  if (ev.botTime != null && !(ev.botTime > 0 && ev.botTime < 60)) errs.push('botTime must be between 0 and 60');
  if (ev.partner && !ev.partner.name) errs.push('partner needs a name, or drop the partner block entirely');
  if (ev.giveaway && ev.giveaway.enabled && !ev.giveaway.prize)
    errs.push('giveaway.enabled is true but no giveaway.prize is set');
  if (ev.language && !/^[a-z]{2}(-[A-Z]{2})?$/.test(ev.language))
    errs.push(`language "${ev.language}" should look like "fr" or "es-MX"`);
  if (errs.length) fail('events/' + slug + '.json\n    - ' + errs.join('\n    - '));
}

// Any input format sharp can read, including SVG, WebP and HEIC, comes out as
// PNG with transparency. This exists because satori throws a hard error on
// WebP, which once took a scorecard endpoint down mid-event.
async function normaliseLogo(src, outPath, box, label) {
  if (!existsSync(src)) fail(`${label} not found at ${src}`);
  const img = sharp(src, { density: 600 });  // density only matters for SVG input
  const meta = await img.metadata();
  const buf = await img
    .resize({ width: box.w * 3, height: box.h * 3, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(outPath, buf);
  const out = await sharp(buf).metadata();
  return { from: `${meta.format} ${meta.width}x${meta.height}`, to: `png ${out.width}x${out.height}`,
           bytes: buf.length, dataUri: 'data:image/png;base64,' + buf.toString('base64') };
}

// Warn if artwork is dark: the scorecard and game header are both near-black,
// so a dark logo renders invisible. This was a real failure at two events.
async function brightnessWarning(src, label) {
  try {
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let lum = 0, seen = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      const a = data[i + 3];
      if (a < 40) continue;                         // ignore transparent padding
      lum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      seen++;
    }
    if (!seen) return `${label}: artwork is fully transparent`;
    const mean = lum / seen;
    if (mean < 90) return `${label}: mean brightness ${mean.toFixed(0)}/255 on a dark background. ` +
                          `It will be hard to see. Supply a white or light version.`;
    return null;
  } catch { return null; }
}

// Replace window.__BAKED__={...}; by brace matching rather than regex, because
// the block is ~160KB of one line and contains braces inside base64 and prose.
function replaceBaked(html, baked) {
  const key = 'window.__BAKED__=';
  const at = html.indexOf(key);
  if (at < 0) fail('templates/game.html has no window.__BAKED__ block');
  let i = html.indexOf('{', at), depth = 0, inStr = false, esc = false, end = -1;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  if (end < 0) fail('could not find the end of the baked config block');
  return html.slice(0, i) + JSON.stringify(baked) + html.slice(end + 1);
}

// Make the game pass its slug to the share page alongside the display name, so
// one deployment can serve several conferences at once. Old links that carry
// only the display name still resolve, by name match in the registry.
function patchShareTarget(html) {
  const needle = 'p.set("ev",CONFIG.eventName);';
  if (!html.includes(needle)) fail('shareTarget() does not look as expected; template changed?');
  if (html.includes('p.set("e",CONFIG.eventSlug)')) return html;
  return html.replace(needle, needle + 'if(CONFIG.eventSlug)p.set("e",CONFIG.eventSlug);');
}

async function buildOne(slug, shared) {
  const ev = JSON.parse(await readFile(p('events', slug + '.json'), 'utf8'));
  validate(ev, slug);

  const outDir = p('public', 'e', slug);
  await mkdir(outDir, { recursive: true });
  const notes = [];

  // --- logos -------------------------------------------------------------
  const logos = {};
  for (const [kind, box] of [['event', 'event'], ['partner', 'partner']]) {
    const rel = kind === 'event' ? ev.logo : (ev.partner && ev.partner.logo);
    if (!rel) continue;
    const src = p('events', rel);
    const warn = await brightnessWarning(src, `${kind} logo`);
    if (warn) notes.push(warn);
    // scorecard copy: small, fetched over HTTP by the edge function
    const card = await normaliseLogo(src, path.join(outDir, `${kind}-logo.png`), LOGO_BOX[kind], `${kind} logo`);
    // game copy: larger, embedded so the offline file needs no network
    // The game copy is embedded as base64, so it is written to a scratch
    // folder rather than public/, which only needs what the scorecard fetches.
    const scratch = p('.cache', slug);
    await mkdir(scratch, { recursive: true });
    const game = await normaliseLogo(src, path.join(scratch, `${kind}-logo.png`), GAME_BOX[kind], `${kind} logo`);
    logos[kind] = { card, game };
    notes.push(`${kind} logo: ${card.from} -> ${card.to} for the card, ${game.to} for the game`);
  }

  // --- captions ----------------------------------------------------------
  const captions = captionsForEvent(ev);

  // --- baked game config -------------------------------------------------
  const partnerName = (ev.partner && ev.partner.name) || '';
  const giveaway = ev.giveaway || { enabled: false };
  const cfg = {
    ...shared.cfgDefaults,
    eventSlug: slug,
    eventName: ev.eventName,
    eventVenue: ev.venue || '',
    booth: ev.booth || '',
    brandPartner: partnerName,
    partnerLinkedIn: (ev.partner && ev.partner.linkedIn) || '',
    strikeLinkedIn: ev.strikeLinkedIn || shared.cfgDefaults.strikeLinkedIn,
    botTime: ev.botTime ?? 3.5,
    vercelBase: (ev.shareBase || shared.shareBase || '').replace(/\/$/, ''),
    shareMode: 'vercel',
    captions,
    eventLogo: logos.event ? logos.event.game.dataUri : '',
    partnerLogo: logos.partner ? logos.partner.game.dataUri : '',
    strikeLogo: shared.strikeLogo,
    // giveaway: one switch in the event file drives every giveaway control
    giveawayButton: !!giveaway.enabled,
    giveawayPresent: !!giveaway.enabled,
    giveawayTime: giveaway.drawTime || '',
    giveawayTimer: giveaway.claimSeconds ?? 10,
    giveawaySource: giveaway.source || 'lb',
    // Audio. Defaults to on; an event file can quieten or silence it, which
    // matters in a small hall or next to a speaking theatre.
    audio: {
      music: (ev.audio && ev.audio.music) !== false,
      voice: (ev.audio && ev.audio.voice) !== false,
      volume: (ev.audio && typeof ev.audio.volume === 'number') ? ev.audio.volume : 0.5,
      attractSeconds: (ev.audio && ev.audio.attractSeconds) || 14,
      track: (ev.audio && ev.audio.track) || '',
      showText: (ev.audio && ev.audio.showText) !== false,
      style: (ev.audio && ev.audio.style) || DEFAULT_STYLE,
      allVoices: !!(ev.audio && ev.audio.allVoices),
      ...(ev.audio && ev.audio.lines ? { lines: ev.audio.lines } : {}),
    },
    giveawayNames: '',
    poster: giveaway.prize || '',
  };

  const baked = { stamp: shared.stamp, cfg, scen: shared.scen };
  let html = replaceBaked(shared.template, baked);
  html = patchShareTarget(html);
  html = embedFonts(html, shared.fontCss);
  html = addAudioBridge(html);
  html = routeGameSfx(html);
  html = await addVoiceClips(html, cfg, shared.clipLib, notes);
  html = addArcadeAudio(html, shared.arcadeJs, cfg);
  if (ev.title) {
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${ev.title} — ${ev.eventName}</title>`);
  }

  const music = await addMusicTrack(ev, cfg, slug, outDir, notes);
  const withTrack = (h, uri) => uri
    ? h.replace('<script id="arcadeAudio">',
        '<script id="musicTrack">window.__musicTrack=' + JSON.stringify(uri) + ';<' + '/script>' +
        '<script id="arcadeAudio">')
    : h;

  await writeFile(path.join(outDir, 'index.html'), withTrack(html, music.hosted));
  html = withTrack(html, music.offline);

  // A separate build carrying every announcer voice, so they can be compared
  // in the game over the music rather than in isolation. Not deployed.
  if (shared.allVoices) {
    const all = {};
    const lines = (cfg.audio.lines && cfg.audio.lines.length) ? cfg.audio.lines : DEFAULT_LINES;
    for (const name of Object.keys(STYLES)) {
      const made = await buildClips(lines, name);
      all[name] = made.clips;
    }
    const tag = '<script id="voiceStyles">window.__voiceStyles=' + JSON.stringify(all) + ';<' + '/script>';
    // Must land before the audio engine, which reads this at start-up.
    const at2 = html.indexOf('<script id="arcadeAudio">');
    if (at2 < 0) fail('could not find the audio engine to inject the voice set before');
    await writeFile(p('dist', `beat-the-bot-${slug}-voicetest.html`),
                    html.slice(0, at2) + tag + html.slice(at2));
    notes.push(`voice test build: ${Object.keys(STYLES).length} voices, dist/beat-the-bot-${slug}-voicetest.html`);
  }
  await mkdir(p('dist'), { recursive: true });
  const offline = p('dist', `beat-the-bot-${slug}.html`);
  await writeFile(offline, html);

  return {
    slug,
    entry: {
      slug,
      eventName: ev.eventName,
      venue: ev.venue || '',
      partner: partnerName,
      partnerLinkedIn: (ev.partner && ev.partner.linkedIn) || '',
      strikeLinkedIn: cfg.strikeLinkedIn,
      language: ev.language || 'en',
      botTime: cfg.botTime,
      hashtags: buildHashtags(ev.eventName, ev.hashtags),
      giveaway: !!giveaway.enabled,
      logoEvent: logos.event ? `/e/${slug}/event-logo.png` : '',
      logoPartner: logos.partner ? `/e/${slug}/partner-logo.png` : '',
      captions,
    },
    notes,
    audio: cfg.audio.music === false ? 'off'
         : `music on, announcer ${cfg.audio.voice === false ? 'off' : 'on'} (${cfg.audio.style}), volume ${cfg.audio.volume}`,
    sizes: { html: html.length, offline },
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.log('usage: node tools/build.mjs <slug> | --all');
    process.exit(2);
  }

  const template = await readFile(p('templates', 'game.html'), 'utf8');
  // Pull the shared pieces (59 scenarios, Strike48 logo, defaults) out of the
  // template once, so event files never have to carry them.
  const at = template.indexOf('{', template.indexOf('window.__BAKED__='));
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let j = at; j < template.length; j++) {
    const c = template[j];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++; else if (c === '}') { depth--; if (!depth) { end = j; break; } }
  }
  const base = JSON.parse(template.slice(at, end + 1));

  // Build the Studio page by inlining the caption library into it. One source
  // of truth (lib/captions.js) but a page with no external script, so it works
  // served, at /studio behind the rewrite, and opened straight off disk.
  await mkdir(p('public', 'admin'), { recursive: true });
  const adminTpl = await readFile(p('templates', 'admin.html'), 'utf8');
  const capLib = (await readFile(p('lib', 'captions.js'), 'utf8'))
    .replace(/^export\s+/gm, '');          // module scope, no imports needed
  if (!adminTpl.includes('/* __CAPTIONS_LIB__ */'))
    fail('templates/admin.html has no __CAPTIONS_LIB__ marker');
  await writeFile(p('public', 'admin', 'index.html'),
    adminTpl.replace('/* __CAPTIONS_LIB__ */', capLib));

  const arcadeJs = await readFile(p('lib', 'arcade-audio.js'), 'utf8');
  let clipLib = {};
  try { clipLib = JSON.parse(await readFile(p('lib', 'voice-clips.json'), 'utf8')); }
  catch { console.log('  note: no lib/voice-clips.json; run npm run voice'); }

  const fonts = await buildFontCss();
  const shared = {
    template,
    fontCss: fonts.css,
    arcadeJs,
    clipLib,
    scen: base.scen,
    strikeLogo: base.cfg.strikeLogo,
    // every build gets a fresh stamp so the game ignores any cached config
    // left in localStorage from a previous event on the same laptop
    stamp: Date.now(),
    shareBase: process.env.SHARE_BASE || base.cfg.vercelBase || '',
    cfgDefaults: {
      gameTitle: base.cfg.gameTitle,
      gameTitleAccent: base.cfg.gameTitleAccent,
      subtitle: base.cfg.subtitle,
      fields: base.cfg.fields,
      strikeLinkedIn: base.cfg.strikeLinkedIn,
      logoSize: base.cfg.logoSize,
      logoSizeEvent: base.cfg.logoSizeEvent,
      logoSizeStrike: base.cfg.logoSizeStrike,
      logoSizePartner: base.cfg.logoSizePartner,
      logoPosEvent: base.cfg.logoPosEvent,
      logoPosStrike: base.cfg.logoPosStrike,
      logoPosPartner: base.cfg.logoPosPartner,
    },
  };

  shared.allVoices = args.includes('--voices');
  const argv = args.filter(a => a !== '--voices');

  let slugs;
  if (argv[0] === '--all') {
    slugs = (await readdir(p('events'))).filter(f => f.endsWith('.json') && !f.startsWith('_'))
                                        .map(f => f.replace(/\.json$/, ''));
  } else {
    slugs = argv;
  }
  if (!slugs.length) fail('no event files found in events/');

  // Load the existing registry so building one event preserves the others.
  // It is a JS module rather than JSON: a bare JSON import needs an import
  // attribute in Node 22 and support varies by bundler, so this avoids the
  // whole question at runtime.
  // --all rebuilds the registry from scratch, so an event whose file was
  // deleted stops being served. A single-slug build merges, so it leaves the
  // other conferences alone.
  let registry = {};
  if (argv[0] !== '--all') {
    try {
      const prev = await readFile(p('lib', 'registry.js'), 'utf8');
      const m = prev.match(/export default ([\s\S]*);\s*$/);
      if (m) registry = JSON.parse(m[1]);
    } catch {}
  }

  console.log('');
  if (fonts.count) console.log(`  fonts: ${fonts.count} faces embedded (${(fonts.bytes/1024).toFixed(0)} KB)\n`);
  for (const slug of slugs) {
    const r = await buildOne(slug, shared);
    registry[slug] = r.entry;
    console.log(`  ${r.entry.eventName}  (${slug})`);
    console.log(`     partner   ${r.entry.partner || 'none'}`);
    console.log(`     giveaway  ${r.entry.giveaway ? 'on' : 'off'}`);
    console.log(`     language  ${r.entry.language}`);
    console.log(`     captions  ${r.entry.captions.length}`);
    console.log(`     audio     ${r.audio}`);
    console.log(`     hosted    /e/${slug}`);
    console.log(`     offline   dist/beat-the-bot-${slug}.html  (${(r.sizes.html / 1024).toFixed(0)} KB)`);
    for (const n of r.notes) console.log(`     note      ${n}`);
    console.log('');
  }

  const sorted = {};
  for (const k of Object.keys(registry).sort()) sorted[k] = registry[k];
  if (argv[0] === '--all') {
    // Drop hosted folders for events that no longer have a file.
    try {
      for (const d of await readdir(p('public', 'e'), { withFileTypes: true })) {
        if (d.isDirectory() && !registry[d.name]) {
          await rm(p('public', 'e', d.name), { recursive: true, force: true });
          console.log(`  removed /e/${d.name} (no event file any more)`);
        }
      }
    } catch {}
  }
  await writeFile(p('lib', 'registry.js'),
    '// Generated by tools/build.mjs. Do not edit by hand.\n' +
    '// One entry per event; the share page and the scorecard read this.\n' +
    'export default ' + JSON.stringify(sorted, null, 1) + ';\n');
  registry = sorted;
  const live = Object.keys(registry);
  console.log(`  registry: ${live.length} event${live.length === 1 ? '' : 's'} live  [${live.join(', ')}]`);
  console.log(`  stamp:    ${shared.stamp}\n`);
}

main().catch(e => fail(e.stack || String(e)));
