// === Frontend logic extracted ===
const radarCtx = document.getElementById('radar');
const barsCtx = document.getElementById('bars');
const ctxAccessInfra = document.getElementById('chartAccessInfra');
const ctxUse = document.getElementById('chartUse');
const ctxPct = document.getElementById('chartPctInternet');
const ctxSpeed = document.getElementById('chartSpeed');

let radarChart, barChart, chartAccessInfra, chartUse, chartPct, chartSpeed, lastPayload;

function chip(text) {
  const span = document.createElement('span');
  span.className = 'px-2 py-1 text-xs rounded-full bg-gray-100 border';
  span.textContent = text;
  return span;
}
function renderChips(meta) {
  const c = document.getElementById('chips');
  c.innerHTML = '';
  if (!meta) return;
  const req = meta.request || {};
  c.appendChild(chip('Países solicitados: ' + (req.countries || []).join(', ')));
  if (meta.resolved?.resolved) c.appendChild(chip('ISO usados: ' + meta.resolved.resolved.join(', ')));
  const yrs = meta.resolved?.perCountryYear || {};
  const yrText = Object.entries(yrs).map(([k,v]) => `${k}:${v||'s/d'}`).join(' · ');
  c.appendChild(chip('Año por país: ' + yrText));
}

function dbg(obj) {
  const pre = document.getElementById('dbg');
  pre.textContent = JSON.stringify(obj, null, 2);
}
function fmt(n) {
  if (n == null) return '—';
  if (typeof n === 'number') return (Math.round(n * 100) / 100).toString();
  return String(n);
}
function clean(v){ return (v==null ? '' : (typeof v==='number' ? (Math.round(v*100)/100) : String(v)).toString()); }

function setResultsVisible(show) {
  ['sectionSynth','sectionIndicators','sectionInsights','sectionDetail','debug']
    .forEach(id => document.getElementById(id).classList.toggle('hidden', !show));
  document.getElementById('emptyState').classList.toggle('hidden', show);
  document.getElementById('chips').classList.toggle('hidden', !show);
}
document.addEventListener('DOMContentLoaded', () => setResultsVisible(false));

function makeRadar(data) {
  if (radarChart) radarChart.destroy();
  radarChart = new Chart(radarCtx, {
    type: 'radar',
    data: { labels: data.labels, datasets: data.datasets.map(ds => ({ label: ds.label, data: ds.data })) },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 10, bottom: 24 } },
      plugins: { legend: { position: 'top' } },
      scales: { r: { min: 0, max: 1, pointLabels: { font: { size: 12 } } } }
    }
  });
}
function makeBars(data) {
  if (barChart) barChart.destroy();
  barChart = new Chart(barsCtx, {
    type: 'bar',
    data: { labels: data.labels, datasets: data.datasets.map(ds => ({ label: ds.label, data: ds.data })) },
    options: { responsive: true }
  });
}

function barHorizontal(ctx, title, labels, values) {
  return new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: title, data: values.map(v => (v==null?NaN:v)) }] },
    options: { responsive: true, indexAxis: 'y' }
  });
}
function lineChart(ctx, title, labels, values) {
  return new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label: title, data: values.map(v => (v==null?NaN:v)), fill: false }] },
    options: { responsive: true }
  });
}
function polarAreaChart(ctx, labels, values) {
  return new Chart(ctx, {
    type: 'polarArea',
    data: { labels, datasets: [{ data: values.map(v => (v==null?NaN:v)) }] },
    options: { responsive: true }
  });
}
function verticalBar(ctx, title, labels, values) {
  return new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: title, data: values.map(v => (v==null?NaN:v)) }] },
    options: { responsive: true }
  });
}

function renderIndicatorCharts(payload) {
  const rows = payload.raw || [];
  const labels = rows.map(r => r.country);
  const accessPct = rows.map(r => r.access_internet_pct);
  const fixedPer100 = rows.map(r => r.fixed_broadband_subs_per100);
  const speedMbps = rows.map(r => r.broadband_speed_mbps);

  if (chartAccessInfra) chartAccessInfra.destroy();
  chartAccessInfra = barHorizontal(ctxAccessInfra, 'Banda ancha fija por 100', labels, fixedPer100);

  if (chartUse) chartUse.destroy();
  chartUse = lineChart(ctxUse, 'Usuarios de Internet (%)', labels, accessPct);

  if (chartPct) chartPct.destroy();
  chartPct = polarAreaChart(ctxPct, labels, accessPct);

  if (chartSpeed) chartSpeed.destroy();
  chartSpeed = verticalBar(ctxSpeed, 'Mbps por usuario (o proxy)', labels, speedMbps);
  document.getElementById('speedMsg').textContent = (payload.meta?.resolved?.speedSource)
    ? 'Nota: si falta IT.NET.BNDW.PC, se usa IT.NET.BBND.P2 como proxy.' : '';
}

