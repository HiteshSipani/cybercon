// Publish endpoint for the Event Studio.
//
// Takes the form payload, writes the event file and its logos to the repo as a
// single commit, and lets Vercel's Git integration build and deploy. One commit
// means one deploy, and the repo keeps the history, so any event can be rolled
// back with a revert.
//
// Environment variables (set once, in Vercel > Settings > Environment Variables):
//   ADMIN_PASSWORD   what the Studio asks for before publishing
//   GITHUB_TOKEN     a fine-grained token with Contents: read and write on this repo
//   GITHUB_REPO      owner/repo, e.g. strike48/beat-the-bot
//   GITHUB_BRANCH    optional, defaults to main

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
  'image/svg+xml': 'svg', 'image/heic': 'heic', 'image/heif': 'heif',
  'image/avif': 'avif', 'image/gif': 'gif',
};
const MAX_LOGO = 8 * 1024 * 1024;

function bad(res, code, error) { res.status(code).json({ error }); return null; }

// Constant-time-ish compare so the password cannot be guessed by timing.
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function parseDataUrl(dataUrl) {
  const m = /^data:([^;,]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) return null;
  const [, type, b64] = m;
  if (!EXT[type]) return { error: `unsupported image type ${type}` };
  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length > MAX_LOGO) return { error: 'logo is larger than 8 MB' };
  return { ext: EXT[type], b64, bytes: bytes.length };
}

function validate(ev) {
  const errs = [];
  if (!ev || typeof ev !== 'object') return ['no event supplied'];
  if (!ev.eventName || !String(ev.eventName).trim()) errs.push('a conference name is required');
  if (!ev.slug || !SLUG_RE.test(ev.slug)) errs.push('the URL name must be lowercase words joined by hyphens');
  if (ev.botTime != null && !(ev.botTime > 0 && ev.botTime < 60)) errs.push('the AI time must be between 0 and 60 seconds');
  if (ev.partner && !String(ev.partner.name || '').trim()) errs.push('a partner name is required when the partner switch is on');
  if (ev.giveaway && ev.giveaway.enabled && !String(ev.giveaway.prize || '').trim())
    errs.push('name the prize, or switch the giveaway off');
  if (ev.language && !/^[a-z]{2}(-[A-Z]{2})?$/.test(ev.language)) errs.push('language looks wrong');
  for (const [field, max] of [['eventName', 120], ['venue', 160], ['booth', 40]])
    if (ev[field] && String(ev[field]).length > max) errs.push(`${field} is too long`);
  return errs;
}

