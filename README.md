# LeadFinder

A prospecting tool that finds local businesses in any city and ranks them as sales leads. It pulls real business listings from OpenStreetMap, scores each one (a business with no website is the strongest lead for a web or digital-services pitch), shows the results in a dashboard, and exports them to CSV.

![node](https://img.shields.io/badge/node-%3E%3D18-informational)
![license](https://img.shields.io/badge/license-MIT-blue)
![data](https://img.shields.io/badge/data-OpenStreetMap-success)
![tests](https://img.shields.io/badge/tests-10%20passing-success)

## Overview

LeadFinder turns open map data into a working lead pipeline: discover, clean, score, review, and export. It uses the free and keyless Overpass and Nominatim APIs rather than scraping a terms-protected source, so it is both practical and within the rules.

The output is opinionated. Each business gets a score from 0 to 100 and a hot, warm, or cold tier, tuned for selling websites: no website plus a reachable phone number is the hottest lead.

## Screenshots

| Search a city and category | Scored leads and CSV export |
| :---: | :---: |
| ![Home screen](docs/01-home.png) | ![Lead dashboard with scores](docs/02-result.png) |

## How leads are scored

| Signal | Effect | Reason |
| --- | --- | --- |
| No website | +50 | They need exactly what you sell |
| Phone available | +22 | You can reach them |
| Email available | +16 | Reachable for outreach |
| Social-only, no site | +10 | Active online but missing a website |
| Verified address | +4 | Higher-quality record |
| Has a website | +8 | Still a redesign or upsell lead |

Tiers: Hot is 70 or above, Warm is 40 to 69, Cold is below 40. Each lead lists the reasons behind its score.

## Getting started

```bash
git clone https://github.com/ramsai676/ai-lead-generator.git
cd ai-lead-generator
npm install
npm start
# open http://localhost:3003
```

No API key is required. Try a specific city such as "Coimbatore, India" with a category, or tick the "no website" filter to see pure prospects.

Run the tests:

```bash
npm test
```

## API

| Endpoint | Params | Purpose |
| --- | --- | --- |
| `GET /api/search` | `place`, `category`, `onlyMissingWebsite` | Returns the place, a summary, and the scored leads. |
| `GET /api/export` | same | Streams a downloadable CSV of the leads. |
| `GET /api/health` | | Service status and available categories. |

Categories include restaurant, cafe, bar, hotel, salon, gym, dentist, doctor, retail, bakery, car_repair, and any.

## How it works

```
place + category
   -> Nominatim geocode (rejects regions that are too large)
   -> Overpass query for matching businesses
   -> clean, dedupe, score, sort  (leads.js)
   -> dashboard with tier filters, and CSV export
```

The parsing and scoring in `src/leads.js` are pure and unit-tested. Network handling is in `src/overpass.js`.

## Tech stack

- Node.js and Express
- The platform `fetch` API against OpenStreetMap Overpass and Nominatim
- Vanilla dashboard with tier filters, summary stats, and CSV export
- Built-in `node:test` for parsing and scoring

## Data and responsible use

Business data is provided by OpenStreetMap contributors under the ODbL licence; attribute it when you publish results. The app sends a descriptive User-Agent, limits result sizes, and blocks oversized areas to respect the free public endpoints. Use the leads for lawful outreach and follow local anti-spam and do-not-call rules.

## License

MIT. See [LICENSE](LICENSE).
