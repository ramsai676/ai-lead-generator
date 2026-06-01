import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { searchLeads, CATEGORIES } from './src/overpass.js';
import { summarise, toCsv } from './src/leads.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json({ limit: '64kb' }));
app.use(express.static(join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', categories: Object.keys(CATEGORIES) });
});

app.get('/api/search', async (req, res) => {
  const place = (req.query.place || '').toString();
  const category = (req.query.category || 'any').toString();
  const onlyMissingWebsite = req.query.onlyMissingWebsite === 'true';

  const result = await searchLeads({ place, category, onlyMissingWebsite });
  if (!result.ok) return res.status(422).json({ error: result.error });

  res.json({
    place: result.place,
    category: result.category,
    summary: summarise(result.leads),
    leads: result.leads,
  });
});

// Run a search and stream the results back as a downloadable CSV.
app.get('/api/export', async (req, res) => {
  const place = (req.query.place || '').toString();
  const category = (req.query.category || 'any').toString();
  const onlyMissingWebsite = req.query.onlyMissingWebsite === 'true';

  const result = await searchLeads({ place, category, onlyMissingWebsite });
  if (!result.ok) return res.status(422).json({ error: result.error });

  const csv = toCsv(result.leads);
  const safe = (place || 'leads').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="leads-${safe}-${category}.csv"`);
  res.send(csv);
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`\n  🎯  AI Lead Generator on http://localhost:${PORT}`);
    console.log('      Data: OpenStreetMap (Overpass + Nominatim) - free, no API key\n');
  });
}

export default app;
