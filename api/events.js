// Lists the conferences currently live, for the Studio's right-hand panel.
// Reads the registry the build produced, so it always matches what is deployed.

import registry from '../lib/registry.js';

export default function handler(req, res) {
  // ?slug= returns the whole event as published, so the Studio can load it
  // back into the form instead of making you retype everything.
  const slug = req.query && req.query.slug;
  if (slug) {
    const e = registry[slug];
    res.setHeader('Cache-Control', 'no-store');
    if (!e) return res.status(404).json({ error: 'no such conference' });
    return res.status(200).json({ slug, ...(e.source || {}), card: e.card || {} });
  }

  const events = Object.values(registry)
    .map(e => ({
      slug: e.slug, eventName: e.eventName, venue: e.venue,
      partner: e.partner, language: e.language, giveaway: e.giveaway,
    }))
    .sort((a, b) => a.eventName.localeCompare(b.eventName));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ events });
}
