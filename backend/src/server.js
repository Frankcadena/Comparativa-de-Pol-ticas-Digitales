// ----------------------------------------
// server.js — Servidor Express (Backend)
// ----------------------------------------
// - Sirve archivos estáticos del frontend.
// - Expone endpoints REST para obtener indicadores desde WDI (/api/indicators)
//   y para procesar archivos subidos por el usuario (/api/upload).
// - Aplica CORS, parseo JSON y control de caché (no-store).
// Nota: Documentado sin modificar la lógica original.

require('dotenv').config();                 // Carga variables de entorno desde .env (p.ej., PORT)
const path = require('path');               // Utilidades de rutas de archivos
const express = require('express');         // Framework HTTP
const cors = require('cors');               // Habilita CORS (útil para entorno local o despliegues simples)
const multer = require('multer');           // Middleware para manejar subida de archivos (multipart/form-data)

// Módulos internos: subsistema de datos y de modelos
const { fetchIndicatorsFromAPI, parseUpload, resolveISO } = require('./data');
const { buildComparisonWithWeights, toRadarDataset, toBarDataset, buildReportInsights } = require('./model');

const app = express();                      // Instancia Express
const upload = multer({ storage: multer.memoryStorage() }); // Almacena archivos en memoria (Buffer)

// Middlewares globales
app.use(cors());                            // Permite peticiones cross-origin
app.use(express.json());                    // Parseo de JSON en body

// Directorio del frontend estático (index.html, js, etc.)
const FRONTEND_DIR = path.resolve(__dirname, '../../frontend');
app.use(express.static(FRONTEND_DIR));      // Sirve los archivos del frontend

/**
 * Health-check simple.
 * GET /api/health
 * Responde un JSON con ok:true y timestamp. Útil para pruebas de vida del servidor.
 */
app.get('/api/health', (_req, res) =>
  res.set('Cache-Control','no-store').json({ ok: true, ts: Date.now() })
);

/**
 * Endpoint principal de consulta a la API WDI.
 * GET /api/indicators?countries=a,b,c&year=YYYY
 *
 * Flujo:
 *  1) Valida que haya al menos un país.
 *  2) Resuelve nombres → ISO-3 y detecta desconocidos (400 si hay alguno).
 *  3) Llama a fetchIndicatorsFromAPI para obtener series/valores por país.
 *  4) Pasa por el modelo (buildComparisonWithWeights) para normalizar y calcular score/pesos.
 *  5) Devuelve payload con:
 *      - raw: valores brutos por país
 *      - comparison: normalizados + score + rank
 *      - weights: pesos aplicados por eje
 *      - charts: datasets para Chart.js (radar y barras)
 *      - insights: hallazgos textuales
 *      - meta: request/resolved (años usados por país y fuente de capacidad)
 */
app.get('/api/indicators', async (req, res) => {
  try {
    const { countries = '', year } = req.query;

    // Lista de países, separados por coma, sin vacíos
    const list = countries.split(',').map(s => s.trim()).filter(Boolean);
    if (list.length === 0) return res.status(400).json({ error: 'Debe enviar al menos un país' });

    // Resolver a ISO-3 y detectar desconocidos
    const mapped = list.map(name => ({ name, iso: resolveISO(name) }));
    const unknown = mapped.filter(x => !x.iso).map(x => x.name);
    if (unknown.length) {
      return res.status(400).json({
        error: 'País no reconocido',
        detail: `Revisa: ${unknown.join(', ')}. Usa nombre ES o ISO-3.`
      });
    }

    // Llamada a WDI + preparación de payload
    const { rows, meta } = await fetchIndicatorsFromAPI({ countries: list, year });
    const { comparison, weights } = buildComparisonWithWeights(rows);

    // Control de caché desactivado (datos "frescos" por defecto)
    res
      .set('Cache-Control','no-store')
      .json({
        raw: rows,
        comparison,
        weights,
        charts: {
          radar: toRadarDataset(comparison),
          bars: toBarDataset(comparison)
        },
        insights: buildReportInsights(comparison, weights),
        meta: {
          request: { countries: list, year: year || null },
          resolved: meta
        }
      });
  } catch (err) {
    // Errores (red, formato WDI, etc.)
    console.error('[indicators]', err);
    res
      .set('Cache-Control','no-store')
      .status(500)
      .json({ error: 'Error obteniendo indicadores WDI', detail: String(err.message || err) });
  }
});

/**
 * Endpoint de carga de archivos locales (CSV/JSON) para comparar sin depender de la API.
 * POST /api/upload?year=YYYY
 * Body: multipart/form-data con campo `file`
 *
 * Flujo:
 *  1) Verifica presencia de archivo (400 si falta).
 *  2) parseUpload → normaliza filas al esquema esperado (ver data.js).
 *  3) buildComparisonWithWeights → normalización + score + pesos.
 *  4) Devuelve payload análogo a /api/indicators (sin meta.resolved de WDI).
 */
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se envió archivo' });

    const { year } = req.query;
    const raw = await parseUpload(req.file, year);
    const { comparison, weights } = buildComparisonWithWeights(raw);

    res
      .set('Cache-Control','no-store')
      .json({
        raw,
        comparison,
        weights,
        charts: {
          radar: toRadarDataset(comparison),
          bars: toBarDataset(comparison)
        },
        insights: buildReportInsights(comparison, weights),
        meta: { request: { upload: true, year: year || null } }
      });
  } catch (err) {
    // Errores de parseo/estructura del archivo
    console.error('[upload]', err);
    res
      .set('Cache-Control','no-store')
      .status(400)
      .json({ error: 'Archivo inválido o estructura no reconocida', detail: String(err.message || err) });
  }
});

/**
 * Fallback para rutas del frontend (SPA o navegación directa).
 * Devuelve siempre el index.html para que el cliente maneje el enrutado.
 */
app.get('*', (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));

// Puesta en marcha del servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`DSS en http://localhost:${PORT}`));
