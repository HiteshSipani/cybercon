// Personalised result page. The QR in the game points here.
//
// Event-aware: the game passes its slug as ?e=<slug>, so one deployment serves
// any number of conferences at once. Links that predate the slug still work,
// because an unknown slug falls back to matching ?ev= against the registry's
// event names, and failing that to whatever the link itself carries.

import registry from '../lib/registry.js';
import { fillCaption } from '../lib/captions.js';

const esc = s => String(s == null ? '' : s).replace(/[<>&"]/g, c =>
  ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

function resolveEvent(q) {
  const slug = q.e;
  if (slug && registry[slug]) return registry[slug];
  const name = q.ev;
  if (name) {
    const hit = Object.values(registry).find(
      ev => ev.eventName.toLowerCase() === String(name).toLowerCase());
    if (hit) return hit;
  }
  // Nothing matched. Serve the link's own values rather than another event's.
  return null;
}

export default function handler(req, res) {
  const q = req.query;
  const host = `https://${req.headers.host}`;
  const params = new URLSearchParams(q).toString();
  const img = `${host}/api/og?${params}`;
  const pageUrl = `${host}/r?${params}`;

  const ev = resolveEvent(q);
  const eventName = (ev && ev.eventName) || q.ev || 'the Strike48 booth';
  const partner = (ev && ev.partner) || q.partner || '';
  const partnerLi = (ev && ev.partnerLinkedIn) || q.pli || '';
  const strikeLi = (ev && ev.strikeLinkedIn) || q.sli || 'https://www.linkedin.com/company/strike48';
  const botTime = q.b || (ev && ev.botTime) || '3.5';

  const name = q.n || 'Analyst';
  const brand = partner ? `${partner} × Strike48` : 'Strike48';

  // Captions come from the event's registry entry, so two conferences running
  // at the same time never serve each other's copy.
  const caps = (ev && ev.captions && ev.captions.length)
    ? ev.captions
    : [`I raced an Agentic SOC at ${eventName} and lost. It triaged a live attack in {botTime}s. ` +
       `My best was {time}s ({rank}). #AgenticAI #CyberSecurity #SOC #Strike48`];

  const capIdx = Math.max(0, Math.min(caps.length - 1, parseInt(q.cap || '0', 10) || 0));
  const caption = fillCaption(caps[capIdx], {
    time: q.t, botTime, rank: q.r, correct: q.c,
  });
  const captionWithLink = caption + '\n\n' + pageUrl;
  const share = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(pageUrl)}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
  res.send(`<!doctype html><html lang="${esc((ev && ev.language) || 'en')}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)} · Agentic SOC Challenge</title>
<meta property="og:title" content="${esc(name)} raced the Agentic SOC">
<meta property="og:description" content="Beat the Bot at the ${esc(brand)} booth, ${esc(eventName)}.">
<meta property="og:image" content="${img}">
<meta name="twitter:card" content="summary_large_image">
<style>body{margin:0;background:#070C16;color:#EAEFF8;font-family:system-ui,sans-serif;display:flex;justify-content:center;padding:20px}
.w{max-width:640px;width:100%}img{width:100%;border-radius:14px;border:1px solid #243350}
textarea{width:100%;min-height:170px;margin-top:16px;background:#0f1728;color:#dbe4f2;border:1px solid #243350;border-radius:12px;padding:14px;font-size:15px;line-height:1.5}
.b{display:inline-block;margin-top:12px;margin-right:8px;background:#F5B301;color:#0a1120;font-weight:700;border:none;border-radius:10px;padding:14px 20px;font-size:16px;cursor:pointer;text-decoration:none}
.g{background:transparent;border:1px solid #243350;color:#EAEFF8}
.g2{background:#F5B301;color:#0a1120;font-weight:700;border:none}
.tip{font-size:13px;color:#8fa0bd;margin:8px 0 4px}</style></head>
<body><div class="w">
<img src="${img}" alt="scorecard">
<textarea id="cap" readonly>${esc(caption)}</textarea>
<button class="b g2" id="appBtn">📱 Open the LinkedIn app</button>
<button class="b g" id="webBtn">💻 Post on the website</button>
<div class="tip" id="tip">The caption is copied automatically. If the LinkedIn post box comes up empty, just paste.</div>
<button class="b g" id="copyBtn">Copy caption + link (for a normal post)</button>
<a class="b g" href="${img}" download="agentic-soc.png">Save image</a>
<a class="b g" href="${esc(strikeLi)}" target="_blank" rel="noopener">Follow Strike48</a>
${partner && partnerLi ? `<a class="b g" href="${esc(partnerLi)}" target="_blank" rel="noopener">Follow ${esc(partner)}</a>` : ''}
<script>
var CAP_LINK = ${JSON.stringify(captionWithLink)};
var WEB_SHARE = ${JSON.stringify(share)};
(function(){
  var appBtn=document.getElementById('appBtn'), webBtn=document.getElementById('webBtn'),
      copyBtn=document.getElementById('copyBtn'), tip=document.getElementById('tip');

  function copyCaption(){
    try{ var t=document.getElementById('cap'); t.focus(); t.setSelectionRange(0,t.value.length); document.execCommand('copy'); }catch(e){}
    try{ if(navigator.clipboard){ navigator.clipboard.writeText(CAP_LINK); } }catch(e){}
  }

  copyBtn.addEventListener('click', function(){ copyCaption(); copyBtn.textContent='Copied caption + link'; });

  appBtn.addEventListener('click', function(){
    copyCaption();
    tip.textContent='Caption copied. In LinkedIn: tap Post, long-press the box, Paste.';
    appBtn.textContent='Opening LinkedIn\\u2026';
    var left=false;
    function gone(){ left=true; }
    document.addEventListener('visibilitychange',gone);
    window.addEventListener('pagehide',gone);
    window.addEventListener('blur',gone);
    setTimeout(function(){
      document.removeEventListener('visibilitychange',gone);
      window.removeEventListener('pagehide',gone);
      window.removeEventListener('blur',gone);
      if(!left && document.visibilityState==='visible'){
        tip.textContent='Could not open the LinkedIn app. Use \\u201cPost on the website\\u201d below. Your caption is already copied.';
        appBtn.textContent='App not found, use the website';
      }
    },1800);
    if(/android/i.test(navigator.userAgent||'')){
      window.location.href='intent://feed#Intent;scheme=linkedin;package=com.linkedin.android;S.browser_fallback_url='+encodeURIComponent(WEB_SHARE)+';end';
    } else {
      try{ window.location.href='linkedin://feed'; }catch(e){}
      setTimeout(function(){ if(!left){ try{ window.location.href='linkedin://'; }catch(e){} } },400);
    }
  });

  webBtn.addEventListener('click', function(){
    copyCaption();
    window.open(WEB_SHARE,'_blank');
    webBtn.textContent='Caption copied, paste into the post box';
    tip.textContent='The scorecard preview is added by LinkedIn automatically.';
  });
})();
</script>
</div></body></html>`);
}