function renderInsights(arr) {
  const ul = document.getElementById('insights');
  ul.innerHTML = '';
  (arr || []).forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
}
function renderTable(payload) {
  const tb = document.getElementById('tblBody');
  tb.innerHTML = '';
  const rows = payload.comparison || [];
  rows.forEach(r => {
    const tr = document.createElement('tr');
    const cells = [
      r.country, r.year ?? '',
      fmt(r.access_internet_pct), fmt(r.norm?.access),
      fmt(r.fixed_broadband_subs_per100), fmt(r.norm?.infra),
      fmt(r.broadband_speed_mbps), fmt(r.norm?.capacity),
      fmt(r.score)
    ];
    cells.forEach((v,i) => {
      const td = document.createElement('td');
      td.className = 'p-2 ' + (i>=2 ? 'text-right' : '');
      td.textContent = v;
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  const w = payload.weights || { access:0, infra:0, capacity:0 };
  document.getElementById('weightsText').textContent =
    `Pesos usados → Uso: ${fmt(w.access)} · Infraestructura: ${fmt(w.infra)} · Capacidad: ${fmt(w.capacity)}`;
}

function toCSV(payload) {
  const w = payload.weights || { access:0, infra:0, capacity:0 };
  const rows = payload.comparison || [];
  const header = ['country','year','use_pct','fixed_broadband_per100','capacity_mbps_per_user','score','w_access','w_infra','w_capacity'];
  const out = [header.join(',')];
  rows.forEach(r => {
    out.push([
      r.country, r.year ?? '',
      clean(r.access_internet_pct),
      clean(r.fixed_broadband_subs_per100),
      clean(r.broadband_speed_mbps),
      clean(r.score),
      w.access, w.infra, w.capacity
    ].join(','));
  });
  return out.join('\n');
}
function downloadCSV() {
  if (!lastPayload) { alert('Primero genere una comparación.'); return; }
  const csv = toCSV(lastPayload);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'dss_comparacion.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseCountries() {
  const main = document.getElementById('countryMain').value.trim();
  const refs = (document.getElementById('countryRefs').value || '').split(',').map(s => s.trim()).filter(Boolean);
  const countries = [main, ...refs].filter(Boolean);
  return countries.slice(0, 6);
}
async function compareViaAPI() {
  const countries = parseCountries();
  const year = document.getElementById('year').value.trim();
  if (!countries.length) return alert('Seleccione al menos el país principal.');
  const qs = new URLSearchParams({ countries: countries.join(','), ...(year && { year }) });
  const resp = await fetch(`/api/indicators?${qs.toString()}`, { cache: 'no-store' });
  let payload;
  if (!resp.ok) {
    try { payload = await resp.json(); } catch (_) {}
    return alert((payload && (payload.error + (payload.detail ? ' • ' + payload.detail : ''))) || 'Error desde API');
  }
  payload = await resp.json();
  lastPayload = payload;

  setResultsVisible(true);
  makeRadar(payload.charts.radar);
  makeBars(payload.charts.bars);
  renderIndicatorCharts(payload);
  renderInsights(payload.insights);
  renderTable(payload);
  renderChips(payload.meta);
  dbg(payload);
}
async function compareViaUpload(file) {
  const year = document.getElementById('year').value.trim();
  const form = new FormData();
  form.append('file', file);
  const qs = new URLSearchParams({ ...(year && { year }) });
  const resp = await fetch(`/api/upload?${qs.toString()}`, { method: 'POST', body: form, cache: 'no-store' });
  let payload;
  if (!resp.ok) {
    try { payload = await resp.json(); } catch (_) {}
    return alert((payload && (payload.error || payload.detail)) || 'Error procesando archivo');
  }
  payload = await resp.json();
  lastPayload = payload;

  setResultsVisible(true);
  makeRadar(payload.charts.radar);
  makeBars(payload.charts.bars);
  renderIndicatorCharts(payload);
  renderInsights(payload.insights);
  renderTable(payload);
  renderChips(payload.meta);
  dbg(payload);
}
function downloadReport() {
  if (!lastPayload) { alert('Primero genere una comparación.'); return; }
  window.print();
}
function clearAll() {
  document.getElementById('countryMain').value = '';
  document.getElementById('countryRefs').value = '';
  document.getElementById('year').value = '';
  if (radarChart) radarChart.destroy();
  if (barChart) barChart.destroy();
  [chartAccessInfra, chartUse, chartPct, chartSpeed].forEach(ch => ch && ch.destroy());
  document.getElementById('insights').innerHTML = '';
  document.getElementById('tblBody').innerHTML = '';
  document.getElementById('weightsText').textContent = '';
  document.getElementById('chips').innerHTML = '';
  document.getElementById('dbg').textContent = '';
  document.getElementById('speedMsg').textContent = '';
  lastPayload = null;
  setResultsVisible(false);
}
document.getElementById('btnApi').addEventListener('click', compareViaAPI);
document.getElementById('file').addEventListener('change', (e) => { if (e.target.files?.[0]) compareViaUpload(e.target.files[0]); });
document.getElementById('btnReport').addEventListener('click', downloadReport);
document.getElementById('btnCSV').addEventListener('click', downloadCSV);
document.getElementById('btnClear').addEventListener('click', clearAll);
