// ----------------------------------------
// model.js — Subsistema de Modelos
// ----------------------------------------
// - Normaliza (min–max) indicadores por país y calcula un score (0–1) con pesos.
// - Genera datasets para Chart.js (radar y barras).
// - Produce hallazgos (insights) simples para el informe.
// Nota: Se añaden comentarios y JSDoc sin modificar la lógica original.

/**
 * Construye la comparación por país y calcula pesos/score.
 * Reglas:
 *  - Agrupa por país (si llegan filas duplicadas, conserva el valor numérico válido con `pick`).
 *  - Detecta qué ejes tienen datos (Uso/Infra/Capacidad).
 *  - Normaliza cada eje con min–max → [0,1]. Faltantes → 0.5.
 *  - Asigna pesos uniformes entre ejes disponibles (los no disponibles pesan 0).
 *  - score = sum(norm_i * peso_i), redondeado a 2 decimales.
 *  - Ordena por score desc y asigna rank.
 * @param {Array<{
 *   country:string, year?:string|number|null,
 *   access_internet_pct?:number|null,
 *   fixed_broadband_subs_per100?:number|null,
 *   broadband_speed_mbps?:number|null
 * }>} rows
 * @returns {{comparison:Array, weights:{access:number, infra:number, capacity:number}}}
 */
function buildComparisonWithWeights(rows){
  // Consolidar filas por país (último valor válido para cada indicador)
  const byCountry={};
  for(const r of rows){
    byCountry[r.country]={
      country:r.country,
      year:r.year??byCountry[r.country]?.year??null,
      access_internet_pct:pick(r.access_internet_pct,byCountry[r.country]?.access_internet_pct),
      fixed_broadband_subs_per100:pick(r.fixed_broadband_subs_per100,byCountry[r.country]?.fixed_broadband_subs_per100),
      broadband_speed_mbps:pick(r.broadband_speed_mbps,byCountry[r.country]?.broadband_speed_mbps)
    };
  }

  // Lista final de países con sus valores brutos consolidados
  const list=Object.values(byCountry);

  // Presencia de datos por eje (para calcular pesos y normalización)
  const hasAccess=list.some(x=>isNum(x.access_internet_pct));
  const hasInfra =list.some(x=>isNum(x.fixed_broadband_subs_per100));
  const hasCap   =list.some(x=>isNum(x.broadband_speed_mbps));

  // Normalización min–max por eje; si el eje no tiene datos, se imputa 0.5
  const acc = hasAccess?scale(list.map(x=>x.access_internet_pct),{higherIsBetter:true}):list.map(_=>0.5);
  const inf = hasInfra ?scale(list.map(x=>x.fixed_broadband_subs_per100),{higherIsBetter:true}):list.map(_=>0.5);
  const cap = hasCap   ?scale(list.map(x=>x.broadband_speed_mbps),{higherIsBetter:true}):list.map(_=>0.5);

  // Pesos uniformes entre ejes disponibles (los no disponibles pesan 0)
  const active=[hasAccess,hasInfra,hasCap].filter(Boolean).length||1;
  const weights={ access:hasAccess?1/active:0, infra:hasInfra?1/active:0, capacity:hasCap?1/active:0 };

  // Score por país = promedio ponderado de los ejes normalizados
  list.forEach((x,i)=>{
    x.norm={ access:acc[i], infra:inf[i], capacity:cap[i] };
    x.score=Math.round((acc[i]*weights.access + inf[i]*weights.infra + cap[i]*weights.capacity)*100)/100;
  });

  // Ranking (desc) por score
  list.sort((a,b)=>b.score-a.score);
  list.forEach((x,i)=>x.rank=i+1);

  return { comparison:list, weights };
}

/**
 * Determina si un valor es numérico finito.
 * @param {any} v
 * @returns {boolean}
 */
function isNum(v){return Number.isFinite(v);} 

/**
 * Elige el primer valor numérico finito entre `a` y `b`.
 * - Si `a` es número → `a`
 * - Si no, si `b` es número → `b`
 * - De lo contrario → null
 * @param {any} a
 * @param {any} b
 * @returns {number|null}
 */
function pick(a,b){return isNum(a)?a:(isNum(b)?b:null);}

/**
 * Normalización min–max con manejo de faltantes:
 * - Convierte valores no numéricos a null.
 * - Si no hay válidos → todos 0.5.
 * - Si min == max → todos 1 (no hay dispersión).
 * - Si valor es null → 0.5.
 * - `higherIsBetter` invierte o no la escala.
 * @param {Array<number|null|undefined>} arr
 * @param {{higherIsBetter:boolean}} param1
 * @returns {number[]} arreglo normalizado en [0,1]
 */
function scale(arr,{higherIsBetter}){
  const vals=arr.map(v=>(Number.isFinite(v)?v:null));
  const valid=vals.filter(v=>v!=null);
  if(!valid.length) return arr.map(()=>0.5);
  const min=Math.min(...valid), max=Math.max(...valid);
  if(max===min) return arr.map(v=>(v!=null?1:0.5));
  return vals.map(v=>{
    if(v==null) return 0.5;
    const norm=(v-min)/(max-min);
    return higherIsBetter?norm:1-norm;
  });
}

