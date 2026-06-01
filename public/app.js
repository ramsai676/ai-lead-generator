const $ = (id) => document.getElementById(id);
const els = {
  form: $('search-form'), place: $('place'), category: $('category'), onlyMissing: $('onlyMissing'),
  btn: $('search-btn'), spinner: document.querySelector('.spinner'), btnLabel: document.querySelector('.btn-label'),
  results: $('results'), summary: $('summary'), body: $('leads-body'), empty: $('empty'),
  error: $('error'), exportBtn: $('export-btn'), tierFilters: $('tier-filters'),
};

let currentLeads = [];
let currentTier = 'all';
let lastQuery = null;

const CATEGORY_LABELS = {
  any: 'All businesses', restaurant: 'Restaurants', cafe: 'Cafés', bar: 'Bars & Pubs',
  hotel: 'Hotels', salon: 'Salons & Beauty', gym: 'Gyms & Fitness', dentist: 'Dentists',
  doctor: 'Doctors & Clinics', retail: 'Retail shops', bakery: 'Bakeries', car_repair: 'Car repair',
};

async function loadCategories() {
  try {
    const data = await (await fetch('/api/health')).json();
    for (const c of data.categories) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = CATEGORY_LABELS[c] || c;
      els.category.appendChild(opt);
    }
    els.category.value = 'any';
  } catch { /* ignore */ }
}

function setLoading(v) {
  els.btn.disabled = v; els.spinner.hidden = !v;
  els.btnLabel.textContent = v ? 'Searching…' : 'Find leads';
}

function statCards(s) {
  els.summary.innerHTML = `
    <div class="stat"><div class="num">${s.total}</div><div class="lbl">Total leads</div></div>
    <div class="stat hot"><div class="num">${s.hot}</div><div class="lbl">🔥 Hot</div></div>
    <div class="stat warm"><div class="num">${s.warm}</div><div class="lbl">🌤 Warm</div></div>
    <div class="stat nowww"><div class="num">${s.noWebsite}</div><div class="lbl">No website</div></div>
    <div class="stat"><div class="num">${s.contactable}</div><div class="lbl">Contactable</div></div>`;
}

function contactCell(l) {
  const bits = [];
  if (l.phone) bits.push(`<a href="tel:${l.phone}">${l.phone}</a>`);
  if (l.email) bits.push(`<a href="mailto:${l.email}">${l.email}</a>`);
  return bits.length ? bits.join('<br>') : '<span class="muted">-</span>';
}

function webCell(l) {
  if (l.website) {
    const href = /^https?:/.test(l.website) ? l.website : `https://${l.website}`;
    return `<a href="${href}" target="_blank" rel="noopener">visit ↗</a>`;
  }
  return l.hasSocial ? '<span class="muted">social only</span>' : '<span class="muted">none</span>';
}

function render() {
  const leads = currentTier === 'all' ? currentLeads : currentLeads.filter((l) => l.tier === currentTier);
  els.empty.hidden = leads.length > 0;
  els.body.innerHTML = leads
    .map(
      (l) => `
    <tr>
      <td><div class="lead-name"></div><div class="lead-addr"></div></td>
      <td>${escapeHtml(l.category)}</td>
      <td class="contact">${contactCell(l)}</td>
      <td class="web">${webCell(l)}</td>
      <td>
        <div class="score-cell">
          <span class="score-badge">${l.score}</span>
          <span class="tier ${l.tier}">${l.tier}</span>
        </div>
        <div class="reasons">${escapeHtml(l.reasons[0] || '')}</div>
      </td>
    </tr>`,
    )
    .join('');
  // Fill text nodes safely (names/addresses are untrusted).
  const rows = els.body.querySelectorAll('tr');
  leads.forEach((l, i) => {
    rows[i].querySelector('.lead-name').textContent = l.name;
    rows[i].querySelector('.lead-addr').textContent = l.address || '';
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const place = els.place.value.trim();
  if (!place) return;
  const category = els.category.value;
  const onlyMissingWebsite = els.onlyMissing.checked;
  lastQuery = { place, category, onlyMissingWebsite };

  setLoading(true);
  els.error.hidden = true; els.results.hidden = true;
  try {
    const url = `/api/search?place=${encodeURIComponent(place)}&category=${category}&onlyMissingWebsite=${onlyMissingWebsite}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search failed');
    currentLeads = data.leads;
    currentTier = 'all';
    els.tierFilters.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.tier === 'all'));
    statCards(data.summary);
    render();
    els.results.hidden = false;
  } catch (err) {
    els.error.textContent = `⚠️ ${err.message}`;
    els.error.hidden = false;
  } finally {
    setLoading(false);
  }
});

els.tierFilters.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  currentTier = chip.dataset.tier;
  els.tierFilters.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
  render();
});

els.exportBtn.addEventListener('click', () => {
  if (!lastQuery) return;
  const { place, category, onlyMissingWebsite } = lastQuery;
  window.location.href = `/api/export?place=${encodeURIComponent(place)}&category=${category}&onlyMissingWebsite=${onlyMissingWebsite}`;
});

loadCategories();
