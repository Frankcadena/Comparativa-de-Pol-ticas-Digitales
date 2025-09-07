// ------------------------------
// data.js — Subsistema de Datos
// ------------------------------
// - Obtiene indicadores WDI desde la API del World Bank
// - Resuelve nombres de países a ISO-3 (ES/EN → ISO-3)
// - Parsea archivos CSV/JSON subidos por el usuario
// - Normaliza filas de entrada a un esquema común
// Nota: Se documenta sin cambiar la lógica original.

// Dependencias de parsing y utilidades
const Papa = require('papaparse');          // Parser CSV robusto (detecta delimitador, salta filas vacías)
const ISO3 = require('./iso3');             // Mapa de nombres comunes (ES/EN) a códigos ISO-3

// Uso de fetch nativo si existe; si no, carga dinámica de node-fetch (evita romper en Node >=18)
const fetch = globalThis.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));

// Base de la API WDI v2
const WDI_BASE = 'https://api.worldbank.org/v2';

// Códigos de indicadores WDI utilizados en el DSS
// - users_internet_pct: % de personas que usan Internet
// - bandwidth_bps_per_user: ancho de banda internacional por usuario (bps) → se convierte a Mbps
// - fixed_broadband_per100: suscripciones de banda ancha fija por cada 100 habitantes
// - speed_fallback_subs_per100: mismo que fixed_broadband_per100 (se usa como proxy si falta bandwidth_bps_per_user)
const WDI = { users_internet_pct:'IT.NET.USER.ZS', bandwidth_bps_per_user:'IT.NET.BNDW.PC', fixed_broadband_per100:'IT.NET.BBND.P2', speed_fallback_subs_per100:'IT.NET.BBND.P2' };

/**
 * Elimina acentos/diacríticos de una cadena (útil para normalizar nombres de países).
 * @param {string} s
 * @returns {string}
 */
