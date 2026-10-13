// Personalised result page. The QR in the game points here (/r?n=...&co=...).
// Carries OG tags so a LinkedIn share shows the player's card + caption.
export default function handler(req, res) {
  const q = req.query;
  const host = `https://${req.headers.host}`;
  const params = new URLSearchParams(q).toString();
  const img = `${host}/api/og?${params}`;
  const name = q.n || 'Analyst';
  const partner = q.partner || '';
  const strikeLi = q.sli || 'https://www.linkedin.com/company/strike48';
  const partnerLi = q.pli || 'https://www.linkedin.com/company/netpoleon-anz/';
  const brand = partner ? (partner + ' × Strike48') : 'Strike48';
  const partnerTag = partner ? ('Tag @Strike48 and @' + partner) : 'Tag @Strike48';
  const withPartner = partner || 'Strike48';
  const caps = [
    `I raced an Agentic SOC at ${q.ev||'CyberCon 2026'} and lost. It triaged a live attack in ${q.b||'3.5'}s. My best was ${q.t||''}s (${q.r||''}). Work that normally costs me half an hour of pivoting between consoles was done before I finished reading the alert. Thanks Strike48 and Netpoleon. #CyberCon2026 #AgenticAI #CyberSecurity #SOC #Strike48`,
    `Something I learned at ${q.ev||'CyberCon 2026'}. You can't out-click an Agentic SOC. ${q.b||'3.5'}s to triage a live attack, and it still left the judgment call to me. Strike48 and Netpoleon are at the booth if you want a go. #CyberCon2026 #AgenticAI #SOC #Strike48`,
    `Raced an AI at ${q.ev||'CyberCon 2026'} and lost on time, ${q.t||''}s against ${q.b||'3.5'}s. Still walked away happy. It did the grinding and I made the call. #CyberCon2026 #CyberSecurity #AgenticAI #Strike48`,
    `Every stand at the MCEC this week has AI written on it somewhere. At ${q.ev||'CyberCon 2026'}, Strike48 and Netpoleon actually let me race one. Live attack triaged in ${q.b||'3.5'}s with a human approving every action. I scored ${q.r||''}. #CyberCon2026 #SOC #AgenticAI #Strike48`,
    `Went head to head with an Agentic SOC at the Strike48 and Netpoleon booth (${q.ev||'CyberCon 2026'}). It is faster than any analyst I know and that suits me fine. It clears the noise so the humans get to think. #CyberCon2026 #CyberSecurity #AgenticAI #Strike48`,
    `Beat the Bot at ${q.ev||'CyberCon 2026'}. I got ${q.c||0}/3 in ${q.t||''}s and ranked ${q.r||''}. The AI went 3/3 in ${q.b||'3.5'}s. If your team is buried in tier 1 alerts, go and see what this does. #CyberCon2026 #SOC #AgenticAI #Strike48`,
    `The best thing I found at ${q.ev||'CyberCon 2026'} was not a slide deck. It was a 60 second race against an Agentic SOC. It wins on speed and you leave understanding why that matters. Find Strike48 and Netpoleon. #CyberCon2026 #CyberSecurity #SOC #Strike48`,
    `I have sat through a lot of AI SOC pitches. At ${q.ev||'CyberCon 2026'}, Strike48 and Netpoleon handed me a controller and let me race the thing instead. ${q.b||'3.5'}s triage, human in command. More demos should work like this. #CyberCon2026 #SOC #AgenticAI #Strike48`,
    `Took the Beat the Bot challenge at ${q.ev||'CyberCon 2026'} and ranked ${q.r||''}. The machine correlates at machine speed. The analyst still owns the decision. That balance is what sold me. #CyberCon2026 #AgenticAI #SOC #Strike48`,
    `Leaving ${q.ev||'CyberCon 2026'} fairly convinced the SOC of the next few years is human plus agent rather than one or the other. Raced the agent, scored ${q.r||''}, and watched it hand back the time I usually lose to triage. Thanks Strike48 and Netpoleon. #CyberCon2026 #SOC #AgenticAI #CyberSecurity #Strike48`,
    `One alert, three calls. How bad is it, what is it, and what do you do first. I took ${q.t||''}s and got ${q.c||0}/3. The Agentic SOC at ${q.ev||'CyberCon 2026'} made all three in ${q.b||'3.5'}s. Humbling in the best way. #CyberCon2026 #SOC #AgenticAI #Strike48`,
    `Spent ${q.t||''}s on a single alert at ${q.ev||'CyberCon 2026'}. The agent spent ${q.b||'3.5'}s. The gap is not about being clever, it is about how long correlation takes a human. Worth seeing at the Strike48 and Netpoleon stand. #CyberCon2026 #CyberSecurity #SOC #Strike48`,
    `Tier 1 triage is the part of the job nobody misses. At ${q.ev||'CyberCon 2026'} I watched an Agentic SOC do it in ${q.b||'3.5'}s while I was still reading the alert. Ranked ${q.r||''}. Go and try it. #CyberCon2026 #SOC #AgenticAI #Strike48`,
    `Melbourne, ${q.ev||'CyberCon 2026'}, and the most useful sixty seconds of my day was losing a race to an AI. ${q.t||''}s for me, ${q.b||'3.5'}s for it. Strike48 and Netpoleon are worth a visit. #CyberCon2026 #CyberSecurity #AgenticAI #Strike48`,
    `My score at ${q.ev||'CyberCon 2026'} was ${q.c||0}/3 in ${q.t||''}s, ranked ${q.r||''}. The agent went 3/3 in ${q.b||'3.5'}s. I am not upset about it. That speed is exactly what a buried SOC needs. #CyberCon2026 #SOC #AgenticAI #Strike48`,
    `Good demos let you touch the thing. At ${q.ev||'CyberCon 2026'}, Strike48 and Netpoleon put an Agentic SOC in front of me and said race it. I lost. Learned more in a minute than I would from any deck. #CyberCon2026 #CyberSecurity #SOC #Strike48`,
    `Ranked ${q.r||''} against an Agentic SOC at ${q.ev||'CyberCon 2026'}. The point is not that it beat me. The point is it handed the decision straight back to a human once it had done the digging. #CyberCon2026 #AgenticAI #SOC #Strike48`,
    `If you are at ${q.ev||'CyberCon 2026'} and your SOC is drowning in alerts, go and spend sixty seconds at the Strike48 and Netpoleon booth. The AI triages in ${q.b||'3.5'}s. You will understand the pitch immediately. #CyberCon2026 #SOC #CyberSecurity #Strike48`,
    `Took on the Agentic SOC at ${q.ev||'CyberCon 2026'}. ${q.t||''}s against ${q.b||'3.5'}s, and I still got ${q.c||0}/3, which I will take. Analysts keep the judgment, the machine takes the grind. #CyberCon2026 #AgenticAI #SOC #Strike48`,
    `Three days in Melbourne and the thing I will remember from ${q.ev||'CyberCon 2026'} is a sixty second race I lost to an agent. Scored ${q.r||''}. Thanks to Strike48 and Netpoleon for making the point properly. #CyberCon2026 #CyberSecurity #AgenticAI #SOC #Strike48`
  ];
  const capIdx = Math.max(0, Math.min(caps.length-1, parseInt(q.cap||'0',10) || 0));
  const pageUrl = host + '/r?' + params;
  // caption first, then the link a few lines down (LinkedIn turns it into a preview card)
  const caption = caps[capIdx];                       // text only
  const captionWithLink = caps[capIdx] + "\n\n" + pageUrl;  // for the plain feed composer
  const share = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(host + '/r?' + params)}`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${name} · Agentic SOC Challenge</title>
<meta property="og:title" content="${name} raced the Agentic SOC">
<meta property="og:description" content="Beat the Bot at the ${brand} booth — CyberCon 2026.">
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
<textarea id="cap" readonly>${caption.replace(/</g,'&lt;')}</textarea>
<button class="b g2" id="appBtn">\ud83d\udcf1 Open the LinkedIn app</button>
<button class="b g" id="webBtn">\ud83d\udcbb Post on the website</button>
<div class="tip" id="tip">The caption is copied automatically \u2014 if the LinkedIn post box comes up empty, just paste.</div>
<button class="b g" onclick="var v=this.getAttribute('data-c');navigator.clipboard&&navigator.clipboard.writeText(v);this.textContent='Copied caption + link'" data-c="${captionWithLink.replace(/"/g,'&quot;')}">Copy caption + link (for a normal post)</button>
<a class="b g" href="${img}" download="agentic-soc.png">Save image</a>
<a class="b g" href="${strikeLi}" target="_blank">Follow Strike48</a>
${partner && partnerLi ? `<a class="b g" href="${partnerLi}" target="_blank">Follow ${partner}</a>` : ''}
<script>
var CAP_TEXT = ${JSON.stringify(caption)};
var CAP_LINK = ${JSON.stringify(captionWithLink)};
var WEB_SHARE = ${JSON.stringify(share)};
(function(){
  var appBtn=document.getElementById('appBtn'), webBtn=document.getElementById('webBtn'), tip=document.getElementById('tip');

  function copyCaption(){
    try{ var t=document.getElementById('cap'); t.focus(); t.setSelectionRange(0,t.value.length); document.execCommand('copy'); }catch(e){}
    try{ if(navigator.clipboard){ navigator.clipboard.writeText(CAP_LINK); } }catch(e){}
  }

  appBtn.addEventListener('click', function(){
    copyCaption();
    tip.textContent='Caption copied. In LinkedIn: tap Post \\u2192 long-press the box \\u2192 Paste.';
    appBtn.textContent='Opening LinkedIn\\u2026';

    // Detect whether the app actually took over: if it does, this page goes to the background.
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
        tip.textContent='Couldn\\u2019t open the LinkedIn app \\u2014 use \\u201cPost on the website\\u201d below. Your caption is already copied.';
        appBtn.textContent='App not found \\u2014 use the website';
      }
    },1800);

    if(/android/i.test(navigator.userAgent||'')){
      // Android: intent URL targets the app directly and auto-falls back to the web.
      window.location.href='intent://feed#Intent;scheme=linkedin;package=com.linkedin.android;S.browser_fallback_url='+encodeURIComponent(WEB_SHARE)+';end';
    } else {
      try{ window.location.href='linkedin://feed'; }catch(e){}
      setTimeout(function(){ if(!left){ try{ window.location.href='linkedin://'; }catch(e){} } },400);
    }
  });

  webBtn.addEventListener('click', function(){
    copyCaption();
    window.open(WEB_SHARE,'_blank');
    webBtn.textContent='Caption copied \\u2014 paste into the post box';
    tip.textContent='The scorecard preview is added by LinkedIn automatically.';
  });
})();
</script>
</div></body></html>`);
}
