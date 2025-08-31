const Papa = require('papaparse');
const ISO3 = require('./iso3');
const fetch = globalThis.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));
const WDI_BASE = 'https://api.worldbank.org/v2';
const WDI = { users_internet_pct:'IT.NET.USER.ZS', bandwidth_bps_per_user:'IT.NET.BNDW.PC', fixed_broadband_per100:'IT.NET.BBND.P2', speed_fallback_subs_per100:'IT.NET.BBND.P2' };

function stripAccents(s){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function titleCase(s){return s.charAt(0).toUpperCase()+s.slice(1).toLowerCase();}

function resolveISO(name){
  if(!name) return null;
  const raw=String(name).trim();
  if(/^[A-Za-z]{3}$/.test(raw)) return raw.toUpperCase(); // ISO-3 directo
  const noAcc=stripAccents(raw);
  const t1=titleCase(raw);
  const t2=titleCase(noAcc);
  const code = ISO3[raw] || ISO3[noAcc] || ISO3[t1] || ISO3[t2];
  return code || null; // si no hay match, null
}

async function wdiIndicatorForCountry(iso3, indicator){
  const url=`${WDI_BASE}/country/${iso3}/indicator/${indicator}?format=json&per_page=20000`;
  const r=await fetch(url,{headers:{'accept':'application/json','user-agent':'dss-data360/validated'}});
  if(!r.ok) throw new Error(`WDI HTTP ${r.status}`);
  const data=await r.json();
  if(!Array.isArray(data)||data.length<2) return [];
  return data[1]||[];
}

function toNum(v){ if(v==null||v==='') return null; const n=Number(String(v).replace(/\s/g,'').replace(',', '.')); return Number.isFinite(n)?n:null; }
function pick(series, year){
  const rows=(series||[]).filter(x=>x && x.country && x.date && x.value!=null).map(x=>({year:String(x.date),value:toNum(x.value)}));
  if(!rows.length) return {year:null,value:null};
  if(year){ const exact=rows.find(r=>r.year===String(year)); if(exact) return exact; }
  rows.sort((a,b)=>Number(b.year)-Number(a.year));
  return rows[0];
}

async function fetchIndicatorsFromAPI({countries,year}){
  const iso=countries.map(resolveISO).filter(Boolean);
  const out=[]; const meta={requested:countries,resolved:iso,perCountryYear:{},speedSource:{}};
  for(const code of iso){
    const sUsers=await wdiIndicatorForCountry(code,WDI.users_internet_pct);
    const sBdw=await wdiIndicatorForCountry(code,WDI.bandwidth_bps_per_user);
    const sFbb=await wdiIndicatorForCountry(code,WDI.fixed_broadband_per100);
    const users=pick(sUsers,year); const bdw=pick(sBdw,year); const fbb=pick(sFbb,year);
    let speedMbps = bdw.value!=null ? (bdw.value/1e6) : null; let speedSrc='bandwidth_bps_per_user';
    if(speedMbps==null){ const fbSeries=await wdiIndicatorForCountry(code,WDI.speed_fallback_subs_per100); const fb=pick(fbSeries,year); if(fb.value!=null){ speedMbps=fb.value; speedSrc='fixed_broadband_subs_per100 (proxy)'; } }
    meta.speedSource[code]=speedSrc; meta.perCountryYear[code]=users.year||bdw.year||fbb.year||null;
    out.push({ country:Object.keys(ISO3).find(k=>ISO3[k]===code)||code, year:users.year||bdw.year||fbb.year||null, access_internet_pct:users.value, fixed_broadband_subs_per100:fbb.value, broadband_speed_mbps:speedMbps, mobile_data_cost_pct_income:null });
  }
  return { rows: out, meta };
}

function toNumFlexible(v){ if(v==null||v==='') return null; const s=String(v).trim(); if(s.includes(',')&&!s.includes('.')) return Number(s.replace(',', '.'))||null; if(s.includes('.')&&s.includes(',')) return Number(s.replace(/\./g,'').replace(',', '.'))||null; const n=Number(s); return Number.isFinite(n)?n:null; }
function normalizeRows(rows,defaultYear){
  const map=(r)=>({ country:r.country||r.pais||r.País||r.Pais, year:r.year||r.anio||r.año||defaultYear||null, access_internet_pct:toNumFlexible(r.access_internet_pct??r.acceso_internet_pct??r.acceso), fixed_broadband_subs_per100:toNumFlexible(r.fixed_broadband_subs_per100??r.banda_fija_100??r.banda_fija), broadband_speed_mbps:toNumFlexible(r.broadband_speed_mbps??r.velocidad_ba_mbps??r.velocidad), mobile_data_cost_pct_income:toNumFlexible(r.mobile_data_cost_pct_income??r.costo_datos_pct_ingreso??r.costo), });
  const out=rows.map(map).filter(r=>r.country);
  if(!out.length) throw new Error('Estructura no válida: faltan columnas');
  return out;
}

async function parseUpload(file,defaultYear){
  const mime=file.mimetype||'';
  if(mime.includes('json')||file.originalname.toLowerCase().endsWith('.json')){
    const text=file.buffer.toString('utf8'); const arr=JSON.parse(text); return normalizeRows(arr,defaultYear);
  }
  const text=file.buffer.toString('utf8');
  const firstLine=text.split(/\r?\n/)[0]||'';
  const commas=(firstLine.match(/,/g)||[]).length;
  const semis=(firstLine.match(/;/g)||[]).length;
  const delimiter= semis>commas ? ';' : ',';
  const parsed = Papa.parse(text,{header:true,skipEmptyLines:true,delimiter});
  if(parsed.errors?.length) throw new Error('CSV parse error');
  return normalizeRows(parsed.data,defaultYear);
}

module.exports = { fetchIndicatorsFromAPI, parseUpload, resolveISO };
