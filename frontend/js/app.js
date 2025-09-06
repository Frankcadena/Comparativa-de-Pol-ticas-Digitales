// Contextos de lienzo (canvas) de Chart.js obtenidos del DOM.
// Cada variable referencia el <canvas> correspondiente donde se pintarán las gráficas.
const radarCtx = document.getElementById('radar'); const barsCtx = document.getElementById('bars');
const ctxAccessInfra = document.getElementById('chartAccessInfra'); const ctxUse = document.getElementById('chartUse');
const ctxPct = document.getElementById('chartPctInternet'); const ctxSpeed = document.getElementById('chartSpeed');

// Instancias de gráficos (se guardan para poder destruirlas antes de repintar) y último payload recibido.
let radarChart, barChart, chartAccessInfra, chartUse, chartPct, chartSpeed, lastPayload;

/**
 * Crea un "chip" visual (pill) para mostrar metadatos breves (países, ISO, años).
 * @param {string} text - Texto a mostrar dentro del chip.
 * @returns {HTMLSpanElement} - Elemento <span> con estilos de chip.
 */
function chip(text){ const s=document.createElement('span'); s.className='px-2 py-1 text-xs rounded-full bg-gray-100 border'; s.textContent=text; return s; }

/**
 * Renderiza chips con metadatos de la última respuesta (request y resolved) bajo el área de controles.
 * - Muestra países solicitados, códigos ISO y año por país resuelto.
 * @param {object} meta - Objeto meta devuelto por el backend (meta.request, meta.resolved, etc.).
 */
function renderChips(meta){ const c=document.getElementById('chips'); c.innerHTML=''; if(!meta)return; const req=meta.request||{}; c.appendChild(chip('Países: '+(req.countries||[]).join(', '))); if(meta.resolved?.resolved)c.appendChild(chip('ISO: '+meta.resolved.resolved.join(', '))); const yrs=meta.resolved?.perCountryYear||{}; const yrText=Object.entries(yrs).map(([k,v])=>`${k}:${v||'s/d'}`).join(' · '); c.appendChild(chip('Año por país: '+yrText)); }

/**
 * Pinta en el <pre id="dbg"> el objeto de depuración como JSON formateado.
 * @param {any} obj - Objeto a serializar.
 */
function dbg(obj){ const el=document.getElementById('dbg'); if(el) el.textContent=JSON.stringify(obj,null,2); }

/**
 * Formatea números a dos decimales. Para null/undefined retorna un em dash (—).
 * @param {number|null|undefined} n
 * @returns {string}
 */
function fmt(n){ if(n==null)return '—'; if(typeof n==='number') return (Math.round(n*100)/100).toString(); return String(n); }

/**
 * Limpia/serializa un valor para exportación CSV:
 * - Nulos → cadena vacía
 * - Números → dos decimales
 * - Otros → String(value)
 * @param {any} v
 * @returns {string}
 */
function clean(v){ return (v==null ? '' : (typeof v==='number' ? (Math.round(v*100)/100) : String(v)).toString()); }

/**
 * Alterna entre estado vacío y secciones con resultados.
 * @param {boolean} show - true: muestra secciones de resultados; false: vuelve al estado vacío.
 */
function setResultsVisible(show){ ['sectionSynth','sectionIndicators','sectionInsights','sectionDetail','debug'].forEach(id=>document.getElementById(id).classList.toggle('hidden',!show)); document.getElementById('emptyState').classList.toggle('hidden',show); document.getElementById('chips').classList.toggle('hidden',!show); }

/**
 * Crea/repinta el gráfico Radar con datos normalizados (0–1).
 * Destruye la instancia previa si existe para evitar fugas de memoria y overlays.
 * @param {{labels:any[], datasets:{label:string, data:number[]}[]}} data
 */
