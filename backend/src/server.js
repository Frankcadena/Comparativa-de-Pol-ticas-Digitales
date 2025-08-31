require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { fetchIndicatorsFromAPI, parseUpload, resolveISO } = require('./data');
const { buildComparisonWithWeights, toRadarDataset, toBarDataset, buildReportInsights } = require('./model');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(cors()); app.use(express.json());

const FRONTEND_DIR = path.resolve(__dirname, '../../frontend');
app.use(express.static(FRONTEND_DIR));

app.get('/api/health', (_req, res) => res.set('Cache-Control','no-store').json({ ok: true, ts: Date.now() }));

app.get('/api/indicators', async (req, res) => {
  try {
    const { countries = '', year } = req.query;
    const list = countries.split(',').map(s => s.trim()).filter(Boolean);
    if (list.length === 0) return res.status(400).json({ error: 'Debe enviar al menos un país' });

    // Validación de países
    const mapped = list.map(name => ({ name, iso: resolveISO(name) }));
    const unknown = mapped.filter(x => !x.iso).map(x => x.name);
    if (unknown.length) {
      return res.status(400).json({
        error: 'País no reconocido',
        detail: `Revisa: ${unknown.join(', ')}. Usa nombre en español (p. ej., "Chile") o código ISO-3 (CHL, COL, ESP...).`
      });
    }

    const { rows, meta } = await fetchIndicatorsFromAPI({ countries: list, year });
    const { comparison, weights } = buildComparisonWithWeights(rows);
    res.set('Cache-Control','no-store').json({
      raw: rows,
      comparison, weights,
      charts: { radar: toRadarDataset(comparison), bars: toBarDataset(comparison) },
      insights: buildReportInsights(comparison, weights),
      meta: { request: { countries: list, year: year || null }, resolved: meta }
    });
  } catch (err) {
    console.error('[indicators]', err);
    res.set('Cache-Control','no-store').status(500).json({ error: 'Error obteniendo indicadores WDI', detail: String(err.message || err) });
  }
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se envió archivo' });
    const { year } = req.query;
    const raw = await parseUpload(req.file, year);
    const { comparison, weights } = buildComparisonWithWeights(raw);
    res.set('Cache-Control','no-store').json({
      raw, comparison, weights,
      charts: { radar: toRadarDataset(comparison), bars: toBarDataset(comparison) },
      insights: buildReportInsights(comparison, weights),
      meta: { request: { upload: true, year: year || null } }
    });
  } catch (err) {
    console.error('[upload]', err);
    res.set('Cache-Control','no-store').status(400).json({ error: 'Archivo inválido o estructura no reconocida', detail: String(err.message || err) });
  }
});

app.get('*', (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`DSS en http://localhost:${PORT}`));