async function gh(path, token, init = {}) {
  const r = await fetch((process.env.GITHUB_API || 'https://api.github.com') + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'beat-the-bot-studio',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await r.text();
  let body; try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!r.ok) {
    const e = new Error(body.message || `GitHub ${r.status}`);
    e.status = r.status; e.body = body;
    throw e;
  }
  return body;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'POST only');

  const { ADMIN_PASSWORD, GITHUB_TOKEN, GITHUB_REPO } = process.env;
  const BRANCH = process.env.GITHUB_BRANCH || 'main';

  // Authenticate first. Reporting what is or is not configured to an
  // unauthenticated caller tells a stranger how this deployment is wired.
  if (!ADMIN_PASSWORD) {
    return bad(res, 500, 'The Studio is not configured yet. Set ADMIN_PASSWORD in Vercel ' +
                         'under Settings, Environment Variables, then redeploy.');
  }
  if (!same(req.headers['x-admin-password'] || '', ADMIN_PASSWORD)) {
    return bad(res, 401, 'That password is not right.');
  }
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return bad(res, 500,
      'Publishing is not configured yet. Set GITHUB_TOKEN and GITHUB_REPO ' +
      'in Vercel under Settings, Environment Variables, then redeploy.');
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const ev = body.event;
  const logos = body.logos || {};
  const keep = body.keep || null;

  const errs = validate(ev);
  if (errs.length) return bad(res, 400, errs.join('. '));

  // ---- assemble the files this commit will contain ----------------------
  const slug = ev.slug;
  const files = [];
  const record = {
    eventName: String(ev.eventName).trim(),
    venue: String(ev.venue || '').trim(),
    booth: String(ev.booth || '').trim(),
    language: ev.language || 'en',
    botTime: ev.botTime ?? 3.5,
  };
  if (Array.isArray(ev.hashtags) && ev.hashtags.length) record.hashtags = ev.hashtags;
  if (ev.logos && typeof ev.logos === 'object') {
    const num = (v, lo, hi, d) => {
      const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
    };
    const pos = v => (v === 'left' || v === 'right') ? v : undefined;
    record.logos = {
      cardEventW: num(ev.logos.cardEventW, 60, 500, 233),
      cardEventH: num(ev.logos.cardEventH, 20, 180, 80),
      cardPartnerW: num(ev.logos.cardPartnerW, 60, 500, 288),
      cardPartnerH: num(ev.logos.cardPartnerH, 20, 180, 42),
      gameEvent: num(ev.logos.gameEvent, 12, 160, 63),
      gameStrike: num(ev.logos.gameStrike, 12, 160, 38),
      gamePartner: num(ev.logos.gamePartner, 12, 160, 38),
      posEvent: pos(ev.logos.posEvent) || 'left',
      posStrike: pos(ev.logos.posStrike) || 'right',
      posPartner: pos(ev.logos.posPartner) || 'right',
    };
  }
  if (Array.isArray(ev.captions)) {
    const caps = ev.captions.map(c => String(c).trim())
                            .filter(c => c && c.length <= 1200).slice(0, 40);
    if (caps.length) record.captions = caps;
  }

  for (const [key, field] of [['logo', 'logo'], ['partnerLogo', 'partnerLogo']]) {
    const f = logos[key];
    // Editing an event without re-uploading a logo keeps the published one.
    // The Studio sends the stored filename, because guessing the extension
    // would break any logo that was uploaded as SVG, WebP or HEIC.
    if ((!f || !f.dataUrl) && keep && typeof keep[key] === 'string' && keep[key]) {
      if (!/^[a-z0-9][a-z0-9._-]*$/i.test(keep[key])) return bad(res, 400, 'bad logo reference');
      if (key === 'logo') record.logo = keep[key];
      else record._partnerLogoFile = keep[key];
      continue;
    }
    if (!f || !f.dataUrl) continue;
    const parsed = parseDataUrl(f.dataUrl);
    if (!parsed) return bad(res, 400, `could not read the ${key}`);
    if (parsed.error) return bad(res, 400, `${key}: ${parsed.error}`);
    const name = `${slug}-${key === 'logo' ? 'event' : 'partner'}.${parsed.ext}`;
    files.push({ path: `events/${name}`, b64: parsed.b64 });
    if (key === 'logo') record.logo = name; else record._partnerLogoFile = name;
  }

  if (ev.partner) {
    record.partner = { name: String(ev.partner.name).trim() };
    if (record._partnerLogoFile) record.partner.logo = record._partnerLogoFile;
    if (ev.partner.linkedIn) record.partner.linkedIn = String(ev.partner.linkedIn).trim();
  }
  delete record._partnerLogoFile;

  if (ev.audio && typeof ev.audio === 'object') {
    record.audio = {
      music: ev.audio.music !== false,
      voice: ev.audio.voice !== false,
      volume: Math.max(0, Math.min(1, Number(ev.audio.volume) || 0.5)),
      attractSeconds: Math.max(5, Math.min(120, parseInt(ev.audio.attractSeconds, 10) || 14)),
      showText: ev.audio.showText !== false,
      allVoices: !!ev.audio.allVoices,
    };
    const STYLES = ['announcer', 'chip', 'robot', 'pa', 'clear', 'deep', 'mk', 'mkLite'];
    if (STYLES.indexOf(ev.audio.style) >= 0) record.audio.style = ev.audio.style;
    // Only a track already committed to events/ can be referenced; an
    // arbitrary path here would be a way to read files out of the repo.
    if (typeof ev.audio.track === 'string' && /^[a-z0-9][a-z0-9._-]*\.mp3$/i.test(ev.audio.track))
      record.audio.track = ev.audio.track;
    if (Array.isArray(ev.audio.lines)) {
      const ls = ev.audio.lines.map(l => String(l).trim())
                               .filter(l => l && l.length <= 140).slice(0, 20);
      if (ls.length) record.audio.lines = ls;
    }
  }

  record.giveaway = (ev.giveaway && ev.giveaway.enabled)
    ? { enabled: true,
        prize: String(ev.giveaway.prize).trim(),
        drawTime: String(ev.giveaway.drawTime || '').trim(),
        claimSeconds: ev.giveaway.claimSeconds ?? 10 }
    : { enabled: false };

  files.push({
    path: `events/${slug}.json`,
    b64: Buffer.from(JSON.stringify(record, null, 2) + '\n', 'utf8').toString('base64'),
  });

  // ---- one atomic commit via the Git Data API ---------------------------
  // Writing files one by one through the contents API would fire a separate
  // deploy per file, and a half-applied event could go live.
  const [owner, repo] = GITHUB_REPO.split('/');
  if (!owner || !repo) return bad(res, 500, 'GITHUB_REPO should look like owner/repo');
  const base = `/repos/${owner}/${repo}`;

  try {
    const ref = await gh(`${base}/git/ref/heads/${BRANCH}`, GITHUB_TOKEN);
    const headSha = ref.object.sha;
    const headCommit = await gh(`${base}/git/commits/${headSha}`, GITHUB_TOKEN);

    const blobs = [];
    for (const f of files) {
      const blob = await gh(`${base}/git/blobs`, GITHUB_TOKEN, {
        method: 'POST', body: JSON.stringify({ content: f.b64, encoding: 'base64' }),
      });
      blobs.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }

    const tree = await gh(`${base}/git/trees`, GITHUB_TOKEN, {
      method: 'POST', body: JSON.stringify({ base_tree: headCommit.tree.sha, tree: blobs }),
    });

    const commit = await gh(`${base}/git/commits`, GITHUB_TOKEN, {
      method: 'POST',
      body: JSON.stringify({
        message: `Event: ${record.eventName}\n\nPublished from the Event Studio.`,
        tree: tree.sha,
        parents: [headSha],
      }),
    });

    await gh(`${base}/git/refs/heads/${BRANCH}`, GITHUB_TOKEN, {
      method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }),
    });

    return res.status(200).json({
      ok: true,
      slug,
      commit: commit.sha.slice(0, 7),
      files: files.map(f => f.path),
      message: `${record.eventName} committed. Vercel is building now, and it goes live at /e/${slug} in about a minute.`,
    });
  } catch (e) {
    if (e.status === 401 || e.status === 403)
      return bad(res, 500, 'GitHub refused the token. Check GITHUB_TOKEN has Contents read and write on this repo.');
    if (e.status === 404)
      return bad(res, 500, `GitHub could not find ${GITHUB_REPO} on branch ${BRANCH}. Check GITHUB_REPO and GITHUB_BRANCH.`);
    if (e.status === 422)
      return bad(res, 500, 'GitHub rejected the commit, usually because the branch moved. Try publishing again.');
    return bad(res, 500, 'Publish failed: ' + e.message);
  }
}
