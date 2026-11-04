// Lists the conferences currently live, for the Studio's right-hand panel.
// Reads the registry the build produced, so it always matches what is deployed.

import registry from '../lib/registry.js';

export default function handler(req, res) {
  const events = Object.values(registry)
    .map(e => ({
      slug: e.slug, eventName: e.eventName, venue: e.venue,
      partner: e.partner, language: e.language, giveaway: e.giveaway,
    }))
    .sort((a, b) => a.eventName.localeCompare(b.eventName));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ events });
}
