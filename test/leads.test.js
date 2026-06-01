import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elementToLead, scoreLead, parseOverpass, summarise, toCsv, categoryOf } from '../src/leads.js';

// A small fixture mimicking an Overpass API response.
const FIXTURE = {
  elements: [
    {
      type: 'node', id: 1, lat: 11.0, lon: 77.0,
      tags: { name: "Mario's Pizzeria", amenity: 'restaurant', phone: '+91 99999 11111',
        'addr:housenumber': '12', 'addr:street': 'Main Rd', 'addr:city': 'Coimbatore' },
    },
    {
      type: 'node', id: 2, lat: 11.1, lon: 77.1,
      tags: { name: 'Bright Smile Dental', amenity: 'dentist', website: 'https://brightsmile.example',
        'contact:phone': '044 123456', email: 'hi@brightsmile.example' },
    },
    {
      type: 'node', id: 3,
      tags: { name: 'Anon Kiosk', shop: 'kiosk' }, // no contact at all
    },
    {
      type: 'node', id: 4,
      tags: { shop: 'bakery' }, // no name -> dropped
    },
    {
      type: 'node', id: 5,
      tags: { name: "Mario's Pizzeria", amenity: 'restaurant', 'addr:housenumber': '12',
        'addr:street': 'Main Rd', 'addr:city': 'Coimbatore' }, // duplicate of #1 by name+addr
    },
  ],
};

test('categoryOf maps OSM tags to readable labels', () => {
  assert.equal(categoryOf({ amenity: 'fast_food' }), 'Fast Food');
  assert.equal(categoryOf({ shop: 'hairdresser' }), 'Hairdresser');
  assert.equal(categoryOf({}), 'Business');
});

test('elementToLead builds a clean lead and drops nameless elements', () => {
  const lead = elementToLead(FIXTURE.elements[0]);
  assert.equal(lead.name, "Mario's Pizzeria");
  assert.equal(lead.category, 'Restaurant');
  assert.equal(lead.address, '12 Main Rd, Coimbatore');
  assert.equal(lead.phone, '+91 99999 11111');
  assert.equal(elementToLead(FIXTURE.elements[3]), null); // no name
});

test('no-website business with phone scores HOT', () => {
  const lead = elementToLead(FIXTURE.elements[0]);
  assert.equal(lead.tier, 'hot');
  assert.ok(lead.score >= 70);
  assert.ok(lead.reasons.some((r) => /no website/i.test(r)));
});

test('business with website + contacts scores lower (warm/cold)', () => {
  const lead = elementToLead(FIXTURE.elements[1]);
  assert.notEqual(lead.tier, 'hot');
  assert.ok(lead.score < 70);
});

test('no-contact business is marked not contactable', () => {
  const lead = elementToLead(FIXTURE.elements[2]);
  assert.equal(lead.contactable, false);
});

test('parseOverpass dedupes and sorts by score desc', () => {
  const leads = parseOverpass(FIXTURE);
  // #1 and #5 are dupes -> one removed; #4 has no name -> dropped. Expect 3.
  assert.equal(leads.length, 3);
  for (let i = 1; i < leads.length; i++) assert.ok(leads[i - 1].score >= leads[i].score);
});

test('onlyMissingWebsite filter excludes sites with a website', () => {
  const leads = parseOverpass(FIXTURE, { onlyMissingWebsite: true });
  assert.ok(leads.every((l) => !l.website));
  assert.ok(!leads.some((l) => l.name === 'Bright Smile Dental'));
});

test('summarise produces correct counts', () => {
  const leads = parseOverpass(FIXTURE);
  const s = summarise(leads);
  assert.equal(s.total, 3);
  assert.equal(s.noWebsite, 2);
  assert.ok(s.hot >= 1);
});

test('toCsv escapes quotes and includes a header', () => {
  const leads = parseOverpass(FIXTURE);
  const csv = toCsv(leads);
  const lines = csv.split('\r\n');
  assert.match(lines[0], /name,category,address/);
  assert.equal(lines.length, leads.length + 1);
  // names are quoted
  assert.ok(lines.some((l) => l.startsWith('"')));
});

test('handles empty / malformed input gracefully', () => {
  assert.deepEqual(parseOverpass({}), []);
  assert.deepEqual(parseOverpass(null), []);
});
