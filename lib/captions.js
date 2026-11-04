// Caption template library.
//
// One set of templates serves every conference. Event-specific words are tokens
// filled at build time ({event}, {partner}, {hashtags}) or at share time
// ({time}, {botTime}, {rank}, {correct}). Nothing here names a conference, so
// adding an event needs no new copy and two events never collide.
//
// A template that mentions the partner is skipped automatically when an event
// has no partner, so a solo booth never reads "Strike48 and ".

export const TEMPLATES = [
  "I raced an Agentic SOC at {event} and lost. It triaged a live attack in {botTime}s. My best was {time}s ({rank}). Work that normally costs me half an hour of pivoting between consoles was done before I finished reading the alert. Thanks Strike48 and {partner}. {hashtags}",
  "Something I learned at {event}. You can't out-click an Agentic SOC. {botTime}s to triage a live attack, and it still left the judgment call to me. Strike48 and {partner} are at the booth if you want a go. {hashtags}",
  "Raced an AI at {event} and lost on time, {time}s against {botTime}s. Still walked away happy. It did the grinding and I made the call. {hashtags}",
  "Every stand here has AI written on it somewhere. At {event}, Strike48 and {partner} actually let me race one. Live attack triaged in {botTime}s with a human approving every action. I scored {rank}. {hashtags}",
  "Went head to head with an Agentic SOC at the Strike48 and {partner} booth ({event}). It is faster than any analyst I know and that suits me fine. It clears the noise so the humans get to think. {hashtags}",
  "Beat the Bot at {event}. I got {correct}/3 in {time}s and ranked {rank}. The AI went 3/3 in {botTime}s. If your team is buried in tier 1 alerts, go and see what this does. {hashtags}",
  "The best thing I found at {event} was not a slide deck. It was a 60 second race against an Agentic SOC. It wins on speed and you leave understanding why that matters. Find Strike48 and {partner}. {hashtags}",
  "I have sat through a lot of AI SOC pitches. At {event}, Strike48 and {partner} handed me a controller and let me race the thing instead. {botTime}s triage, human in command. More demos should work like this. {hashtags}",
  "Took the Beat the Bot challenge at {event} and ranked {rank}. The machine correlates at machine speed. The analyst still owns the decision. That balance is what sold me. {hashtags}",
  "Leaving {event} fairly convinced the SOC of the next few years is human plus agent rather than one or the other. Raced the agent, scored {rank}, and watched it hand back the time I usually lose to triage. Thanks Strike48 and {partner}. {hashtags}",
  "One alert, three calls. How bad is it, what is it, and what do you do first. I took {time}s and got {correct}/3. The Agentic SOC at {event} made all three in {botTime}s. Humbling in the best way. {hashtags}",
  "Spent {time}s on a single alert at {event}. The agent spent {botTime}s. The gap is not about being clever, it is about how long correlation takes a human. Worth seeing at the Strike48 and {partner} stand. {hashtags}",
  "Tier 1 triage is the part of the job nobody misses. At {event} I watched an Agentic SOC do it in {botTime}s while I was still reading the alert. Ranked {rank}. Go and try it. {hashtags}",
  "{event}, and the most useful sixty seconds of my day was a race I lost to an AI. {time}s me, {botTime}s it. Strike48 and {partner} are worth a visit. {hashtags}",
  "My score at {event} was {correct}/3 in {time}s, ranked {rank}. The agent went 3/3 in {botTime}s. I am not upset about it. That speed is exactly what a buried SOC needs. {hashtags}",
  "Good demos let you touch the thing. At {event}, Strike48 and {partner} put an Agentic SOC in front of me and said race it. I lost. Learned more in a minute than I would from any deck. {hashtags}",
  "Ranked {rank} against an Agentic SOC at {event}. The point is not that it beat me. The point is it handed the decision straight back to a human once it had done the digging. {hashtags}",
  "If you are at {event} and your SOC is drowning in alerts, go and spend sixty seconds at the Strike48 and {partner} booth. The AI triages in {botTime}s. You will understand the pitch immediately. {hashtags}",
  "Took on the Agentic SOC at {event}. {time}s against {botTime}s, and I still got {correct}/3, which I will take. Analysts keep the judgment, the machine takes the grind. {hashtags}",
  "The thing I will remember from {event} is a sixty second race I lost to an agent. Scored {rank}. Thanks to Strike48 and {partner} for making the point properly. {hashtags}",
];