function makeRadar(data){ radarChart&&radarChart.destroy(); radarChart=new Chart(radarCtx,{type:'radar',data:{labels:data.labels,datasets:data.datasets.map(ds=>({label:ds.label,data:ds.data}))},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top'}},scales:{r:{min:0,max:1}}}}); }

/**
 * Crea/repinta el gráfico de barras vertical para el Score global.
 * @param {{labels:string[], datasets:{label:string, data:number[]}[]}} data
 */
function makeBars(data){ barChart&&barChart.destroy(); barChart=new Chart(barsCtx,{type:'bar',data:{labels:data.labels,datasets:data.datasets.map(ds=>({label:ds.label,data:ds.data}))},options:{responsive:true}}); }

/**
 * Construye una barra horizontal (indexAxis: 'y').
 * @param {HTMLCanvasElement} ctx - Canvas destino.
 * @param {string} title - Etiqueta del dataset.
 * @param {string[]} labels - Etiquetas de categorías (países).
 * @param {(number|null|undefined)[]} values - Valores; null/undefined → NaN (Chart.js los omite).
 * @returns {Chart}
 */
function barHorizontal(ctx,title,labels,values){ return new Chart(ctx,{type:'bar',data:{labels,datasets:[{label:title,data:values.map(v=>(v==null?NaN:v))}]},options:{responsive:true,indexAxis:'y'}}); }

/**
 * Construye una línea sencilla para comparar un indicador entre países (tratado como categorías).
 * @param {HTMLCanvasElement} ctx
 * @param {string} title
 * @param {string[]} labels
 * @param {(number|null|undefined)[]} values
 * @returns {Chart}
 */
function lineChart(ctx,title,labels,values){ return new Chart(ctx,{type:'line',data:{labels,datasets:[{label:title,data:values.map(v=>(v==null?NaN:v)),fill:false}]},options:{responsive:true}}); }

/**
 * Construye un gráfico de área polar para un indicador.
 * @param {HTMLCanvasElement} ctx
 * @param {string[]} labels
 * @param {(number|null|undefined)[]} values
 * @returns {Chart}
 */
function polarAreaChart(ctx,labels,values){ return new Chart(ctx,{type:'polarArea',data:{labels,datasets:[{data:values.map(v=>(v==null?NaN:v))}]},options:{responsive:true}}); }

/**
 * Construye una barra vertical estándar.
 * @param {HTMLCanvasElement} ctx
 * @param {string} title
 * @param {string[]} labels
 * @param {(number|null|undefined)[]} values
 * @returns {Chart}
 */
function verticalBar(ctx,title,labels,values){ return new Chart(ctx,{type:'bar',data:{labels,datasets:[{label:title,data:values.map(v=>(v==null?NaN:v))}]},options:{responsive:true}}); }

/**
 * Dibuja/actualiza las cuatro gráficas por indicador usando los valores brutos del payload.
 * - Infraestructura fija (barra horizontal)
 * - Uso de Internet (línea)
 * - Porcentaje acceso/uso (área polar)
 * - Capacidad (barra vertical)
 * Además muestra un mensaje si se utilizó proxy para la capacidad.
 * @param {{raw:Array, meta:Object}} payload
 */
function renderIndicatorCharts(payload){ const rows=payload.raw||[]; const labels=rows.map(r=>r.country); const accessPct=rows.map(r=>r.access_internet_pct); const fixedPer100=rows.map(r=>r.fixed_broadband_subs_per100); const speedMbps=rows.map(r=>r.broadband_speed_mbps); chartAccessInfra&&chartAccessInfra.destroy(); chartAccessInfra=barHorizontal(ctxAccessInfra,'Banda ancha fija por 100',labels,fixedPer100); chartUse&&chartUse.destroy(); chartUse=lineChart(ctxUse,'Usuarios de Internet (%)',labels,accessPct); chartPct&&chartPct.destroy(); chartPct=polarAreaChart(ctxPct,labels,accessPct); chartSpeed&&chartSpeed.destroy(); chartSpeed=verticalBar(ctxSpeed,'Mbps por usuario (o proxy)',labels,speedMbps); document.getElementById('speedMsg').textContent=(payload.meta?.resolved?.speedSource)?'Si falta IT.NET.BNDW.PC, se usa IT.NET.BBND.P2 como proxy.':''; }

/**
 * Rellena la lista de hallazgos (insights) en la UI.
 * @param {string[]} arr - Arreglo de frases/insights.
 */
function renderInsights(arr){ const ul=document.getElementById('insights'); ul.innerHTML=''; (arr||[]).forEach(t=>{ const li=document.createElement('li'); li.textContent=t; ul.appendChild(li); }); }

/**
 * Llena la tabla de detalle con:
 * - valores brutos,
 * - valores normalizados (norm),
 * - score por país.
 * Además muestra el texto de pesos aplicados.
 * @param {{comparison:Array, weights:Object}} payload
 */
function renderTable(payload){ const tb=document.getElementById('tblBody'); tb.innerHTML=''; (payload.comparison||[]).forEach(r=>{ const tr=document.createElement('tr'); [r.country,r.year??'',fmt(r.access_internet_pct),fmt(r.norm?.access),fmt(r.fixed_broadband_subs_per100),fmt(r.norm?.infra),fmt(r.broadband_speed_mbps),fmt(r.norm?.capacity),fmt(r.score)].forEach((v,i)=>{ const td=document.createElement('td'); td.className='p-2 '+(i>=2?'text-right':''); td.textContent=v; tr.appendChild(td); }); tb.appendChild(tr); }); const w=payload.weights||{access:0,infra:0,capacity:0}; document.getElementById('weightsText').textContent=`Pesos → Uso: ${fmt(w.access)} · Infra: ${fmt(w.infra)} · Capacidad: ${fmt(w.capacity)}`; }

/**
 * Serializa el payload de comparación a CSV (encabezados en inglés para interoperabilidad).
 * @param {{comparison:Array, weights:Object}} payload
 * @returns {string} CSV
 */
function toCSV(payload){ const w=payload.weights||{access:0,infra:0,capacity:0}; const rows=payload.comparison||[]; const header=['country','year','use_pct','fixed_broadband_per100','capacity_mbps_per_user','score','w_access','w_infra','w_capacity']; const out=[header.join(',')]; rows.forEach(r=>out.push([r.country,r.year??'',clean(r.access_internet_pct),clean(r.fixed_broadband_subs_per100),clean(r.broadband_speed_mbps),clean(r.score),w.access,w.infra,w.capacity].join(','))); return out.join('\n'); }

/**
 * Dispara la descarga del CSV generado a partir del último payload.
 * Si no existe un payload previo, muestra una alerta.
 */
function downloadCSV(){ if(!lastPayload) return alert('Primero genere una comparación.'); const blob=new Blob([toCSV(lastPayload)],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='dss_comparacion.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); }

/**
 * Lee los campos del formulario y construye el arreglo de países a consultar:
 * - Toma país principal + países de referencia (separados por coma)
 * - Filtra vacíos y limita a 6 en total (1 principal + 5 referencias).
 * @returns {string[]} Lista de países.
 */
function parseCountries(){ const main=document.getElementById('countryMain').value.trim(); const refs=(document.getElementById('countryRefs').value||'').split(',').map(s=>s.trim()).filter(Boolean); const countries=[main,...refs].filter(Boolean); return countries.slice(0,6); }

/**
 * Llama a la API /api/indicators con los países (y año si se proporcionó),
 * consume el payload y actualiza toda la UI: radar, barras, indicadores, insights, tabla, chips y debug.
 * Manejo de errores:
 * - Muestra alert con mensaje del backend si status != 200.
 */
async function compareViaAPI(){ const countries=parseCountries(); const year=document.getElementById('year').value.trim(); if(!countries.length) return alert('Seleccione al menos el país principal.'); const qs=new URLSearchParams({countries:countries.join(','),...(year&&{year})}); const resp=await fetch(`api/indicators?${qs.toString()}`,{cache:'no-store'}); let payload; if(!resp.ok){ try{payload=await resp.json();}catch(_){}; return alert((payload&&(payload.error+(payload.detail?' • '+payload.detail:'')))||'Error desde API'); } payload=await resp.json(); lastPayload=payload; setResultsVisible(true); makeRadar(payload.charts.radar); makeBars(payload.charts.bars); renderIndicatorCharts(payload); renderInsights(payload.insights); renderTable(payload); renderChips(payload.meta); dbg(payload); }

/**
 * Envía un archivo CSV/JSON al endpoint /api/upload para comparar con datos locales.
 * La respuesta se procesa igual que la de /api/indicators.
 * @param {File} file - Archivo seleccionado por el usuario.
 */
async function compareViaUpload(file){ const year=document.getElementById('year').value.trim(); const form=new FormData(); form.append('file',file); const qs=new URLSearchParams({...(year&&{year})}); const resp=await fetch(`api/upload?${qs.toString()}`,{method:'POST',body:form,cache:'no-store'}); let payload; if(!resp.ok){ try{payload=await resp.json();}catch(_){}; return alert((payload&&(payload.error||payload.detail))||'Error procesando archivo'); } payload=await resp.json(); lastPayload=payload; setResultsVisible(true); makeRadar(payload.charts.radar); makeBars(payload.charts.bars); renderIndicatorCharts(payload); renderInsights(payload.insights); renderTable(payload); renderChips(payload.meta); dbg(payload); }

/**
 * Lanza el diálogo de impresión del navegador (permite “Guardar como PDF”).
 * Requiere que exista un payload previo (para tener contenido que imprimir).
 */
function downloadReport(){ if(!lastPayload) return alert('Primero genere una comparación.'); window.print(); }

/**
 * Limpia el formulario, destruye todas las gráficas y vuelve al estado vacío.
 * También borra el último payload (lastPayload = null).
 */
function clearAll(){ document.getElementById('countryMain').value=''; document.getElementById('countryRefs').value=''; document.getElementById('year').value=''; radarChart&&radarChart.destroy(); barChart&&barChart.destroy(); [chartAccessInfra,chartUse,chartPct,chartSpeed].forEach(ch=>ch&&ch.destroy()); document.getElementById('insights').innerHTML=''; document.getElementById('tblBody').innerHTML=''; document.getElementById('weightsText').textContent=''; document.getElementById('chips').innerHTML=''; document.getElementById('dbg').textContent=''; document.getElementById('speedMsg').textContent=''; lastPayload=null; setResultsVisible(false); }

// Listeners de UI: conectan botones e inputs con las funciones anteriores.
document.getElementById('btnApi').addEventListener('click',compareViaAPI);
document.getElementById('file').addEventListener('change',(e)=>{ if(e.target.files?.[0]) compareViaUpload(e.target.files[0]); });
document.getElementById('btnReport').addEventListener('click',downloadReport);
document.getElementById('btnCSV').addEventListener('click',downloadCSV);
document.getElementById('btnClear').addEventListener('click',clearAll);
