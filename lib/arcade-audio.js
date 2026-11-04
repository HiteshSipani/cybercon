/* ===== arcade audio =====================================================
   Continuous music, an attract-mode announcer on the title screen, and a
   tenser bed during play. Everything is synthesised with the Web Audio API
   and spoken with the browser's own voice, so this adds no files and the
   offline booth build still makes zero network requests.

   Scenes follow the screen: title is the attract loop with the announcer,
   play is faster and darker with a clock pulse, score resolves, and the
   loop keeps running between rounds so the stand never falls silent.

   Browsers refuse to start audio until someone interacts with the page, so
   the first click or key press unlocks it and the title screen shows a
   small prompt until that happens.
   ====================================================================== */
(function (global) {
  'use strict';

  // The build injects window.__bb, which exposes the game's CONFIG and its
  // live MUTED flag. Both are const/let inside the game's own script scope and
  // are otherwise invisible from here.
  var BB = global.__bb || {};
  var GCFG = BB.cfg || global.CONFIG || {};
  var BAKED = GCFG.audio || {};

  // Anything changed in the sound panel is kept on this laptop and wins over
  // what was baked in, so the stand can be adjusted on the day without a
  // rebuild. Clearing it in the panel returns to the published settings.
  var LS_KEY = 'bb_audio_v1';
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveLocal(o) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(o)); } catch (e) {}
  }
  var LOCAL = loadLocal();
  function setting(k, dflt) {
    if (LOCAL[k] !== undefined) return LOCAL[k];
    if (BAKED[k] !== undefined) return BAKED[k];
    return dflt;
  }

  var ON = setting('music', true) !== false;
  var VOICE_ON = setting('voice', true) !== false;
  var SHOW_TEXT = setting('showText', true) !== false;
  var VOL = (function () { var v = setting('volume', 0.5); return typeof v === 'number' ? Math.max(0, Math.min(1, v)) : 0.5; })();
  var SAY_EVERY = (setting('attractSeconds', 14) || 14) * 1000;
  var CFG = { lines: setting('lines', BAKED.lines) };

  var A = null, master = null, limiter = null, musicGain = null, voiceGain = null,
      sfxGain = null, started = false, unlocked = false;
  // The slider is 0 to 1; this is what full means. Above 1 is real amplification,
  // which the limiter downstream keeps clean.
  var GAIN_MAX = 2.6;
  // Each bus has its own level so the three can be balanced against each
  // other. The game's own blips are the thing a player actually needs to
  // hear, so they sit well above the music by default.
  var LVL = {
    music: setting('musicLevel', 0.75),
    voice: setting('voiceLevel', 1.0),
    sfx:   setting('sfxLevel', 1.0),
  };
  var VOICE_LIFT = 1.7, SFX_LIFT = 2.4;
  // Pre-rendered arcade voice, keyed by the exact line. Shipped with the game
  // so the stand sounds identical on every laptop and works with no network.
  var CLIPS = global.__voiceClips || {};
  var decoded = {};
  // Present only in a voice-test build: every announcer voice, so they can be
  // compared in the game with the music underneath.
  var ALL_VOICES = global.__voiceStyles || null;
  // A supplied music track, either embedded as a data URI in the offline build
  // or a URL in the hosted one. When present it replaces the synthesised bed.
  var TRACK = global.__musicTrack || null;
  var trackSrc = null, trackFilter = null, trackReady = false;
  var activeStyle = setting('style', (GCFG.audio && GCFG.audio.style) || 'announcer');
  if (ALL_VOICES && ALL_VOICES[activeStyle]) CLIPS = ALL_VOICES[activeStyle];
  var scene = null, timerId = null, step = 0, nextT = 0, attractId = null, lineIdx = 0;

  // A minor. Low numbers are low notes; the sequencer turns them into Hz.
  var BASS  = [0, 0, 7, 0, 5, 0, 3, 0];
  var ARP   = [12, 15, 19, 24, 19, 15, 12, 15, 10, 14, 17, 22, 17, 14, 10, 14];
  var ROOT  = 55.0;                       // A1
  var hz = n => ROOT * Math.pow(2, n / 12);

  var SCENES = {
    // bpm, how loud, which layers are playing
    title: { bpm: 112, gain: 0.85, arp: 0.055, bass: 0.085, hat: 0.035, kick: 0.30, pulse: 0 },
    play:  { bpm: 132, gain: 1.00, arp: 0.022, bass: 0.105, hat: 0.050, kick: 0.38, pulse: 0.05 },
    score: { bpm: 100, gain: 0.70, arp: 0.045, bass: 0.060, hat: 0.018, kick: 0.20, pulse: 0 },
    quiet: { bpm: 100, gain: 0.35, arp: 0.030, bass: 0.040, hat: 0.012, kick: 0.12, pulse: 0 },
  };

  function ctx() {
    if (!A) {
      try { A = new (global.AudioContext || global.webkitAudioContext)(); }
      catch (e) { return null; }
      // Headroom. The slider used to drive master gain straight to a maximum
      // of 1.0, which on a laptop in a noisy hall is far too quiet. It now
      // drives up to GAIN_MAX through a limiter, so it can be pushed hard
      // without the music distorting when the announcer speaks over it.
      limiter = A.createDynamicsCompressor();
      limiter.threshold.value = -6; limiter.knee.value = 6; limiter.ratio.value = 12;
      limiter.attack.value = 0.004; limiter.release.value = 0.18;
      limiter.connect(A.destination);
      master = A.createGain(); master.gain.value = VOL * GAIN_MAX; master.connect(limiter);
      musicGain = A.createGain(); musicGain.gain.value = 0; musicGain.connect(master);
      voiceGain = A.createGain(); voiceGain.gain.value = VOICE_LIFT * LVL.voice; voiceGain.connect(master);
      // The game's blips are rerouted into this at build time.
      sfxGain = A.createGain(); sfxGain.gain.value = SFX_LIFT * LVL.sfx; sfxGain.connect(master);
      global.__arcadeCtx = A; global.__sfxBus = sfxGain;
    }
    return A;
  }

  /* ---------- one-shot voices ---------- */
  function osc(type, f, t, dur, peak, dest) {
    var o = A.createOscillator(), g = A.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || musicGain);
    o.start(t); o.stop(t + dur + 0.02);
    return o;
  }

  function kick(t, peak) {
    var o = A.createOscillator(), g = A.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.20);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 0.22);
  }

  var noiseBuf = null;
  function noise(t, dur, peak, hpHz) {
    if (!noiseBuf) {
      noiseBuf = A.createBuffer(1, A.sampleRate * 0.4, A.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var s = A.createBufferSource(); s.buffer = noiseBuf;
    var f = A.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hpHz || 7000;
    var g = A.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(musicGain);
    s.start(t); s.stop(t + dur + 0.02);
  }

  /* ---------- a supplied music track ---------- */
  function startTrack() {
    if (!TRACK || trackReady || !A) return;
    trackReady = true;
    // A lowpass that opens during play, so one track still has two moods.
    trackFilter = A.createBiquadFilter();
    trackFilter.type = 'lowpass';
    trackFilter.frequency.value = 2600;
    trackFilter.Q.value = 0.7;
    trackFilter.connect(musicGain);

    // Most music ends on a fade. Looping into that would drop the stand into
    // near-silence every time round, so the tail is measured and the loop is
    // set to end before it. A track prepared for looping is left alone.
    function loopEndOf(buf) {
      var d = buf.getChannelData(0), sr = buf.sampleRate;
      // One-second windows: fades last seconds, while beat-level energy swings
      // every fraction of one. At a shorter window the walk below trips over
      // the groove instead of following the fade.
      var win = Math.floor(sr * 1.0), n = Math.floor(d.length / win);
      if (n < 6) return buf.duration;
      var e = new Float32Array(n), i, j, sum;
      for (i = 0; i < n; i++) {
        sum = 0;
        for (j = 0; j < win; j += 8) sum += Math.abs(d[i * win + j]);
        e[i] = sum / (win / 8);
      }
      var sorted = Array.prototype.slice.call(e).sort(function (a, b) { return a - b; });
      var median = sorted[Math.floor(n / 2)];
      if (!median) return buf.duration;

      // Walk back from the end through the run where energy only falls. That
      // run is the fade; its start is where the loop should end. Looking for
      // a threshold crossing instead lands partway down the fade, which still
      // dips audibly every time round.
      var i2 = n - 1;
      if (e[i2] < median * 0.9) {
        while (i2 > n * 0.5 && e[i2 - 1] >= e[i2]) i2--;
      } else {
        return buf.duration;                 // no fade: already loop-ready
      }
      var end = (i2 * win) / sr;
      return (end > buf.duration * 0.4) ? end : buf.duration;
    }

    function play(buf) {
      trackSrc = A.createBufferSource();
      trackSrc.buffer = buf;
      trackSrc.loop = true;
      trackSrc.loopStart = 0;
      trackSrc.loopEnd = loopEndOf(buf);
      trackSrc.connect(trackFilter);
      trackSrc.start();
      applyScene(true);
    }
    function fail() { TRACK = null; trackReady = false; }   // fall back to the synth bed

    if (TRACK.indexOf('data:') === 0) {
      try { A.decodeAudioData(b64ToBytes(TRACK.slice(TRACK.indexOf(',') + 1)), play, fail); }
      catch (e) { fail(); }
    } else {
      fetch(TRACK).then(function (r) { return r.arrayBuffer(); })
        .then(function (b) { A.decodeAudioData(b, play, fail); })
        .catch(fail);
    }
  }

  /* ---------- the sequencer ---------- */
  // Web Audio needs notes scheduled slightly ahead of time; a bare setInterval
  // drifts audibly. This looks ahead and queues whatever falls in the window.
  function schedule() {
    var s = SCENES[scene] || SCENES.quiet;
    var spb = 60 / s.bpm / 4;                       // one sixteenth
    while (nextT < A.currentTime + 0.15) {
      var t = nextT, b = step % 16;

      // With a supplied track, only the clock pulse is layered on top.
      if (TRACK) {
        if (s.pulse && b % 8 === 0) osc('triangle', 1760, t, 0.05, s.pulse);
        step++; nextT += spb;
        continue;
      }
      if (s.bass && b % 2 === 0) {
        var bn = BASS[(b / 2) % BASS.length];
        osc('sawtooth', hz(bn + 12), t, spb * 1.7, s.bass);
        osc('square',  hz(bn),       t, spb * 1.7, s.bass * 0.55);
      }
      if (s.arp) osc('square', hz(ARP[b % ARP.length] + 24), t, spb * 0.85, s.arp);
      if (s.kick && (b === 0 || b === 8)) kick(t, s.kick);
      if (s.hat && b % 2 === 1) noise(t, 0.035, s.hat, 8000);
      // the clock pulse that makes play feel like it is running out
      if (s.pulse && b % 8 === 0) osc('triangle', 1760, t, 0.05, s.pulse);

      step++; nextT += spb;
    }
  }

  /* ---------- speech ---------- */
  var LINES = null;
  function lines() {
    if (LINES) return LINES;
    // Custom lines win. Otherwise use exactly the lines that were rendered to
    // audio, so the default set and the shipped clips can never drift apart.
    if (CFG.lines && CFG.lines.length) { LINES = CFG.lines.slice(); return LINES; }
    var keys = Object.keys(CLIPS);
    if (keys.length) { LINES = keys; return LINES; }
    LINES = [
      'Beat the Bot!',
      'Can you out-think an Agentic SOC?',
      'One alert. Three calls. Seconds on the clock.',
      'Think you are faster than artificial intelligence?',
      'Step up. Take the challenge.',
      'The machine is waiting.',
      'How fast can you triage?',
    ];
    return LINES;
  }

  var pickedVoice = null, voiceTried = false;
  function voice() {
    if (voiceTried) return pickedVoice;
    voiceTried = true;
    try {
      var vs = global.speechSynthesis.getVoices() || [];
      var en = vs.filter(v => /^en(-|_|$)/i.test(v.lang || ''));
      // Prefer a crisp built-in over a network voice, which would not work offline.
      var want = ['Daniel', 'Google UK English Male', 'Microsoft Guy', 'Microsoft David',
                  'Alex', 'Google US English', 'Rishi'];
      for (var i = 0; i < want.length; i++) {
        var hit = en.find(v => (v.name || '').indexOf(want[i]) >= 0);
        if (hit) { pickedVoice = hit; break; }
      }
      if (!pickedVoice && en.length) pickedVoice = en[0];
    } catch (e) {}
    return pickedVoice;
  }

  function b64ToBytes(b64) {
    var bin = atob(b64), u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }

  function duck(on) {
    if (!musicGain || !A) return;
    var s = SCENES[scene] || SCENES.quiet;
    musicGain.gain.cancelScheduledValues(A.currentTime);
    musicGain.gain.setTargetAtTime(on ? s.gain * 0.35 : s.gain, A.currentTime, 0.12);
  }

  function playClip(text, done) {
    var src = CLIPS[text];
    if (!src || !A) return false;
    function start(buf) {
      var n = A.createBufferSource();
      n.buffer = buf; n.connect(voiceGain);
      duck(true);
      n.onended = function () { duck(false); if (done) done(); };
      n.start();
    }
    if (decoded[text]) { start(decoded[text]); return true; }
    try {
      var data = b64ToBytes(src.slice(src.indexOf(',') + 1));
      A.decodeAudioData(data, function (buf) { decoded[text] = buf; start(buf); },
                              function () {});
      return true;
    } catch (e) { return false; }
  }

  // The shipped clip first. The browser's own voice only as a fallback, for a
  // line written after the clips were built.
  function say(text) {
    if (!VOICE_ON) return false;
    if (playClip(text)) return true;
    if (!global.speechSynthesis) return false;
    try {
      global.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(spoken(text));
      var v = voice(); if (v) u.voice = v;
      u.rate = 0.95; u.pitch = 0.75; u.volume = Math.min(1, VOL * 1.9);
      global.speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }

  // Matches the rewrites the clip generator uses, so the fallback voice does
  // not read SOC as "society".
  function spoken(t) {
    return String(t)
      .replace(/\bSOC\b/g, 'sock').replace(/\bSOCs\b/g, 'socks')
      .replace(/\bAI\b/g, 'A.I.').replace(/\bIR\b/g, 'I.R.')
      .replace(/\bMFA\b/g, 'M.F.A.').replace(/\bSIEM\b/g, 'seem')
      .replace(/\bStrike48\b/g, 'Strike forty eight');
  }

  // A short rising sting under the announcer, so the moment still reads as
  // arcade on a machine whose speech engine is missing or silent.
  function sting() {
    if (!A) return;
    var t = A.currentTime;
    [0, 4, 7, 12].forEach(function (n, i) {
      osc('square', hz(n + 36), t + i * 0.07, 0.18, 0.05);
    });
  }

  // The announcer also appears on screen. Speech depends on the machine
  // having a voice installed, which Windows and macOS do but a bare Linux
  // booth laptop may not, and an arcade cabinet shows its attract text anyway.
  var capEl = null;
  function caption(text) {
    if (!capEl) {
      capEl = document.createElement('div');
      capEl.id = 'attractLine';
      // A marquee across the top, clear of the control hints at the bottom
      // and of the SOUND button in the corner.
      capEl.style.cssText =
        'position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:55;' +
        'font-family:var(--mono,ui-monospace,monospace);font-size:14px;letter-spacing:2.5px;' +
        'text-transform:uppercase;color:#F5B301;text-shadow:0 0 20px rgba(245,179,1,.5);' +
        'background:rgba(10,17,32,.72);border:1px solid rgba(245,179,1,.35);' +
        'border-radius:999px;padding:9px 20px;' +
        'pointer-events:none;opacity:0;transition:opacity .45s;white-space:nowrap;' +
        'max-width:70vw;overflow:hidden;text-overflow:ellipsis';
      document.body.appendChild(capEl);
    }
    if (!SHOW_TEXT) { capEl.style.opacity = '0'; return; }
    capEl.textContent = text;
    capEl.style.opacity = '1';
    clearTimeout(capEl._t);
    capEl._t = setTimeout(function () { if (capEl) capEl.style.opacity = '0'; }, 4200);
  }
  function hideCaption() { if (capEl) { clearTimeout(capEl._t); capEl.style.opacity = '0'; } }

  function attractTick() {
    if (scene !== 'title' || !unlocked) return;
    sting();
    var L = lines(), line = L[lineIdx % L.length];
    lineIdx++;
    setTimeout(function () { caption(line); say(line); }, 260);
  }

  function startAttract() {
    stopAttract();
    attractId = setInterval(attractTick, SAY_EVERY);
    setTimeout(attractTick, 1200);          // one soon after landing, not instantly
  }
  function stopAttract() {
    if (attractId) { clearInterval(attractId); attractId = null; }
    hideCaption();
    try { global.speechSynthesis && global.speechSynthesis.cancel(); } catch (e) {}
  }


  /* ---------- the sound panel (Ctrl+Shift+S) ------------------------------
     Everything here is adjustable at the stand without a rebuild. Changes are
     kept on this laptop only. "Copy for the event file" hands back the exact
     JSON to paste into the Studio so the change becomes permanent. */
  // One place that sets how the bed sits for the current screen, whether that
  // bed is the synthesiser or a supplied track.
  function applyScene(immediate) {
    if (!A || !musicGain) return;
    var s = SCENES[scene] || SCENES.quiet;
    var g = (ON ? s.gain : 0) * LVL.music;
    if (TRACK) g *= 0.9;
    musicGain.gain.cancelScheduledValues(A.currentTime);
    musicGain.gain.setTargetAtTime(g, A.currentTime, immediate ? 0.05 : 0.25);
    if (trackFilter) {
      var hz = scene === 'play' ? 14000 : (scene === 'title' ? 3200 : 1800);
      trackFilter.frequency.cancelScheduledValues(A.currentTime);
      trackFilter.frequency.setTargetAtTime(hz, A.currentTime, 0.35);
    }
  }

  var panel = null;
  function row(label, hint, body) {
    return '<div style="margin-bottom:15px"><div style="font-size:12px;color:#8FA0BD;' +
           'margin-bottom:6px">' + label +
           (hint ? ' <span style="color:#5D6E8B">' + hint + '</span>' : '') + '</div>' +
           body + '</div>';
  }
  function slider(id, val) {
    return '<input type="range" id="' + id + '" min="0" max="150" value="' +
           Math.round(val * 100) + '" style="width:100%">';
  }
  function check(id, on, label, sub) {
    return '<label style="display:flex;gap:9px;align-items:flex-start;margin-bottom:8px;cursor:pointer">' +
      '<input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + ' style="margin-top:3px">' +
      '<span>' + label + (sub ? '<br><span style="color:#5D6E8B;font-size:12px">' + sub + '</span>' : '') +
      '</span></label>';
  }

  function togglePanel() {
    if (panel) { panel.parentNode.removeChild(panel); panel = null; return; }
    var curLines = (CFG.lines && CFG.lines.length) ? CFG.lines : lines();
    var voiceNames = ALL_VOICES ? Object.keys(ALL_VOICES) : [];

    panel = document.createElement('div');
    panel.id = 'soundPanel';
    panel.style.cssText =
      'position:fixed;inset:0;z-index:999;background:rgba(4,8,15,.84);display:flex;' +
      'align-items:flex-start;justify-content:center;padding:24px 16px;overflow:auto;' +
      'font:14px/1.5 ui-sans-serif,system-ui,sans-serif;color:#EAEFF8';
    panel.innerHTML =
      '<div style="background:#0E1726;border:1px solid #223149;border-radius:14px;padding:22px;max-width:540px;width:100%">' +
      '<div style="display:flex;align-items:center;margin-bottom:3px">' +
        '<div style="font-size:12px;letter-spacing:1.6px;color:#8FA0BD;font-weight:700;flex:1">SOUND</div>' +
        '<button id="spX" style="background:none;border:1px solid #223149;color:#EAEFF8;' +
        'border-radius:8px;padding:5px 11px;cursor:pointer">Close</button></div>' +
      '<div style="font-size:12px;color:#5D6E8B;margin-bottom:18px">Saved on this laptop. Ctrl+Shift+S to reopen.</div>' +

      '<div style="border-bottom:1px solid #1b2941;margin-bottom:15px;padding-bottom:4px">' +
        check('spMusic', ON, 'Arcade music', 'Plays continuously, opens up during a round.') +
        check('spVoice', VOICE_ON, 'Announcer', 'Calls out while the stand is idle.') +
        check('spText', SHOW_TEXT, 'Show the lines on screen', 'Marquee across the top.') +
      '</div>' +

      (voiceNames.length > 1
        ? row('Announcer voice', '',
            '<select id="spStyle" style="width:100%;background:#121D30;border:1px solid #223149;' +
            'color:#EAEFF8;border-radius:9px;padding:10px;font:inherit">' +
            voiceNames.map(function (n) {
              return '<option value="' + n + '"' + (n === activeStyle ? ' selected' : '') + '>' + n + '</option>';
            }).join('') + '</select>')
        : row('Announcer voice', '', '<div style="color:#5D6E8B;font-size:13px">' + activeStyle +
            ' &nbsp;<span style="color:#8FA0BD">Publish with every voice to switch here.</span></div>')) +

      row('Overall volume', '<span id="spVolN">' + Math.round(VOL * 100) + '%</span>', slider('spVol', VOL)) +
      row('Music level', '<span id="spMusN">' + Math.round(LVL.music * 100) + '%</span>', slider('spMus', LVL.music)) +
      row('Announcer level', '<span id="spVoiN">' + Math.round(LVL.voice * 100) + '%</span>', slider('spVoi', LVL.voice)) +
      row('Game sounds', '<span id="spSfxN">' + Math.round(LVL.sfx * 100) + '%</span> &middot; right and wrong answers',
          slider('spSfx', LVL.sfx)) +
      row('Announcer every', '<span id="spSecN">' + (SAY_EVERY / 1000) + 's</span>',
          '<input type="range" id="spSec" min="5" max="60" value="' + (SAY_EVERY / 1000) + '" style="width:100%">') +

      row('What it says', 'one line per row',
        '<textarea id="spLines" rows="7" style="width:100%;background:#121D30;border:1px solid #223149;' +
        'color:#EAEFF8;border-radius:9px;padding:10px;font:inherit;font-size:13px;resize:vertical">' +
        curLines.join('\n').replace(/</g, '&lt;') + '</textarea>' +
        '<div style="font-size:12px;color:#8FA0BD;margin-top:6px">A new line is read by this laptop’s ' +
        'own voice until you publish it in the Studio.</div>') +

      '<div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:6px">' +
        '<button id="spTest" style="background:#121D30;border:1px solid #223149;color:#EAEFF8;' +
          'border-radius:9px;padding:10px 15px;cursor:pointer">Hear it</button>' +
        '<button id="spCopy" style="background:#121D30;border:1px solid #223149;color:#EAEFF8;' +
          'border-radius:9px;padding:10px 15px;cursor:pointer">Copy for the event file</button>' +
        '<button id="spReset" style="background:none;border:1px solid #223149;color:#FF6B6B;' +
          'border-radius:9px;padding:10px 15px;cursor:pointer">Back to published</button>' +
        '<div style="flex:1"></div>' +
        '<button id="spSave" style="background:#F5B301;border:none;color:#0a1120;font-weight:700;' +
          'border-radius:9px;padding:10px 18px;cursor:pointer">Apply</button></div>' +
      '<div id="spMsg" style="font-size:12.5px;color:#2FBF71;margin-top:11px;min-height:17px"></div></div>';
    document.body.appendChild(panel);

    var $$ = function (id) { return document.getElementById(id); };
    [['spVol','spVolN','%'],['spMus','spMusN','%'],['spVoi','spVoiN','%'],
     ['spSfx','spSfxN','%'],['spSec','spSecN','s']].forEach(function (p2) {
      var el = $$(p2[0]); if (el) el.oninput = function () { $$(p2[1]).textContent = this.value + p2[2]; };
    });
    $$('spX').onclick = togglePanel;
    panel.addEventListener('keydown', function (e) { e.stopPropagation(); }, true);

    if (ALL_VOICES && $$('spStyle')) {
      $$('spStyle').onchange = function () {
        activeStyle = this.value;
        CLIPS = ALL_VOICES[activeStyle] || {};
        decoded = {}; LINES = null; lineIdx = 0;
        LOCAL.style = activeStyle; saveLocal(LOCAL);
        var L = lines(); caption(L[0]); say(L[0]);
        $$('spMsg').textContent = 'Now using the "' + activeStyle + '" voice.';
      };
    }

    function collect() {
      return {
        music: $$('spMusic').checked,
        voice: $$('spVoice').checked,
        showText: $$('spText').checked,
        volume: (parseInt($$('spVol').value, 10) || 0) / 100,
        musicLevel: (parseInt($$('spMus').value, 10) || 0) / 100,
        voiceLevel: (parseInt($$('spVoi').value, 10) || 0) / 100,
        sfxLevel: (parseInt($$('spSfx').value, 10) || 0) / 100,
        attractSeconds: parseInt($$('spSec').value, 10) || 14,
        lines: $$('spLines').value.split('\n').map(function (t) { return t.trim(); }).filter(Boolean),
        style: activeStyle,
      };
    }
    $$('spSave').onclick = function () {
      var o = collect(); saveLocal(o); applySettings(o);
      $$('spMsg').textContent = 'Applied and saved on this laptop.';
    };
    $$('spTest').onclick = function () {
      var o = collect(); applySettings(o);
      var L = (o.lines && o.lines.length) ? o.lines : lines();
      caption(L[0]); say(L[0]);
      // so the game-sounds slider can be judged against the music too
      if (typeof global.sWrong === 'function') setTimeout(global.sWrong, 900);
      if (typeof global.sCorrect === 'function') setTimeout(global.sCorrect, 1500);
    };
    $$('spCopy').onclick = function () {
      var o = collect(), json = JSON.stringify({ audio: o }, null, 2);
      try { navigator.clipboard.writeText(json); $$('spMsg').textContent = 'Copied. Paste it into the event file.'; }
      catch (e) { $$('spMsg').textContent = json; }
    };
    $$('spReset').onclick = function () {
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
      LOCAL = {};
      applySettings({
        music: BAKED.music !== false, voice: BAKED.voice !== false,
        showText: BAKED.showText !== false,
        volume: typeof BAKED.volume === 'number' ? BAKED.volume : 0.5,
        musicLevel: 0.75, voiceLevel: 1.0, sfxLevel: 1.0,
        attractSeconds: BAKED.attractSeconds || 14, lines: BAKED.lines,
      });
      $$('spMsg').textContent = 'Back to the published settings.';
      togglePanel(); togglePanel();
    };
  }

  function applySettings(o) {
    ON = o.music !== false;
    VOICE_ON = o.voice !== false;
    SHOW_TEXT = o.showText !== false;
    VOL = Math.max(0, Math.min(1.5, o.volume));
    if (o.musicLevel !== undefined) LVL.music = Math.max(0, Math.min(1.5, o.musicLevel));
    if (o.voiceLevel !== undefined) LVL.voice = Math.max(0, Math.min(1.5, o.voiceLevel));
    if (o.sfxLevel !== undefined) LVL.sfx = Math.max(0, Math.min(1.5, o.sfxLevel));
    SAY_EVERY = (o.attractSeconds || 14) * 1000;
    CFG.lines = (o.lines && o.lines.length) ? o.lines : undefined;
    LINES = null; lineIdx = 0;
    if (master) master.gain.value = VOL * GAIN_MAX;
    if (voiceGain) voiceGain.gain.value = VOICE_LIFT * LVL.voice;
    if (sfxGain) sfxGain.gain.value = SFX_LIFT * LVL.sfx;
    if (!SHOW_TEXT) hideCaption();
    applyScene(true);
    Arcade.setMuted(Arcade.muted);
    if (scene === 'title' && unlocked && !Arcade.muted) startAttract();
  }

  /* ---------- public ---------- */
  var Arcade = {
    muted: false,

    unlock: function () {
      if (unlocked || !ON) return;
      var c = ctx(); if (!c) return;
      if (c.state === 'suspended') c.resume();
      unlocked = true;
      var hint = document.getElementById('audioHint');
      if (hint) hint.style.display = 'none';
      // Some engines only populate the voice list after the first call.
      try { global.speechSynthesis && global.speechSynthesis.getVoices(); } catch (e) {}
      if (!started) { started = true; nextT = c.currentTime + 0.06; timerId = setInterval(schedule, 25); }
      startTrack();
      this.scene(scene || 'title');
    },

    scene: function (name) {
      var map = { title: 'title', play: 'play', score: 'score', share: 'score', board: 'quiet',
                  story: 'play', name: 'quiet' };
      var next = map[name] || 'quiet';
      var changed = next !== scene;
      scene = next;
      if (!A || !unlocked || this.muted) return;
      applyScene();
      if (scene === 'title') { if (changed || !attractId) startAttract(); }
      else stopAttract();
    },

    setMuted: function (m) {
      this.muted = !!m;
      if (!A) return;
      musicGain.gain.cancelScheduledValues(A.currentTime);
      var s = SCENES[scene] || SCENES.quiet;
      musicGain.gain.setTargetAtTime(this.muted || !ON ? 0 : s.gain, A.currentTime, 0.12);
      if (voiceGain) voiceGain.gain.setTargetAtTime(this.muted ? 0 : VOICE_LIFT * LVL.voice, A.currentTime, 0.08);
      if (sfxGain) sfxGain.gain.setTargetAtTime(this.muted ? 0 : SFX_LIFT * LVL.sfx, A.currentTime, 0.08);
      if (this.muted) stopAttract();
      else if (scene === 'title' && unlocked) startAttract();
    },

    // Called when a player commits to a round, so the announcer never talks
    // over someone who is already concentrating.
    engage: function () { stopAttract(); },
  };

  global.Arcade = Arcade;

  function isMuted() {
    if (BB.muted) { try { return !!BB.muted(); } catch (e) {} }
    if (typeof global.MUTED !== 'undefined') return !!global.MUTED;
    var btn = document.getElementById('mute');     // last resort: read the label
    return !!(btn && /OFF/i.test(btn.textContent || ''));
  }

  /* ---------- wiring ---------- */
  function wire() {
    if (!ON) return;

    // Unlock on the first interaction of any kind.
    var once = function () {
      Arcade.unlock();
      ['pointerdown', 'keydown', 'touchstart'].forEach(e =>
        document.removeEventListener(e, once, true));
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach(e =>
      document.addEventListener(e, once, true));

    // The prompt is its own button and swallows the event. Without this, the
    // gesture that unlocks the audio is also the gesture that starts a round,
    // so the attract loop would never be heard while the stand sits idle.
    var hint = document.getElementById('audioHint');
    if (hint) {
      ['pointerdown', 'click', 'keydown'].forEach(function (evt) {
        hint.addEventListener(evt, function (e) {
          e.preventDefault(); e.stopPropagation();
          once();
          if (hint.parentNode) hint.parentNode.removeChild(hint);
        }, true);
      });
    }

    // A gamepad button counts as interaction too, which is how most people
    // at the stand will touch the game first.
    var padWatch = setInterval(function () {
      if (unlocked) { clearInterval(padWatch); return; }
      var pads = (navigator.getGamepads && navigator.getGamepads()) || [];
      for (var i = 0; i < pads.length; i++) {
        var p = pads[i]; if (!p) continue;
        for (var b = 0; b < p.buttons.length; b++)
          if (p.buttons[b] && p.buttons[b].pressed) { once(); return; }
      }
    }, 250);

    // Ctrl+Shift+S opens the sound panel.
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault(); e.stopPropagation(); togglePanel();
      }
    }, true);

    // Follow the screen the game is on.
    if (typeof global.go === 'function') {
      var _go = global.go;
      global.go = function (n) { var r = _go.apply(this, arguments); try { Arcade.scene(n); } catch (e) {} return r; };
    }
    // Keep the existing SOUND button in charge of everything.
    if (typeof global.toggleMute === 'function') {
      var _tm = global.toggleMute;
      global.toggleMute = function () {
        var r = _tm.apply(this, arguments);
        try { Arcade.setMuted(isMuted()); } catch (e) {}
        return r;
      };
    }
    if (typeof global.startGame === 'function') {
      var _sg = global.startGame;
      global.startGame = function () { try { Arcade.engage(); } catch (e) {} return _sg.apply(this, arguments); };
    }

    // Built before anything plays, so the game's own sound code finds this
    // context and this bus rather than making a second one of its own.
    ctx();
    Arcade.muted = isMuted();
    Arcade.scene('title');

    // Poll the game's own mute flag as a safety net, so the music follows the
    // SOUND button however it was pressed: mouse, keyboard or controller.
    setInterval(function () {
      var m = isMuted();
      if (m !== Arcade.muted) Arcade.setMuted(m);
    }, 400);

    // Pause the loop if the stand laptop gets switched to another window.
    document.addEventListener('visibilitychange', function () {
      if (!A || !unlocked) return;
      if (document.hidden) { musicGain.gain.setTargetAtTime(0, A.currentTime, 0.1); stopAttract(); }
      else Arcade.setMuted(Arcade.muted);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})(window);