function stripAccents(s){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');}

/**
 * Convierte a Title Case básico (primera letra mayúscula, resto minúsculas).
 * @param {string} s
 * @returns {string}
 */
function titleCase(s){return s.charAt(0).toUpperCase()+s.slice(1).toLowerCase();}

/**
 * Resuelve el código ISO-3 a partir de un nombre de país en ES/EN/ISO-3.
 * - Si recibe ya un ISO-3 válido, lo devuelve en mayúsculas.
 * - Si recibe nombre con/ sin acentos o en distintas capitalizaciones, intenta múltiples variantes.
 * @param {string} name
 * @returns {string|null} ISO-3 o null si no se pudo resolver
 */
function resolveISO(name){
  if(!name) return null;
  const raw=String(name).trim();
  if(/^[A-Za-z]{3}$/.test(raw)) return raw.toUpperCase();     // Si ya es ISO-3, úsalo
  const noAcc=stripAccents(raw);                               // Variante sin acentos
  const t1=titleCase(raw);                                     // Variante Title Case (original)
  const t2=titleCase(noAcc);                                   // Variante Title Case (sin acentos)
  const code = ISO3[raw] || ISO3[noAcc] || ISO3[t1] || ISO3[t2];
  return code || null;
}

/**
 * Descarga la serie temporal de un indicador WDI para un país (ISO-3).
 * @param {string} iso3 - Código de país ISO-3.
 * @param {string} indicator - Código WDI (p.ej. IT.NET.USER.ZS).
 * @returns {Promise<Array>} Arreglo de observaciones (o [] si no hay).
 * @throws Error si la respuesta HTTP no es ok.
 */
async function wdiIndicatorForCountry(iso3, indicator){
  const url=`${WDI_BASE}/country/${iso3}/indicator/${indicator}?format=json&per_page=20000`;
  const r=await fetch(url,{headers:{'accept':'application/json','user-agent':'dss-data360/final'}});
  if(!r.ok) throw new Error(`WDI HTTP ${r.status}`);
  const data=await r.json();
  if(!Array.isArray(data)||data.length<2) return [];
  return data[1]||[];
}

/**
 * Convierte a número tolerando espacios y comas como separador decimal.
 * @param {any} v
 * @returns {number|null}
 */
function toNum(v){ if(v==null||v==='') return null; const n=Number(String(v).replace(/\s/g,'').replace(',', '.')); return Number.isFinite(n)?n:null; }

/**
 * Extrae un valor (year,value) de una serie WDI:
 * - Si se pasa `year` y existe ese año exacto, lo devuelve.
 * - Si no, devuelve el **último año disponible** (ordenando desc).
 * - Si la serie está vacía → { year: null, value: null }.
 * @param {Array} series - Serie WDI (data[1] de la API).
 * @param {string|number|undefined} year - Año solicitado (opcional).
 * @returns {{year:string|null, value:number|null}}
 */
function pick(series, year){
  const rows=(series||[]).filter(x=>x && x.country && x.date && x.value!=null).map(x=>({year:String(x.date),value:toNum(x.value)}));
  if(!rows.length) return {year:null,value:null};
  if(year){ const exact=rows.find(r=>r.year===String(year)); if(exact) return exact; }
  rows.sort((a,b)=>Number(b.year)-Number(a.year));  // Último año primero
  return rows[0];
}

/**
 * Llama a la API WDI para múltiples países y construye una tabla homogénea:
 * - `access_internet_pct`  (IT.NET.USER.ZS)
 * - `broadband_speed_mbps` (IT.NET.BNDW.PC → Mbps; si falta, usa proxy IT.NET.BBND.P2)
 * - `fixed_broadband_subs_per100` (IT.NET.BBND.P2)
 * Además arma `meta` con el año resuelto por país y la fuente usada para velocidad.
 * @param {{countries:string[], year?:string|number}} param0
 * @returns {Promise<{rows:Array, meta:Object}>}
 */
async function fetchIndicatorsFromAPI({countries,year}){
  const iso=countries.map(resolveISO).filter(Boolean);
  const out=[]; const meta={requested:countries,resolved:iso,perCountryYear:{},speedSource:{}};

  for(const code of iso){
    // Llamadas por indicador
    const sUsers=await wdiIndicatorForCountry(code,WDI.users_internet_pct);
    const sBdw=await wdiIndicatorForCountry(code,WDI.bandwidth_bps_per_user);
    const sFbb=await wdiIndicatorForCountry(code,WDI.fixed_broadband_per100);

    // Selección del año (exacto o último disponible)
    const users=pick(sUsers,year); const bdw=pick(sBdw,year); const fbb=pick(sFbb,year);

    // Conversión de bps → Mbps; si falta, usar proxy (suscripciones/100) y marcar fuente
    let speedMbps = bdw.value!=null ? (bdw.value/1e6) : null; let speedSrc='bandwidth_bps_per_user';
    if(speedMbps==null){ const fbSeries=await wdiIndicatorForCountry(code,WDI.speed_fallback_subs_per100); const fb=pick(fbSeries,year); if(fb.value!=null){ speedMbps=fb.value; speedSrc='fixed_broadband_subs_per100 (proxy)'; } }

    // Metadatos de año por país y fuente de velocidad
    meta.speedSource[code]=speedSrc; meta.perCountryYear[code]=users.year||bdw.year||fbb.year||null;

    // Fila normalizada de salida
    out.push({
      country: Object.keys(ISO3).find(k=>ISO3[k]===code)||code,  // Devuelve nombre original si existe en el mapa; si no, ISO-3
      year: users.year||bdw.year||fbb.year||null,
      access_internet_pct: users.value,
      fixed_broadband_subs_per100: fbb.value,
      broadband_speed_mbps: speedMbps,
      mobile_data_cost_pct_income: null // Placeholder por si en el futuro se incorpora costo de datos
    });
  }

  return { rows: out, meta };
}

/**
 * Conversión numérica flexible para archivos subidos:
 * - Soporta "," como decimal y "." como separador de miles (y viceversa).
 * - Retorna null si no es convertible.
 * @param {any} v
 * @returns {number|null}
 */
function toNumFlexible(v){ if(v==null||v==='') return null; const s=String(v).trim(); if(s.includes(',')&&!s.includes('.')) return Number(s.replace(',', '.'))||null; if(s.includes('.')&&s.includes(',')) return Number(s.replace(/\./g,'').replace(',', '.'))||null; const n=Number(s); return Number.isFinite(n)?n:null; }

/**
 * Normaliza filas de entrada (CSV/JSON) a las columnas esperadas por el modelo:
 * - country / pais / País / Pais
 * - year (si falta, usa defaultYear)
 * - access_internet_pct
 * - fixed_broadband_subs_per100
 * - broadband_speed_mbps
 * - mobile_data_cost_pct_income (opcional)
 * Filtra filas sin país y valida estructura mínima.
 * @param {Array<Object>} rows
 * @param {string|number|null} defaultYear
 * @returns {Array<Object>}
 * @throws Error si no hay filas válidas con país.
 */
function normalizeRows(rows,defaultYear){
  const map=(r)=>({
    country: r.country||r.pais||r.País||r.Pais,
    year: r.year||r.anio||r.año||defaultYear||null,
    access_internet_pct: toNumFlexible(r.access_internet_pct??r.acceso_internet_pct??r.acceso),
    fixed_broadband_subs_per100: toNumFlexible(r.fixed_broadband_subs_per100??r.banda_fija_100??r.banda_fija),
    broadband_speed_mbps: toNumFlexible(r.broadband_speed_mbps??r.velocidad_ba_mbps??r.velocidad),
    mobile_data_cost_pct_income: toNumFlexible(r.mobile_data_cost_pct_income??r.costo_datos_pct_ingreso??r.costo),
  });

  const out=rows.map(map).filter(r=>r.country);
  if(!out.length) throw new Error('Estructura no válida: faltan columnas');
  return out;
}

/**
 * Parsea un archivo subido por el usuario (CSV o JSON) y retorna filas normalizadas.
 * - Si es JSON: parsea y normaliza.
 * - Si es CSV: autodetecta delimitador (coma o punto y coma), usa encabezados y salta líneas vacías.
 * @param {{buffer:Buffer, mimetype?:string, originalname?:string}} file - Archivo recibido por multer.
 * @param {string|number|null} defaultYear - Año por defecto si la fila no trae año.
 * @returns {Promise<Array<Object>>}
 * @throws Error si el CSV tiene errores de parseo o la estructura es inválida.
 */
async function parseUpload(file,defaultYear){
  const mime=file.mimetype||'';

  // JSON (por mimetype o por extensión)
  if(mime.includes('json')||file.originalname.toLowerCase().endsWith('.json')){
    const text=file.buffer.toString('utf8');
    const arr=JSON.parse(text);
    return normalizeRows(arr,defaultYear);
  }

  // CSV (autodetección de delimitador en la primera línea)
  const text=file.buffer.toString('utf8');
  const firstLine=text.split(/\r?\n/)[0]||'';
  const commas=(firstLine.match(/,/g)||[]).length;
  const semis=(firstLine.match(/;/g)||[]).length;
  const delimiter= semis>commas ? ';' : ',';

  const parsed = Papa.parse(text,{header:true,skipEmptyLines:true,delimiter});
  if(parsed.errors?.length) throw new Error('CSV parse error');

  return normalizeRows(parsed.data,defaultYear);
}

// API pública del módulo (usado por server.js / model.js)
module.exports = { fetchIndicatorsFromAPI, parseUpload, resolveISO };