/**
 * Construye el dataset para Chart.js (radar):
 * - Labels: nombres legibles de los 3 ejes.
 * - Datasets: un dataset por país con sus valores normalizados.
 * @param {Array} comparison - Salida de buildComparisonWithWeights().comparison
 * @returns {{labels:any[], datasets:Array<{label:string, data:number[]}>}}
 */
function toRadarDataset(comparison){
  const labels=[ ['Uso de Internet','(%)'], ['Banda ancha fija','(suscripciones/100)'], ['Ancho de banda intl.','(Mbps/usuario)'] ];
  const datasets=comparison.map(c=>({ label:c.country, data:[c.norm.access, c.norm.infra, c.norm.capacity] }));
  return {labels,datasets};
}

/**
 * Construye el dataset para Chart.js (barras):
 * - Eje X: países
 * - Serie: score (0–1)
 * @param {Array} comparison - Salida de buildComparisonWithWeights().comparison
 * @returns {{labels:string[], datasets:Array<{label:string, data:number[]}>}}
 */
function toBarDataset(comparison){ return { labels:comparison.map(c=>c.country), datasets:[{label:'Score (0–1)', data:comparison.map(c=>c.score)}] }; }

/**
 * Desviación estándar muestral de un arreglo numérico (ignora no numéricos).
 * @param {Array<any>} arr
 * @returns {number}
 */
function stdev(arr){
  const x=arr.filter(v=>Number.isFinite(v));
  if(x.length<2)return 0;
  const m=x.reduce((a,b)=>a+b,0)/x.length;
  const v=x.reduce((s,v)=>s+(v-m)*(v-m),0)/(x.length-1);
  return Math.sqrt(v);
}

/**
 * Índice del valor máximo en un arreglo numérico (ignora no numéricos).
 * Devuelve -1 si no hay valores numéricos.
 * @param {Array<any>} arr
 * @returns {number}
 */
function maxIdx(arr){
  let m=-Infinity, idx=-1;
  arr.forEach((v,i)=>{
    if(Number.isFinite(v) && v>m){ m=v; idx=i; }
  });
  return idx;
}

/**
 * Proporción de valores faltantes (no numéricos) en un arreglo.
 * @param {Array<any>} arr
 * @returns {number} en [0,1]
 */
function missingShare(arr){
  const n=arr.length||1;
  const miss=arr.filter(v=>!Number.isFinite(v)).length;
  return miss/n;
}

/**
 * Genera hallazgos (insights) simples a partir de la comparación:
 * - Mejor score y brecha con el último.
 * - Eje más diferenciador (mayor desv. estándar) con su peso.
 * - Líder por indicador bruto.
 * - Nota si hubo valores faltantes imputados (0.5).
 * @param {Array} comparison - Salida de buildComparisonWithWeights().comparison
 * @param {{access:number,infra:number,capacity:number}} weights
 * @returns {string[]} lista de frases
 */
function buildReportInsights(comparison, weights){
  const out=[]; if(!comparison?.length) return out;

  // Top y brecha
  const top=comparison[0], last=comparison[comparison.length-1];
  out.push(`Mejor score global: ${top.country} (${top.score}).`);
  if(comparison.length>1) out.push(`Brecha entre 1.º y último: ${Math.round((top.score-last.score)*100)/100} puntos (0–1).`);

  // Dispersión por eje (en normalizados) y eje más diferenciador
  const accArr=comparison.map(c=>c.norm.access);
  const infArr=comparison.map(c=>c.norm.infra);
  const capArr=comparison.map(c=>c.norm.capacity);
  const sd=[ ['Uso',stdev(accArr),weights.access], ['Infraestructura fija',stdev(infArr),weights.infra], ['Capacidad',stdev(capArr),weights.capacity] ].sort((a,b)=>b[1]-a[1]);
  const [driver, sdv, w] = sd[0];
  if(sdv>0) out.push(`Eje con mayor diferenciación: ${driver} (desv.est. ${Math.round(sdv*100)/100}, peso ${Math.round(w*100)/100}).`);

  // Líderes por indicador bruto
  const rawAcc=comparison.map(c=>c.access_internet_pct);
  const rawInf=comparison.map(c=>c.fixed_broadband_subs_per100);
  const rawCap=comparison.map(c=>c.broadband_speed_mbps);
  const iA=maxIdx(rawAcc), iI=maxIdx(rawInf), iC=maxIdx(rawCap);
  if(iA>=0) out.push(`Líder en uso: ${comparison[iA].country} (${Math.round(rawAcc[iA]*100)/100}%).`);
  if(iI>=0) out.push(`Líder en infraestructura fija: ${comparison[iI].country} (${Math.round(rawInf[iI]*100)/100} suscripciones/100).`);
  if(iC>=0) out.push(`Líder en capacidad: ${comparison[iC].country} (${Math.round(rawCap[iC]*100)/100} Mbps/usuario).`);

  // Nota por faltantes
  const missPct = Math.max(missingShare(rawAcc), missingShare(rawInf), missingShare(rawCap));
  if(missPct>0){ out.push('Nota: hay valores faltantes; se imputó 0.5 en la normalización.'); }

  return out;
}

// API pública del módulo
module.exports={ buildComparisonWithWeights, toRadarDataset, toBarDataset, buildReportInsights };