// Solo versions, used when an event has no partner. Same voice, no second name.
export const SOLO_FALLBACK = {
  0:  "I raced an Agentic SOC at {event} and lost. It triaged a live attack in {botTime}s. My best was {time}s ({rank}). Work that normally costs me half an hour of pivoting between consoles was done before I finished reading the alert. Thanks Strike48. {hashtags}",
  1:  "Something I learned at {event}. You can't out-click an Agentic SOC. {botTime}s to triage a live attack, and it still left the judgment call to me. Strike48 are at the booth if you want a go. {hashtags}",
  3:  "Every stand here has AI written on it somewhere. At {event}, Strike48 actually let me race one. Live attack triaged in {botTime}s with a human approving every action. I scored {rank}. {hashtags}",
  4:  "Went head to head with an Agentic SOC at the Strike48 booth ({event}). It is faster than any analyst I know and that suits me fine. It clears the noise so the humans get to think. {hashtags}",
  6:  "The best thing I found at {event} was not a slide deck. It was a 60 second race against an Agentic SOC. It wins on speed and you leave understanding why that matters. Find the Strike48 stand. {hashtags}",
  7:  "I have sat through a lot of AI SOC pitches. At {event}, Strike48 handed me a controller and let me race the thing instead. {botTime}s triage, human in command. More demos should work like this. {hashtags}",
  9:  "Leaving {event} fairly convinced the SOC of the next few years is human plus agent rather than one or the other. Raced the agent, scored {rank}, and watched it hand back the time I usually lose to triage. Thanks Strike48. {hashtags}",
  11: "Spent {time}s on a single alert at {event}. The agent spent {botTime}s. The gap is not about being clever, it is about how long correlation takes a human. Worth seeing at the Strike48 stand. {hashtags}",
  13: "{event}, and the most useful sixty seconds of my day was a race I lost to an AI. {time}s me, {botTime}s it. The Strike48 stand is worth a visit. {hashtags}",
  15: "Good demos let you touch the thing. At {event}, Strike48 put an Agentic SOC in front of me and said race it. I lost. Learned more in a minute than I would from any deck. {hashtags}",
  17: "If you are at {event} and your SOC is drowning in alerts, go and spend sixty seconds at the Strike48 booth. The AI triages in {botTime}s. You will understand the pitch immediately. {hashtags}",
  19: "The thing I will remember from {event} is a sixty second race I lost to an agent. Scored {rank}. Thanks to Strike48 for making the point properly. {hashtags}",
};

// "CyberCon 2026" -> "#CyberCon2026".  Strips punctuation, keeps digits.
export function eventHashtag(eventName) {
  const t = String(eventName || '').replace(/[^A-Za-z0-9]/g, '');
  return t ? '#' + t : '';
}

export function buildHashtags(eventName, extra) {
  const base = ['#AgenticAI', '#CyberSecurity', '#SOC', '#Strike48'];
  const ev = eventHashtag(eventName);
  const list = (ev ? [ev] : []).concat(Array.isArray(extra) ? extra : [], base);
  const seen = new Set(), out = [];
  for (const h of list) {
    const tag = h.startsWith('#') ? h : '#' + h;
    const k = tag.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(tag); }
  }
  return out.join(' ');
}

// Fill the build-time tokens, leaving the share-time ones in place.
export function captionsForEvent(ev) {
  const hashtags = buildHashtags(ev.eventName, ev.hashtags);
  const partner = (ev.partner && ev.partner.name) || '';
  return TEMPLATES.map((tpl, i) => {
    let t = tpl;
    if (!partner && SOLO_FALLBACK[i]) t = SOLO_FALLBACK[i];
    return t
      .replace(/\{event\}/g, ev.eventName)
      .replace(/\{partner\}/g, partner)
      .replace(/\{hashtags\}/g, hashtags);
  });
}

// Share-time fill. Used by the share page.
export function fillCaption(tpl, v) {
  return String(tpl)
    .replace(/\{time\}/g, v.time ?? '')
    .replace(/\{botTime\}/g, v.botTime ?? '3.5')
    .replace(/\{rank\}/g, v.rank ?? '')
    .replace(/\{correct\}/g, v.correct ?? '0');
}
