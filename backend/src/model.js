function buildComparisonWithWeights(rows){
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
  const list=Object.values(byCountry);

  const hasAccess=list.some(x=>isNum(x.access_internet_pct));
  const hasInfra =list.some(x=>isNum(x.fixed_broadband_subs_per100));
  const hasCap   =list.some(x=>isNum(x.broadband_speed_mbps));

  const acc = hasAccess?scale(list.map(x=>x.access_internet_pct),{higherIsBetter:true}):list.map(_=>0.5);
  const inf = hasInfra ?scale(list.map(x=>x.fixed_broadband_subs_per100),{higherIsBetter:true}):list.map(_=>0.5);
  const cap = hasCap   ?scale(list.map(x=>x.broadband_speed_mbps),{higherIsBetter:true}):list.map(_=>0.5);

  const active=[hasAccess,hasInfra,hasCap].filter(Boolean).length||1;
  const weights={ access:hasAccess?1/active:0, infra:hasInfra?1/active:0, capacity:hasCap?1/active:0 };

  list.forEach((x,i)=>{
    x.norm={ access:acc[i], infra:inf[i], capacity:cap[i] };
    x.score=round2(acc[i]*weights.access + inf[i]*weights.infra + cap[i]*weights.capacity);
  });

  list.sort((a,b)=>b.score-a.score);
  list.forEach((x,i)=>x.rank=i+1);
  return { comparison:list, weights };
}

function isNum(v){return Number.isFinite(v);} 
function pick(a,b){return isNum(a)?a:(isNum(b)?b:null);}
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
function round2(n){return Math.round(n*100)/100;}

function toRadarDataset(comparison){
  const labels=[
    ['Uso de Internet','(%)'],
    ['Banda ancha fija','(suscripciones/100)'],
    ['Ancho de banda intl.','(Mbps/usuario)']
  ];
  const datasets=comparison.map(c=>({ label:c.country, data:[c.norm.access, c.norm.infra, c.norm.capacity] }));
  return {labels,datasets};
}
function toBarDataset(comparison){
  return { labels:comparison.map(c=>c.country), datasets:[{label:'Score (0–1)', data:comparison.map(c=>c.score)}] };
}

function stdev(arr){ const x=arr.filter(v=>Number.isFinite(v)); if(x.length<2)return 0; const m=x.reduce((a,b)=>a+b,0)/x.length; const v=x.reduce((s,v)=>s+(v-m)*(v-m),0)/(x.length-1); return Math.sqrt(v); }
function maxIdx(arr){ let m=-Infinity, idx=-1; arr.forEach((v,i)=>{ if(Number.isFinite(v) && v>m){ m=v; idx=i; } }); return idx; }
function missingShare(arr){ const n=arr.length||1; const miss=arr.filter(v=>!Number.isFinite(v)).length; return miss/n; }

function buildReportInsights(comparison, weights){
  const out=[]; if(!comparison?.length) return out;
  const top=comparison[0], last=comparison[comparison.length-1];
  out.push(`Mejor score global: ${top.country} (${top.score}).`);
  if(comparison.length>1) out.push(`Brecha entre 1.º y último: ${round2(top.score-last.score)} puntos (0–1).`);
  const accArr=comparison.map(c=>c.norm.access);
  const infArr=comparison.map(c=>c.norm.infra);
  const capArr=comparison.map(c=>c.norm.capacity);
  const sd=[['Uso',stdev(accArr),weights.access],['Infraestructura fija',stdev(infArr),weights.infra],['Capacidad',stdev(capArr),weights.capacity]].sort((a,b)=>b[1]-a[1]);
  const [driver, sdv, w] = sd[0];
  if(sdv>0) out.push(`Eje con mayor diferenciación: ${driver} (desv.est. ${round2(sdv)}, peso ${round2(w)}).`);
  const rawAcc=comparison.map(c=>c.access_internet_pct);
  const rawInf=comparison.map(c=>c.fixed_broadband_subs_per100);
  const rawCap=comparison.map(c=>c.broadband_speed_mbps);
  const iA=maxIdx(rawAcc), iI=maxIdx(rawInf), iC=maxIdx(rawCap);
  if(iA>=0) out.push(`Líder en uso: ${comparison[iA].country} (${round2(rawAcc[iA])}%).`);
  if(iI>=0) out.push(`Líder en infraestructura fija: ${comparison[iI].country} (${round2(rawInf[iI])} suscripciones/100).`);
  if(iC>=0) out.push(`Líder en capacidad: ${comparison[iC].country} (${round2(rawCap[iC])} Mbps/usuario).`);
  const missPct = Math.max(missingShare(rawAcc), missingShare(rawInf), missingShare(rawCap));
  if(missPct>0){ out.push('Nota: hay valores faltantes en alguna métrica; se imputó 0.5 (neutral) en la normalización.'); }
  return out;
}
module.exports={ buildComparisonWithWeights, toRadarDataset, toBarDataset, buildReportInsights };
