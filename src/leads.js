// Pure lead-processing logic: turn raw OpenStreetMap elements into clean,
// scored sales leads. Kept network-free so it's fully unit-testable.
//
// Scoring is tuned for an agency selling websites / digital presence:
// a business with NO website is the hottest lead (it needs exactly what you
// sell), provided you can actually reach them (phone/email).

const CONTACT_FIELDS = ['phone', 'email', 'website'];

// Map an OSM element's tags to a human-readable category.
export function categoryOf(tags = {}) {
  if (tags.shop) return titleCase(tags.shop);
  if (tags.amenity) return titleCase(tags.amenity);
  if (tags.tourism) return titleCase(tags.tourism);
  if (tags.craft) return titleCase(tags.craft);
  if (tags.office) return `${titleCase(tags.office)} office`;
  return 'Business';
}

function titleCase(s) {
  return String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildAddress(tags = {}) {
  const parts = [
    [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
    tags['addr:suburb'] || tags['addr:neighbourhood'],
    tags['addr:city'] || tags['addr:town'] || tags['addr:village'],
    tags['addr:postcode'],
  ].filter(Boolean);
  return parts.join(', ');
}

function cleanPhone(raw) {
  if (!raw) return '';
  return raw.split(';')[0].trim();
}

function cleanWebsite(tags = {}) {
  const w = tags.website || tags['contact:website'] || tags.url || '';
  return w.split(';')[0].trim();
}

function socialOnly(tags = {}) {
  return Boolean(tags['contact:facebook'] || tags['contact:instagram'] || tags.facebook || tags.instagram);
}

/** Convert one OSM element to a lead object (or null if it has no name). */
export function elementToLead(el) {
  const tags = el.tags || {};
  const name = tags.name || tags['name:en'];
  if (!name) return null;

  const lead = {
    id: `${el.type}/${el.id}`,
    name: name.trim(),
    category: categoryOf(tags),
    address: buildAddress(tags),
    phone: cleanPhone(tags.phone || tags['contact:phone'] || tags['contact:mobile']),
    email: (tags.email || tags['contact:email'] || '').split(';')[0].trim(),
    website: cleanWebsite(tags),
    hasSocial: socialOnly(tags),
    openingHours: tags.opening_hours || '',
    lat: el.lat ?? el.center?.lat ?? null,
    lon: el.lon ?? el.center?.lon ?? null,
  };
  return { ...lead, ...scoreLead(lead) };
}

/**
 * Score a lead 0-100 (higher = better prospect for a website/digital pitch)
 * and explain why. Returns { score, tier, reasons[], contactable }.
 */
export function scoreLead(lead) {
  let score = 0;
  const reasons = [];

  if (!lead.website) {
    score += 50;
    reasons.push('No website — strong candidate for a web-design pitch');
  } else {
    score += 8;
    reasons.push('Has a website — potential upsell/redesign lead');
  }

  if (lead.phone) {
    score += 22;
    reasons.push('Phone number available — directly reachable');
  }
  if (lead.email) {
    score += 16;
    reasons.push('Email available — reachable for outreach');
  }
  if (!lead.phone && !lead.email && !lead.website) {
    reasons.push('No contact info found — hard to reach');
  }

  if (!lead.website && lead.hasSocial) {
    score += 10;
    reasons.push('Active on social media but no website — clear gap to sell into');
  }

  if (lead.address) {
    score += 4;
    reasons.push('Verified address on record');
  }

  score = Math.min(100, score);
  const tier = score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold';
  const contactable = CONTACT_FIELDS.some((f) => lead[f]);
  return { score, tier, reasons, contactable };
}

/** Parse a full Overpass response into deduped, scored, sorted leads. */
export function parseOverpass(overpassJson, { onlyMissingWebsite = false } = {}) {
  const elements = (overpassJson && overpassJson.elements) || [];
  const seen = new Set();
  const leads = [];

  for (const el of elements) {
    const lead = elementToLead(el);
    if (!lead) continue;
    if (onlyMissingWebsite && lead.website) continue;

    const key = `${lead.name.toLowerCase()}|${lead.address.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    leads.push(lead);
  }

  leads.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return leads;
}

export function summarise(leads) {
  return {
    total: leads.length,
    hot: leads.filter((l) => l.tier === 'hot').length,
    warm: leads.filter((l) => l.tier === 'warm').length,
    cold: leads.filter((l) => l.tier === 'cold').length,
    noWebsite: leads.filter((l) => !l.website).length,
    contactable: leads.filter((l) => l.contactable).length,
  };
}

/** Serialise leads to CSV (RFC-4180-ish: quotes escaped, fields quoted). */
export function toCsv(leads) {
  const cols = ['name', 'category', 'address', 'phone', 'email', 'website', 'score', 'tier', 'openingHours'];
  const header = cols.join(',');
  const rows = leads.map((l) =>
    cols
      .map((c) => {
        const v = l[c] == null ? '' : String(l[c]);
        return `"${v.replace(/"/g, '""')}"`;
      })
      .join(','),
  );
  return [header, ...rows].join('\r\n');
}
