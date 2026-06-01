// Network layer: geocode a place with Nominatim, then fetch matching
// businesses from the OpenStreetMap Overpass API. Both are free and keyless;
// we send a proper User-Agent and respect modest result limits, per OSM policy.

import { parseOverpass } from './leads.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const UA = 'AI-Lead-Generator/1.0 (educational portfolio project)';
const TIMEOUT_MS = 30000;

// Category -> Overpass tag filters. "any" pulls common customer-facing places.
export const CATEGORIES = {
  restaurant: ['amenity=restaurant', 'amenity=fast_food'],
  cafe: ['amenity=cafe'],
  bar: ['amenity=bar', 'amenity=pub'],
  hotel: ['tourism=hotel', 'tourism=guest_house'],
  salon: ['shop=hairdresser', 'shop=beauty'],
  gym: ['leisure=fitness_centre', 'amenity=gym'],
  dentist: ['amenity=dentist', 'healthcare=dentist'],
  doctor: ['amenity=doctors', 'amenity=clinic'],
  retail: ['shop=clothes', 'shop=gift', 'shop=jewelry', 'shop=shoes'],
  bakery: ['shop=bakery'],
  car_repair: ['shop=car_repair', 'craft=car_repair'],
  any: ['shop', 'amenity=restaurant', 'amenity=cafe', 'office'],
};

async function fetchJson(url, { timeout = TIMEOUT_MS, ...opts } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: controller.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json', ...(opts.headers || {}) },
    });
    if (!res.ok) throw new Error(`Upstream responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Geocode a place name to a bounding box. Returns { displayName, bbox:[s,w,n,e] }. */
export async function geocode(place) {
  const url = `${NOMINATIM}?q=${encodeURIComponent(place)}&format=json&limit=1`;
  const data = await fetchJson(url);
  if (!Array.isArray(data) || !data.length) {
    throw new Error(`Could not find a place called "${place}".`);
  }
  const top = data[0];
  // Nominatim boundingbox = [south, north, west, east] as strings.
  const [s, n, w, e] = top.boundingbox.map(Number);
  return { displayName: top.display_name, bbox: [s, w, n, e] };
}

function buildOverpassQuery(filters, bbox, limit) {
  const [s, w, n, e] = bbox;
  const box = `(${s},${w},${n},${e})`;
  const clauses = filters
    .map((f) => {
      // "shop" (key only) vs "amenity=restaurant" (key=value)
      const tag = f.includes('=') ? `["${f.split('=')[0]}"="${f.split('=')[1]}"]` : `["${f}"]`;
      return `  nwr${tag}${box};`;
    })
    .join('\n');
  return `[out:json][timeout:25];\n(\n${clauses}\n);\nout center ${limit};`;
}

/**
 * Search businesses for a place + category.
 * @returns {{ ok, place, category, leads, summaryReady:boolean, error? }}
 */
export async function searchLeads({ place, category = 'any', limit = 120, onlyMissingWebsite = false }) {
  if (!place || !place.trim()) return { ok: false, error: 'Please provide a place/city to search.' };
  const filters = CATEGORIES[category] || CATEGORIES.any;

  let geo;
  try {
    geo = await geocode(place.trim());
  } catch (err) {
    return { ok: false, error: err.message };
  }

  // Guard against absurdly large areas (whole countries) that would time out.
  const [s, w, n, e] = geo.bbox;
  if (Math.abs(n - s) > 2 || Math.abs(e - w) > 2) {
    return { ok: false, error: 'That area is too large to scan. Try a specific city or neighbourhood.' };
  }

  const query = buildOverpassQuery(filters, geo.bbox, Math.min(limit, 300));
  let raw;
  try {
    raw = await fetchJson(OVERPASS, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: query,
    });
  } catch (err) {
    return {
      ok: false,
      error:
        err.name === 'AbortError'
          ? 'The data source took too long (timeout). Try a smaller area.'
          : `Could not fetch business data: ${err.message}`,
    };
  }

  const leads = parseOverpass(raw, { onlyMissingWebsite });
  return { ok: true, place: geo.displayName, category, leads };
}
