// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════
const TY=99.5, TD=5000;
const SHIFTS=[
  {name:"Morning",   label:"Morning (07-15)",   color:"#3b82f6"},
  {name:"Afternoon", label:"Afternoon (15-23)", color:"#f59e0b"},
  {name:"Night",     label:"Night (23-07)",     color:"#a78bfa"},
];
const DAYS=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const CC=["#3b82f6","#f59e0b","#22c55e","#ef4444","#a78bfa","#f472b6","#34d399","#fb923c"];

// ═══════════════════════════════════════════════════════
// DATETIME
// ═══════════════════════════════════════════════════════
function parseDT(s){
  s=s.trim();
  const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if(!m)return null;
  const[,mm,dd,yyyy,hh,min,ss]=m;
  return new Date(+yyyy,+mm-1,+dd,+hh,+min,+(ss||0));
}
function isoWeek(d){
  const dt=new Date(d);dt.setHours(0,0,0,0);dt.setDate(dt.getDate()+3-(dt.getDay()+6)%7);
  const w1=new Date(dt.getFullYear(),0,4);
  return dt.getFullYear()+'-W'+String(1+Math.round(((dt-w1)/864e5-3+(w1.getDay()+6)%7)/7)).padStart(2,'0');
}
function ycFmtDate(d){return String(d.getMonth()+1).padStart(2,'0')+'/'+String(d.getDate()).padStart(2,'0')+'/'+d.getFullYear();}
function ycShift(h){if(h>=7&&h<15)return"Morning";if(h>=15&&h<23)return"Afternoon";return"Night";}

// ═══════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════
function mkRow(dtStr,cust,model,sn,side,comp,defect){
  const dt=parseDT(dtStr);if(!dt)return null;
  return{datetime:dt,dtStr,week:isoWeek(dt),dateStr:ycFmtDate(dt),
    hour:dt.getHours(),shift:ycShift(dt.getHours()),dow:dt.getDay(),
    customer:cust,model,sn,side:side.toUpperCase().replace('BOTTOM','BOT'),comp,defect};
}

// Real Firebase-backed data now — no seeded sample rows. These three arrays
// are populated by the smt_defects / smt_prodvol / smt_modeltiers listeners
// in ui.js's initListeners(), the same way customers/models/complaints are.
let rawDef=[];
let prodVol=[];
let modelTiers=[];

// ═══════════════════════════════════════════════════════
// DEFECT LIBRARY
// ═══════════════════════════════════════════════════════
const LIB=[
  {id:1,type:"Solder Bridge",cat:"Paste Printing",icon:"⚡",
   causes:["Stencil aperture oversized","Excess paste volume","Board misregistration"],
   whys:["Why bridge? → Excess paste between pads","Why excess? → Aperture oversized","Why oversized? → Stencil not updated after ECO","Why? → No ECO-to-stencil review gate","RC: Process gate missing in ECO workflow"],
   actions:["Check stencil aperture vs pad (IPC-7525)","Verify SPI volume <100%","Update stencil if aperture >10% over pad"],
   prev:"SPI alarm at 90% paste volume. Mandatory stencil review on every ECO."},
  {id:2,type:"Missing Component",cat:"Pick & Place",icon:"❌",
   causes:["Feeder jam","Empty reel","Nozzle clog"],
   whys:["Why missing? → Not picked","Why? → Feeder misfeed","Why? → Tape jam","Why? → PM overdue","RC: PM schedule not enforced"],
   actions:["Inspect feeder tape path","Lower misfeed alarm to 2","Perform feeder PM"],
   prev:"Weekly feeder PM checklist. AOI 100% on critical models."},
  {id:3,type:"Insufficient Solder",cat:"Paste Printing",icon:"🔻",
   causes:["Low paste volume","Worn squeegee","Stencil clog"],
   whys:["Why insufficient? → Low paste","Why low? → Squeegee worn","Why worn? → Exceeded stroke limit","Why? → No blade KPI","RC: No blade replacement trigger"],
   actions:["Replace blade >400k strokes","SPI alarm <80%","Clean stencil every 10 boards"],
   prev:"Blade log with stroke counter. SPI trending per model."},
  {id:4,type:"Tombstone",cat:"Reflow Oven",icon:"🪦",
   causes:["Uneven pad heating","Profile too fast","Paste imbalance"],
   whys:["Why tombstone? → One pad melts first","Why? → Oven zone drift","Why? → Thermocouple uncalibrated","Why? → Not in PM scope","RC: Oven PM incomplete"],
   actions:["Profile with KIC thermocouple","Check zones ±3°C","Recalibrate quarterly"],
   prev:"Quarterly oven profiling. SPC on zone temperatures."},
  {id:5,type:"Component Shift",cat:"Pick & Place",icon:"↗️",
   causes:["Vision offset","Nozzle worn","Conveyor vibration"],
   whys:["Why shift? → Off-center","Why? → Vision offset 0.3mm","Why? → Cal plate dirty","Why? → SOP not followed","RC: No verify after cleaning"],
   actions:["Recalibrate vision","Add post-clean verify to WI","Check nozzle <0.05mm"],
   prev:"Daily vision calibration. Nozzle inspection every 500k."},
  {id:6,type:"Cold Solder",cat:"Reflow Oven",icon:"❄️",
   causes:["Peak temp low","TAL short","Oxidized leads","Expired paste"],
   whys:["Why cold? → Poor bond","Why? → TAL<45s","Why? → Wrong profile","Why? → No model lock","RC: No profile barcode interlock"],
   actions:["Verify correct profile","Confirm TAL 45-90s","Check paste expiry"],
   prev:"Profile barcode lock per model. Paste FIFO."},
  {id:7,type:"Solder Ball",cat:"Paste Printing",icon:"🔴",
   causes:["Moisture in paste","Preheat too fast","Poor stencil release"],
   whys:["Why balls? → Splatter","Why? → Moisture","Why? → Paste not tempered","Why? → Direct from fridge","RC: Paste prep SOP not followed"],
   actions:["Temper paste 4h","Check stencil AR>1.5","Reduce preheat ramp"],
   prev:"Tempering log mandatory. Max 2°C/sec preheat."},
  {id:8,type:"Wrong Component",cat:"Pick & Place",icon:"🔄",
   causes:["Wrong reel","No barcode verify","BOM mismatch"],
   whys:["Why wrong? → Wrong reel","Why? → No verify","Why? → Scanner skipped","Why? → No interlock","RC: No interlock for setup"],
   actions:["100% first-article","Barcode interlock","Verify BOM vs reel"],
   prev:"Barcode interlock mandatory. First article sign-off."},
  {id:9,type:"Polarity Reversal",cat:"Pick & Place",icon:"🔀",
   causes:["Tape reversed","Vision polarity off","Setup error"],
   whys:["Why reversed? → 180°","Why? → Feeder reversed","Why? → Setup error","Why? → No polarity ref","RC: No polarity reference at setup"],
   actions:["Add polarity arrow","Enable vision polarity check","Add to AOI"],
   prev:"Polarity SOP. AOI polarity mandatory for diodes/caps/ICs."},
  {id:10,type:"Lifted Pad",cat:"Reflow Oven",icon:"🔧",
   causes:["Board warp >0.75%","PCB material","Rework overheat"],
   whys:["Why lifted? → Delaminated","Why? → Thermal stress","Why? → Warped","Why? → PCB incoming","RC: No incoming warp inspection"],
   actions:["Add incoming warp measurement","Max 0.75% per IPC-A-610","Review rework profile"],
   prev:"Incoming PCB 3-point warp per lot."},
  {id:11,type:"Open Joint",cat:"Reflow Oven",icon:"🔓",
   causes:["Component float","Pad too short","Board warp"],
   whys:["Why open? → No heel contact","Why? → Float","Why? → Flux outgas fast","Why? → Preheat aggressive","RC: Profile not model-specific"],
   actions:["Reduce preheat <1.5°C/s","Verify pad per IPC-7351","Check heel solder volume"],
   prev:"Model-specific profiles for QFP/SOP. Heel in AOI."},
  {id:12,type:"BGA / Head-in-Pillow",cat:"Reflow Oven",icon:"🫧",
   causes:["BGA oxidation","Peak too low","Board warp at BGA"],
   whys:["Why HiP? → No coalesce","Why? → Board warp","Why? → Tg too low","Why? → Wrong material","RC: PCB material not reviewed"],
   actions:["X-ray 100% BGA","Peak ≥245°C at ball","Check Tg vs reflow"],
   prev:"X-ray sampling for all BGA. Material review mandatory."},
  {id:13,type:"Flux Residue",cat:"Cleaning",icon:"🧪",
   causes:["Recipe mismatch","Machine fault","Insufficient rinse"],
   whys:["Why residue? → Not cleaned","Why? → Short cycle","Why? → Wrong recipe","Why? → Not updated","RC: Paste change without recipe update"],
   actions:["Update cleaning recipe","Check spray pressure","Extend rinse"],
   prev:"Recipe change mandatory with paste change."},
  {id:14,type:"MSL / Moisture Damage",cat:"Handling",icon:"💧",
   causes:["MSL bag broken","Wrong storage","Exceeded floor life"],
   whys:["Why damage? → Moisture","Why? → Outside MSL","Why? → Label ignored","Why? → No tracking","RC: MSL not enforced at incoming"],
   actions:["Bake per J-STD-033","Check humidity card","Verify WH <30°C/60%RH"],
   prev:"MSL tracking at incoming. Dedicated bake oven."},
  {id:15,type:"PCB Scratch / Damage",cat:"Handling",icon:"💥",
   causes:["Conveyor width wrong","Magazine handling","ESD"],
   whys:["Why scratch? → Edge contact","Why? → Wrong width","Why? → Not set at changeover","Why? → Not in SOP","RC: Conveyor width missing from SOP"],
   actions:["Add to changeover SOP","Inspect magazine","Verify ESD grounding"],
   prev:"Conveyor width checklist every changeover. Min 2mm."},
];

// ═══════════════════════════════════════════════════════
// CORE CALCULATION
// ═══════════════════════════════════════════════════════
function calcMetrics(dr,pr){
  const keys=new Set([...dr.map(d=>`${d.week}|${d.customer}|${d.model}`),...pr.map(p=>`${p.week}|${p.customer}|${p.model}`)]);
  const res=[];
  keys.forEach(k=>{
    const[week,customer,model]=k.split('|');
    const drows=dr.filter(d=>d.week===week&&d.customer===customer&&d.model===model);
    const prow=pr.find(p=>p.week===week&&p.customer===customer&&p.model===model);
    if(!prow)return;
    const it=prow.inspTOP||0, ib=prow.inspBOT||0;
    const ft=new Set(drows.filter(d=>d.side==='TOP').map(d=>`${d.sn}|TOP`)).size;
    const fb=new Set(drows.filter(d=>d.side==='BOT').map(d=>`${d.sn}|BOT`)).size;
    const tf=ft+fb, ti=it+ib;
    const yt=it?(it-ft)/it*100:null;
    const yb=ib?(ib-fb)/ib*100:null;
    const yo=ti?(ti-tf)/ti*100:0;
    const dp=ti?tf/ti*1e6:0;
    res.push({week,customer,model,inspTOP:it,inspBOT:ib,failedTOP:ft,failedBOT:fb,
      totalFailed:tf,totalInsp:ti,yieldTOP:yt,yieldBOT:yb,yieldOverall:yo,dppm:dp,
      totalDefects:drows.length,
      yieldOk:yo>=TY,dppmOk:dp<=TD});
  });
  return res.sort((a,b)=>a.week.localeCompare(b.week)||a.model.localeCompare(b.model));
}

function wkSummary(metrics){
  return[...new Set(metrics.map(m=>m.week))].sort().map(week=>{
    const rows=metrics.filter(m=>m.week===week);
    const ti=rows.reduce((s,r)=>s+r.totalInsp,0);
    const tf=rows.reduce((s,r)=>s+r.totalFailed,0);
    return{week,yieldPct:ti?(ti-tf)/ti*100:0,dppm:ti?tf/ti*1e6:0,ti,tf};
  });
}

function calcTier(v,r,c){
  let s=0;s+=v>=5000?3:v>=3000?2:1;s+=r>=3?3:r>=1.5?2:1;s+=c==="High"?3:c==="Medium"?2:1;
  return s>=7?1:s>=4?2:3;
}
const TC={1:"#ef4444",2:"#f59e0b",3:"#22c55e"};

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
const fmt=n=>Number(n).toLocaleString();
function badge(txt,c){return`<span class="badge" style="background:${c}20;border:1px solid ${c}40;color:${c};">${txt}</span>`;}
function pdot(ok){return`<span class="dot" style="background:${ok?'#22c55e':'#ef4444'};"></span>`+( ok?'PASS':'FAIL');}
function gf(id){return{week:document.getElementById(id+'-week')?.value||'ALL',cust:document.getElementById(id+'-cust')?.value||'ALL',model:document.getElementById(id+'-model')?.value||'ALL'};}

function filterRaw(f){
  return rawDef.filter(d=>(f.week==='ALL'||d.week===f.week)&&(f.cust==='ALL'||d.customer===f.cust)&&(f.model==='ALL'||d.model===f.model));
}

// ═══════════════════════════════════════════════════════
// CANVAS CHARTS
// ═══════════════════════════════════════════════════════
function drawLine(id,labels,values,target,targLabel,color,dmin){
  const cv=document.getElementById(id);if(!cv)return;
  const ctx=cv.getContext('2d');
  const W=cv.offsetWidth||500;cv.width=W;
  const H=parseInt(cv.getAttribute('height'))||200;cv.height=H;
  const p={t:22,r:20,b:30,l:60};
  const cw=W-p.l-p.r,ch=H-p.t-p.b;
  ctx.clearRect(0,0,W,H);
  if(!labels.length){ctx.fillStyle='#64748b';ctx.font='11px Courier New';ctx.fillText('No data — import production volume',p.l,H/2);return;}
  const maxV=Math.max(...values.filter(v=>v!=null),target||0)*1.05;
  const minV=Math.min(...values.filter(v=>v!=null),dmin??0)*0.95;
  const xp=i=>p.l+(labels.length<2?cw/2:i/(labels.length-1)*cw);
  const yp=v=>p.t+ch-(v-minV)/(maxV-minV||1)*ch;
  ctx.strokeStyle='#1e293b';ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const gy=p.t+ch*(1-i/4);
    ctx.beginPath();ctx.moveTo(p.l,gy);ctx.lineTo(p.l+cw,gy);ctx.stroke();
    ctx.fillStyle='#64748b';ctx.font='9px Courier New';ctx.textAlign='right';
    const v=minV+(maxV-minV)*(i/4);
    ctx.fillText(dmin!==undefined&&dmin!==null?v.toFixed(1)+'%':Math.round(v).toLocaleString(),p.l-4,gy+3);
  }
  if(target!=null&&target>=minV&&target<=maxV){
    const ty=yp(target);
    ctx.strokeStyle='#f59e0b';ctx.lineWidth=1;ctx.setLineDash([5,3]);
    ctx.beginPath();ctx.moveTo(p.l,ty);ctx.lineTo(p.l+cw,ty);ctx.stroke();
    ctx.setLineDash([]);ctx.fillStyle='#f59e0b';ctx.font='9px Courier New';ctx.textAlign='left';
    ctx.fillText(targLabel,p.l+4,ty-3);
  }
  ctx.setLineDash([]);
  ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.beginPath();
  values.forEach((v,i)=>{if(v==null)return;i===0||values.slice(0,i).every(x=>x==null)?ctx.moveTo(xp(i),yp(v)):ctx.lineTo(xp(i),yp(v));});
  ctx.stroke();
  values.forEach((v,i)=>{
    if(v==null)return;
    ctx.beginPath();ctx.arc(xp(i),yp(v),5,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
    const lbl=dmin!==undefined&&dmin!==null?v.toFixed(2)+'%':Math.round(v).toLocaleString();
    ctx.fillStyle='#e2e8f0';ctx.font='9px Courier New';ctx.textAlign='center';
    ctx.fillText(lbl,xp(i),yp(v)-9);
    ctx.fillStyle='#64748b';ctx.fillText(labels[i],xp(i),H-8);
  });
}

function drawMultiLine(id,labels,series,target,targLabel,dmin,isYield){
  const cv=document.getElementById(id);if(!cv)return;
  const ctx=cv.getContext('2d');
  const W=cv.offsetWidth||500;cv.width=W;
  const H=parseInt(cv.getAttribute('height'))||200;cv.height=H;
  const p={t:22,r:20,b:30,l:60};
  const cw=W-p.l-p.r,ch=H-p.t-p.b;
  ctx.clearRect(0,0,W,H);
  const allV=series.flatMap(s=>s.values.filter(v=>v!=null));
  if(!allV.length){ctx.fillStyle='#64748b';ctx.font='11px Courier New';ctx.fillText('No data',p.l,H/2);return;}
  const maxV=Math.max(...allV,target||0)*1.05;
  const minV=Math.min(...allV,dmin??0)*0.95;
  const xp=i=>p.l+(labels.length<2?cw/2:i/(labels.length-1)*cw);
  const yp=v=>p.t+ch-(v-minV)/(maxV-minV||1)*ch;
  ctx.strokeStyle='#1e293b';ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const gy=p.t+ch*(1-i/4);
    ctx.beginPath();ctx.moveTo(p.l,gy);ctx.lineTo(p.l+cw,gy);ctx.stroke();
    ctx.fillStyle='#64748b';ctx.font='9px Courier New';ctx.textAlign='right';
    const v=minV+(maxV-minV)*(i/4);
    ctx.fillText(isYield?v.toFixed(1)+'%':Math.round(v).toLocaleString(),p.l-4,gy+3);
  }
  if(target!=null&&target>=minV&&target<=maxV){
    const ty=yp(target);
    ctx.strokeStyle='#f59e0b';ctx.lineWidth=1;ctx.setLineDash([5,3]);
    ctx.beginPath();ctx.moveTo(p.l,ty);ctx.lineTo(p.l+cw,ty);ctx.stroke();
    ctx.setLineDash([]);ctx.fillStyle='#f59e0b';ctx.font='9px Courier New';ctx.textAlign='left';
    ctx.fillText(targLabel,p.l+4,yp(target)-3);
  }
  ctx.setLineDash([]);
  series.forEach((s,si)=>{
    const col=CC[si%CC.length];
    ctx.strokeStyle=col;ctx.lineWidth=2;ctx.beginPath();
    let st=false;
    s.values.forEach((v,i)=>{if(v==null){st=false;return;}st?ctx.lineTo(xp(i),yp(v)):(ctx.moveTo(xp(i),yp(v)),st=true);});
    ctx.stroke();
    s.values.forEach((v,i)=>{
      if(v==null)return;
      ctx.beginPath();ctx.arc(xp(i),yp(v),4,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();
      ctx.fillStyle=col;ctx.font='8px Courier New';ctx.textAlign='center';
      ctx.fillText(isYield?v.toFixed(1)+'%':Math.round(v).toLocaleString(),xp(i),yp(v)-8);
    });
  });
  labels.forEach((l,i)=>{
    ctx.fillStyle='#64748b';ctx.font='9px Courier New';ctx.textAlign='center';
    ctx.fillText(l,xp(i),H-8);
  });
}

function drawBar(id,labels,values,colors,rotate){
  const cv=document.getElementById(id);if(!cv)return;
  const ctx=cv.getContext('2d');
  const W=cv.offsetWidth||500;cv.width=W;
  const H=parseInt(cv.getAttribute('height'))||200;cv.height=H;
  const bp=rotate?80:30;
  const p={t:15,r:15,b:bp,l:45};
  const cw=W-p.l-p.r,ch=H-p.t-p.b;
  ctx.clearRect(0,0,W,H);
  if(!labels.length){ctx.fillStyle='#64748b';ctx.font='11px Courier New';ctx.fillText('No data',W/2-20,H/2);return;}
  const maxV=Math.max(...values)*1.15||1;
  const bw=Math.min(cw/labels.length*0.65,60);
  const gap=cw/labels.length;
  ctx.strokeStyle='#1e293b';ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const gy=p.t+ch*(1-i/4);
    ctx.beginPath();ctx.moveTo(p.l,gy);ctx.lineTo(p.l+cw,gy);ctx.stroke();
    ctx.fillStyle='#64748b';ctx.font='9px Courier New';ctx.textAlign='right';
    ctx.fillText(Math.round(maxV*(i/4)),p.l-4,gy+3);
  }
  labels.forEach((l,i)=>{
    const x=p.l+gap*i+(gap-bw)/2;
    const bh=values[i]/maxV*ch;
    const y=p.t+ch-bh;
    ctx.fillStyle=Array.isArray(colors)?colors[i%colors.length]:colors;
    ctx.fillRect(x,y,bw,bh);
    if(bh>14){ctx.fillStyle='#e2e8f0';ctx.font='9px Courier New';ctx.textAlign='center';ctx.fillText(values[i],x+bw/2,y+12);}
    if(rotate){
      ctx.save();ctx.translate(x+bw/2,p.t+ch+8);ctx.rotate(-0.6);
      ctx.fillStyle='#64748b';ctx.font='9px Courier New';ctx.textAlign='right';
      ctx.fillText(l.length>18?l.slice(0,17)+'…':l,0,0);ctx.restore();
    } else {
      ctx.fillStyle='#64748b';ctx.font='9px Courier New';ctx.textAlign='center';
      ctx.fillText(l,x+bw/2,p.t+ch+14);
    }
  });
}

// ═══════════════════════════════════════════════════════
// RENDER: YIELD TAB
// ═══════════════════════════════════════════════════════
function renderYield(){
  const f=gf('f');
  const allM=calcMetrics(rawDef,prodVol);
  const filt=allM.filter(m=>(f.week==='ALL'||m.week===f.week)&&(f.cust==='ALL'||m.customer===f.cust)&&(f.model==='ALL'||m.model===f.model));
  const wkS=wkSummary(allM);
  const allWeeks=[...new Set(allM.map(m=>m.week))].sort();
  const allCusts=[...new Set(allM.map(m=>m.customer))].sort();

  const tp=filt.reduce((s,r)=>s+r.totalInsp,0);
  const tf=filt.reduce((s,r)=>s+r.totalFailed,0);
  const ft=filt.reduce((s,r)=>s+r.failedTOP,0);
  const fb=filt.reduce((s,r)=>s+r.failedBOT,0);
  const it=filt.reduce((s,r)=>s+r.inspTOP,0);
  const ib=filt.reduce((s,r)=>s+r.inspBOT,0);
  const oy=tp?(tp-tf)/tp*100:0;
  const ot=it?(it-ft)/it*100:null;
  const ob=ib?(ib-fb)/ib*100:null;
  const od=tp?tf/tp*1e6:0;
  const td=filt.reduce((s,r)=>s+r.totalDefects,0);

  // Week hint
  const dw=[...new Set(rawDef.map(d=>d.week))].sort();
  const hint=document.getElementById('week-hint');
  if(hint)hint.textContent=dw.length?`📅 Weeks in defect data: ${dw.join(', ')} — use these in Production Volume`:'';

  // KPIs
  document.getElementById('kpi-row').innerHTML=[
    {l:'YIELD OVERALL',v:oy.toFixed(3)+'%',c:oy>=TY?'#22c55e':'#ef4444',s:`Target ≥${TY}%  ${oy>=TY?'✅':'❌'}`},
    {l:'YIELD TOP',v:ot!==null?ot.toFixed(3)+'%':'—',c:ot!==null&&ot>=TY?'#22c55e':'#ef4444',s:`Insp:${fmt(it)} Fail:${ft}`},
    {l:'YIELD BOT',v:ob!==null?ob.toFixed(3)+'%':'—',c:ob!==null&&ob>=TY?'#22c55e':'#a78bfa',s:`Insp:${fmt(ib)} Fail:${fb}`},
    {l:'DPPM',v:Math.round(od).toLocaleString(),c:od<=TD?'#22c55e':'#ef4444',s:`Target ≤${fmt(TD)}  ${od<=TD?'✅':'❌'}`},
    {l:'DEFECT RECORDS',v:td,c:'#a78bfa',s:'Total defect rows'},
  ].map(k=>`<div class="kpi" style="background:${k.c}12;border:1px solid ${k.c}50;"><div class="kpi-n" style="color:${k.c};">${k.v}</div><div class="kpi-l">${k.l}</div><div class="kpi-s">${k.s}</div></div>`).join('');

  // Charts
  const yv=document.getElementById('yield-view')?.value||'overall';
  const dv=document.getElementById('dppm-view')?.value||'overall';
  const cc=document.getElementById('chart-cust')?.value||'ALL';
  const chartCusts=cc==='ALL'?allCusts:[cc];

  setTimeout(()=>{
    if(yv==='customer'||cc!=='ALL'){
      const series=chartCusts.map((cu,i)=>({name:cu,color:CC[i%CC.length],values:allWeeks.map(wk=>{
        const rows=allM.filter(m=>m.week===wk&&m.customer===cu);
        if(!rows.length)return null;
        const ti2=rows.reduce((s,r)=>s+r.totalInsp,0);
        const tf2=rows.reduce((s,r)=>s+r.totalFailed,0);
        return ti2?(ti2-tf2)/ti2*100:null;
      })}));
      drawMultiLine('chart-yield',allWeeks,series,TY,TY+'% target',97,true);
      document.getElementById('yield-legend').innerHTML=series.map(s=>`<span style="color:${s.color};font-weight:700;">■ ${s.name}</span>`).join('');
    } else {
      drawLine('chart-yield',wkS.map(w=>w.week),wkS.map(w=>w.yieldPct),TY,TY+'% target','#22c55e',97);
      document.getElementById('yield-legend').innerHTML='';
    }
    if(dv==='customer'||cc!=='ALL'){
      const series=chartCusts.map((cu,i)=>({name:cu,color:CC[i%CC.length],values:allWeeks.map(wk=>{
        const rows=allM.filter(m=>m.week===wk&&m.customer===cu);
        if(!rows.length)return null;
        const ti2=rows.reduce((s,r)=>s+r.totalInsp,0);
        const tf2=rows.reduce((s,r)=>s+r.totalFailed,0);
        return ti2?tf2/ti2*1e6:null;
      })}));
      drawMultiLine('chart-dppm',allWeeks,series,TD,fmt(TD)+' target',0,false);
      document.getElementById('dppm-legend').innerHTML=series.map(s=>`<span style="color:${s.color};font-weight:700;">■ ${s.name}</span>`).join('');
    } else {
      drawLine('chart-dppm',wkS.map(w=>w.week),wkS.map(w=>w.dppm),TD,fmt(TD)+' target','#3b82f6',null);
      document.getElementById('dppm-legend').innerHTML='';
    }
  },50);

  // Breakdown table
  document.getElementById('tbl-body').innerHTML=filt.map((r,i)=>{
    const ytc=r.yieldTOP!=null?(r.yieldTOP>=TY?'#22c55e':'#ef4444'):'#64748b';
    const ybc=r.yieldBOT!=null?(r.yieldBOT>=TY?'#22c55e':'#ef4444'):'#64748b';
    const yoc=r.yieldOk?'#22c55e':'#ef4444';
    const dc=r.dppmOk?'#22c55e':'#ef4444';
    return`<tr><td>${r.week}</td><td>${r.customer}</td><td><b>${r.model}</b></td>
      <td class="num">${fmt(r.inspTOP)}</td><td class="num">${fmt(r.inspBOT)}</td>
      <td class="num" style="color:#f59e0b;">${r.failedTOP}</td><td class="num" style="color:#a78bfa;">${r.failedBOT}</td>
      <td class="num" style="color:${ytc};font-weight:700;">${r.yieldTOP!=null?r.yieldTOP.toFixed(3)+'%':'—'}</td>
      <td class="num" style="color:${ybc};font-weight:700;">${r.yieldBOT!=null?r.yieldBOT.toFixed(3)+'%':'—'}</td>
      <td class="num" style="color:${yoc};font-weight:700;">${r.yieldOverall.toFixed(3)}%</td>
      <td class="num" style="color:${dc};font-weight:700;">${Math.round(r.dppm).toLocaleString()}</td>
      <td>${pdot(r.yieldOk&&r.dppmOk)}</td></tr>`;
  }).join('');

  // Pareto
  const fd=rawDef.filter(d=>(f.week==='ALL'||d.week===f.week)&&(f.cust==='ALL'||d.customer===f.cust)&&(f.model==='ALL'||d.model===f.model));
  const pm={};fd.forEach(d=>{pm[d.defect]=(pm[d.defect]||0)+1;});
  const ps=Object.entries(pm).sort((a,b)=>b[1]-a[1]);
  setTimeout(()=>drawBar('chart-pareto',ps.map(e=>e[0]),ps.map(e=>e[1]),ps.map((_,i)=>i<3?'#ef4444':'#3b82f6'),true),50);

  // Top components
  const cm={};
  fd.forEach(d=>{if(!cm[d.comp])cm[d.comp]={count:0,defs:{},seenModels:new Set(),sides:new Set()};cm[d.comp].count++;cm[d.comp].defs[d.defect]=(cm[d.comp].defs[d.defect]||0)+1;cm[d.comp].seenModels.add(d.model);cm[d.comp].sides.add(d.side);});
  const cs=Object.entries(cm).sort((a,b)=>b[1].count-a[1].count).slice(0,15);
  document.getElementById('tbl-comp').innerHTML=cs.map(([comp,v],i)=>{
    const td2=Object.entries(v.defs).sort((a,b)=>b[1]-a[1])[0];
    const sstr=[...v.sides].map(s=>badge(s,s==='TOP'?'#22c55e':'#a78bfa')).join(' ');
    const rc=['#ef4444','#ef4444','#ef4444','#f59e0b','#f59e0b','#3b82f6'];
    return`<tr><td style="color:${rc[Math.min(i,5)]};font-weight:700;">#${i+1}</td>
      <td><b style="color:#34d399;">${comp}</b></td>
      <td class="num" style="color:${rc[Math.min(i,5)]};font-weight:700;">${v.count}</td>
      <td style="color:#94a3b8;">${td2?td2[0]+' ('+td2[1]+')':'—'}</td>
      <td style="color:#64748b;font-size:10px;">${[...v.seenModels].join(', ')}</td>
      <td>${sstr}</td></tr>`;
  }).join('');

  // Side breakdown
  const sk=new Set(fd.map(d=>`${d.customer}|${d.model}|${d.side}`));
  const sr=[];
  sk.forEach(k=>{
    const[customer,model,side]=k.split('|');
    const rows=fd.filter(d=>d.customer===customer&&d.model===model&&d.side===side);
    const fail=new Set(rows.map(d=>`${d.sn}|${d.side}`)).size;
    const dm={};rows.forEach(d=>{dm[d.defect]=(dm[d.defect]||0)+1;});
    const top=Object.entries(dm).sort((a,b)=>b[1]-a[1])[0];
    sr.push({side,customer,model,total:rows.length,fail,topDef:top?top[0]+' ('+top[1]+')':'—'});
  });
  sr.sort((a,b)=>a.model.localeCompare(b.model)||a.side.localeCompare(b.side));
  document.getElementById('tbl-side').innerHTML=sr.map((r,i)=>`<tr>
    <td>${badge(r.side,r.side==='TOP'?'#22c55e':'#a78bfa')}</td>
    <td>${r.customer}</td><td><b>${r.model}</b></td>
    <td class="num" style="color:#a78bfa;">${r.total}</td>
    <td class="num" style="color:#f59e0b;font-weight:700;">${r.fail}</td>
    <td style="color:#94a3b8;font-size:10px;">${r.topDef}</td></tr>`).join('');
}

// ═══════════════════════════════════════════════════════
// RENDER: TIME TAB
// ═══════════════════════════════════════════════════════
function renderTime(){
  const f={week:document.getElementById('tf-week')?.value||'ALL',cust:document.getElementById('tf-cust')?.value||'ALL',model:document.getElementById('tf-model')?.value||'ALL'};
  const fd=rawDef.filter(d=>(f.week==='ALL'||d.week===f.week)&&(f.cust==='ALL'||d.customer===f.cust)&&(f.model==='ALL'||d.model===f.model));
  if(!fd.length){['shift-kpi','hour-heatmap','shift-top-body'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML='<div style="color:#64748b;padding:20px;">No data</div>';});['chart-shift','chart-dow','chart-daily'].forEach(id=>{const cv=document.getElementById(id);if(cv){const ctx=cv.getContext('2d');ctx.clearRect(0,0,cv.width,cv.height);ctx.fillStyle='#64748b';ctx.font='11px Courier New';ctx.fillText('No data',cv.width/2-20,cv.height/2);}});return;}

  const shiftMap={Morning:0,Afternoon:0,Night:0};
  const shiftSN={Morning:new Set(),Afternoon:new Set(),Night:new Set()};
  fd.forEach(d=>{shiftMap[d.shift]++;shiftSN[d.shift].add(`${d.sn}|${d.side}`);});
  const tot=fd.length;

  document.getElementById('shift-kpi').innerHTML=SHIFTS.map(sh=>`
    <div class="kpi" style="background:${sh.color}12;border:1px solid ${sh.color}50;">
      <div class="kpi-n" style="color:${sh.color};">${shiftMap[sh.name]}</div>
      <div class="kpi-l">${sh.label}</div>
      <div class="kpi-s">${tot?Math.round(shiftMap[sh.name]/tot*100):0}% of total | ${shiftSN[sh.name].size} failed SN+Side</div>
    </div>`).join('');

  setTimeout(()=>{
    drawBar('chart-shift',SHIFTS.map(s=>s.label),SHIFTS.map(s=>shiftMap[s.name]),SHIFTS.map(s=>s.color),false);
    const dw=[0,0,0,0,0,0,0];fd.forEach(d=>dw[d.dow]++);
    drawBar('chart-dow',DAYS,dw,DAYS.map((_,i)=>['#374151','#3b82f6','#3b82f6','#3b82f6','#3b82f6','#3b82f6','#374151'][i]),false);
  },50);

  const hm=Array(24).fill(0);fd.forEach(d=>hm[d.hour]++);
  const maxH=Math.max(...hm)||1;
  document.getElementById('hour-heatmap').innerHTML=`
    <div style="font-size:9px;color:#64748b;margin-bottom:6px;display:flex;gap:16px;">
      <span style="color:#3b82f6;">■ Morning (07-15)</span>
      <span style="color:#f59e0b;">■ Afternoon (15-23)</span>
      <span style="color:#a78bfa;">■ Night (23-07)</span>
      <span style="color:#64748b;margin-left:auto;">Darker = more defects</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(24,1fr);gap:3px;">
      ${hm.map((cnt,h)=>{
        const sh=ycShift(h);
        const bc=sh==='Morning'?'#3b82f6':sh==='Afternoon'?'#f59e0b':'#a78bfa';
        const alpha=(0.1+cnt/maxH*0.85).toFixed(2);
        return`<div style="background:${bc};opacity:${alpha};border:1px solid #1e293b;border-radius:3px;height:28px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;text-align:center;line-height:1.2;">${String(h).padStart(2,'0')}<br>${cnt}</div>`;
      }).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(24,1fr);gap:3px;margin-top:3px;">
      ${hm.map((_,h)=>`<div style="font-size:8px;color:#64748b;text-align:center;">${h}</div>`).join('')}
    </div>`;

  const sd={Morning:{},Afternoon:{},Night:{}};
  fd.forEach(d=>{sd[d.shift][d.defect]=(sd[d.shift][d.defect]||0)+1;});
  const si={Morning:"Check machine warm-up, paste temp, operator handover.",Afternoon:"Check changeover quality, material FIFO, operator fatigue.",Night:"Check supervisor presence, machine stability, PM compliance."};
  document.getElementById('shift-top-body').innerHTML=SHIFTS.map(sh=>{
    const ent=Object.entries(sd[sh.name]).sort((a,b)=>b[1]-a[1]);
    if(!ent.length)return`<tr><td>${badge(sh.name,sh.color)}</td><td style="color:#64748b;">No defects</td><td>—</td><td>—</td><td>—</td></tr>`;
    const[top,cnt]=ent[0];
    return`<tr><td>${badge(sh.name,sh.color)}</td><td><b>${top}</b></td>
      <td class="num" style="color:${sh.color};font-weight:700;">${cnt}</td>
      <td class="num">${shiftMap[sh.name]?Math.round(cnt/shiftMap[sh.name]*100):0}%</td>
      <td style="color:#64748b;font-size:10px;">${si[sh.name]}</td></tr>`;
  }).join('');

  const dm={};fd.forEach(d=>{if(!dm[d.dateStr])dm[d.dateStr]=new Set();dm[d.dateStr].add(`${d.sn}|${d.side}`);});
  const dk=Object.keys(dm).sort((a,b)=>{const pa=a.split('/'),pb=b.split('/');return new Date(+pa[2],+pa[0]-1,+pa[1])-new Date(+pb[2],+pb[0]-1,+pb[1]);});
  setTimeout(()=>drawLine('chart-daily',dk,dk.map(k=>dm[k].size),null,null,'#22c55e',null),50);
}

// ═══════════════════════════════════════════════════════
// RENDER: TIERS
// ═══════════════════════════════════════════════════════
function renderTiers(){
  const sorted=[...modelTiers].sort((a,b)=>calcTier(a.weeklyVol,a.defectRate,a.criticality)-calcTier(b.weeklyVol,b.defectRate,b.criticality));
  document.getElementById('tier-kpi').innerHTML=[1,2,3].map(t=>{
    const cnt=modelTiers.filter(m=>calcTier(m.weeklyVol,m.defectRate,m.criticality)===t).length;
    return`<div class="kpi" style="background:${TC[t]}12;border:1px solid ${TC[t]}50;"><div class="kpi-n" style="color:${TC[t]};">${cnt}</div><div class="kpi-l">TIER ${t}</div></div>`;
  }).join('');
  document.getElementById('tier-title').textContent=`ALL MODELS — ${modelTiers.length} TOTAL`;
  const fl=t=>t===1?'Every week – 5-Why required':t===2?'Monthly – if rate ↑':'Threshold alert only';
  const cc=c=>c==="High"?'#ef4444':c==="Medium"?'#f59e0b':'#22c55e';
  document.getElementById('tier-body').innerHTML=sorted.map((m,i)=>{
    const t=calcTier(m.weeklyVol,m.defectRate,m.criticality);
    const rc=m.defectRate>=3?'#ef4444':m.defectRate>=1.5?'#f59e0b':'#22c55e';
    return`<tr><td>${badge('T'+t,TC[t])}</td><td>${m.customer}</td><td><b>${m.model}</b></td>
      <td class="num">${fmt(m.weeklyVol)}</td>
      <td class="num" style="color:${rc};font-weight:700;">${m.defectRate}%</td>
      <td>${badge(m.criticality,cc(m.criticality))}</td>
      <td style="color:#94a3b8;">${fl(t)}</td>
      <td><button class="btn br" style="padding:3px 8px;font-size:10px;" onclick="removeModel(${i})">✕</button></td></tr>`;
  }).join('');
}

function addModel(){
  const m=document.getElementById('nm-m').value.trim();
  const c=document.getElementById('nm-c').value.trim();
  const v=parseFloat(document.getElementById('nm-v').value)||0;
  const r=parseFloat(document.getElementById('nm-r').value)||0;
  const cr=document.getElementById('nm-cr').value;
  if(!m||!c){showToast('Model and Customer required.');return;}
  if(!currentUser){showToast('Not logged in');return;}
  fetch('/api/yield',{method:'POST',headers:{'Content-Type':'application/json','X-Badge':currentUser.badge},
    body:JSON.stringify({action:'addModelTier',model:m,customer:c,weeklyVol:v,defectRate:r,criticality:cr})})
    .then(r=>r.json()).then(d=>{
      if(d.ok){['nm-m','nm-c','nm-v','nm-r'].forEach(id=>document.getElementById(id).value='');showToast('Model added \u2713');}
      else showToast('Error: '+d.error);
    }).catch(()=>showToast('Network error'));
}
function removeModel(i){
  const sorted=[...modelTiers].sort((a,b)=>calcTier(a.weeklyVol,a.defectRate,a.criticality)-calcTier(b.weeklyVol,b.defectRate,b.criticality));
  const target=sorted[i];
  if(!target||!target._id)return;
  showConfirm('Remove this model?','This cannot be undone.',()=>{
    if(!currentUser){showToast('Not logged in');return;}
    fetch('/api/yield',{method:'POST',headers:{'Content-Type':'application/json','X-Badge':currentUser.badge},
      body:JSON.stringify({action:'removeModelTier',id:target._id})})
      .then(r=>r.json()).then(d=>{
        if(d.ok)showToast('Removed');else showToast('Error: '+d.error);
      }).catch(()=>showToast('Network error'));
  },'Remove \uD83D\uDDD1\uFE0F');
}

// ═══════════════════════════════════════════════════════
// RENDER: LIBRARY
// ═══════════════════════════════════════════════════════
let selLib=null;
function renderLib(){
  const q=document.getElementById('lib-q')?.value.toLowerCase()||'';
  const f2=LIB.filter(d=>d.type.toLowerCase().includes(q)||d.cat.toLowerCase().includes(q));
  document.getElementById('lib-items').innerHTML=f2.map(d=>`
    <div class="li${selLib===d.id?' active':''}" onclick="selLibFn(${d.id})">
      <div>${d.icon} ${d.type}</div><div style="font-size:10px;color:#64748b;margin-top:2px;">${d.cat}</div>
    </div>`).join('');
  if(selLib){const d=LIB.find(x=>x.id===selLib);if(d)showLibDetail(d);}
}
function selLibFn(id){selLib=id;const d=LIB.find(x=>x.id===id);if(d)showLibDetail(d);renderLib();}
function showLibDetail(d){
  document.getElementById('lib-detail').innerHTML=`
    <div class="card">
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px;"><span style="font-size:28px;">${d.icon}</span>
        <div><div style="font-size:17px;font-weight:700;">${d.type}</div>${badge(d.cat,'#3b82f6')}</div></div>
      <div class="ct">⚠️ TYPICAL ROOT CAUSES</div>
      ${d.causes.map(c=>`<div style="font-size:11px;color:#94a3b8;padding:4px 0;border-bottom:1px solid #1e293b;">• ${c}</div>`).join('')}
    </div>
    <div class="card">
      <div class="ct">🔍 5-WHY TEMPLATE</div>
      ${d.whys.map((w,i)=>`<div style="display:flex;gap:10px;margin-bottom:12px;align-items:flex-start;">
        <div style="background:#1d4ed8;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px;font-weight:700;">W${i+1}</div>
        <div style="font-size:11px;color:${i===4?'#f59e0b':'#94a3b8'};font-weight:${i===4?700:400};${i===4?'background:#f59e0b10;padding:5px 10px;border-radius:4px;':''}">${w}</div>
      </div>`).join('')}
    </div>
    <div class="card">
      <div class="ct">✅ CORRECTIVE ACTIONS</div>
      ${d.actions.map(a=>`<div style="font-size:11px;color:#22c55e;padding:5px 0;border-bottom:1px solid #1e293b;">→ ${a}</div>`).join('')}
      <div style="margin-top:12px;font-size:11px;color:#a78bfa;"><span style="font-weight:700;">🛡️ PREVENTION: </span>${d.prev}</div>
    </div>`;
}

// ═══════════════════════════════════════════════════════
// RENDER: WEEKLY REPORT TAB
// ═══════════════════════════════════════════════════════
function renderReport(){
  const allM=calcMetrics(rawDef,prodVol);
  const wks=[...new Set(allM.map(m=>m.week))].sort();
  const lw=wks[wks.length-1]||'';
  const wM=allM.filter(m=>m.week===lw);
  const tp=wM.reduce((s,r)=>s+r.totalInsp,0);
  const tf=wM.reduce((s,r)=>s+r.totalFailed,0);
  const td=wM.reduce((s,r)=>s+r.totalDefects,0);
  const wy=tp?(tp-tf)/tp*100:0;
  const wd=tp?tf/tp*1e6:0;
  const wD={};rawDef.filter(d=>d.week===lw).forEach(d=>{wD[d.defect]=(wD[d.defect]||0)+1;});
  const t3=Object.entries(wD).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const wRaw=rawDef.filter(d=>d.week===lw);
  const ss={Morning:0,Afternoon:0,Night:0};wRaw.forEach(d=>ss[d.shift]++);
  const ws=Object.entries(ss).sort((a,b)=>b[1]-a[1])[0];
  const allWks=[...new Set(rawDef.map(d=>d.week))].sort();
  function w3(def){return allWks.filter(w=>{const m={};rawDef.filter(d=>d.week===w).forEach(d=>{m[d.defect]=(m[d.defect]||0)+1;});return Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0,3).map(e=>e[0]).includes(def);}).length;}

  document.getElementById('report-content').innerHTML=`
    <div class="dk">
      <div style="font-size:12px;font-weight:700;color:#3b82f6;margin-bottom:12px;">📋 WEEKLY QUALITY REPORT — ${lw}</div>
      <div style="display:flex;gap:24px;flex-wrap:wrap;">
        ${[['YIELD',wy.toFixed(3)+'%',wy>=TY],['DPPM',Math.round(wd).toLocaleString(),wd<=TD],['TOTAL INSP',fmt(tp),null],['FAILED SN+SIDE',tf,null],['DEFECT RECORDS',td,null]].map(([l,v,ok])=>`
          <div><div style="font-size:9px;color:#64748b;">${l}</div>
          <div style="font-size:20px;font-weight:700;color:${ok===null?'#e2e8f0':ok?'#22c55e':'#ef4444'};">${v}</div></div>`).join('')}
      </div>
    </div>
    <div class="card" style="border-left:3px solid #a78bfa;">
      <div class="ct">⏱️ SHIFT INSIGHT</div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;">
        ${SHIFTS.map(sh=>`<div><div style="font-size:9px;color:#64748b;">${sh.label}</div>
          <div style="font-size:18px;font-weight:700;color:${sh.color};">${ss[sh.name]} defects</div>
          <div style="font-size:9px;color:#64748b;">${wRaw.length?Math.round(ss[sh.name]/wRaw.length*100):0}%</div></div>`).join('')}
        ${ws?`<div style="background:#ef444410;border:1px solid #ef444450;border-radius:6px;padding:8px 14px;font-size:11px;color:#ef4444;font-weight:700;align-self:center;">🚨 Worst: ${ws[0]} (${ws[1]})</div>`:''}
      </div>
    </div>
    ${t3.map(([def,cnt],i)=>{
      const lib=LIB.find(l=>l.type===def);
      const bc=['#ef4444','#f59e0b','#22c55e'][i];
      return`<div class="card" style="border-left:3px solid ${bc};">
        <div style="display:flex;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
          <span style="font-weight:700;font-size:13px;">${lib?.icon||'🔧'} #${i+1} ${def}</span>
          <span style="font-size:20px;font-weight:700;color:${bc};">${cnt} defects</span>
        </div>
        ${lib?`<div style="font-size:10px;background:#060a12;border:1px solid #1e293b;border-radius:4px;padding:7px 11px;margin-bottom:10px;color:#94a3b8;">
          <span style="color:#3b82f6;font-weight:700;">TEMPLATE RC: </span>${lib.whys[4]}</div>`:''}
        <div style="font-size:9px;color:#64748b;margin-bottom:4px;">ACTUAL ROOT CAUSE:</div>
        <textarea rows="2" style="font-size:10px;" placeholder="Enter root cause..."></textarea>
        ${lib?`<div style="margin-top:8px;font-size:10px;color:#22c55e;">${lib.actions.slice(0,2).map(a=>`<div>→ ${a}</div>`).join('')}</div>`:''}
      </div>`;
    }).join('')}
    <div class="card">
      <div class="ct">⚠️ ESCALATION CHECK — ≥3 weeks in Top 3 → escalate to manager</div>
      ${t3.map(([def])=>{const cnt=w3(def);return`<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #1e293b;font-size:11px;flex-wrap:wrap;gap:8px;">
        <span>${def}</span><span style="font-weight:700;color:${cnt>=3?'#ef4444':'#22c55e'};">${cnt} week(s) in Top 3 ${cnt>=3?'🚨 ESCALATE':'✅ OK'}</span></div>`;}).join('')}
    </div>`;
}

// ═══════════════════════════════════════════════════════
// EMAIL REPORT GENERATOR — dark theme matching the app
// ═══════════════════════════════════════════════════════
function generateReport(){
  const allM=calcMetrics(rawDef,prodVol);
  const rCust=document.getElementById('rpt-cust')?.value||'ALL';
  const filtM=rCust==='ALL'?allM:allM.filter(m=>m.customer===rCust);
  const filtRaw=rCust==='ALL'?rawDef:rawDef.filter(d=>d.customer===rCust);
  const wkF=wkSummary(filtM);
  if(!wkF.length){showToast('No data. Import production volume first.');return;}

  const weekLabel=document.getElementById('rpt-week')?.value||(wkF.length?wkF[wkF.length-1].week:'—');
  const author=document.getElementById('rpt-author')?.value||'SMT Process Engineer';
  const now=new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  const custLabel=rCust==='ALL'?'All Customers':rCust;

  const tp=filtM.reduce((s,r)=>s+r.totalInsp,0);
  const tf=filtM.reduce((s,r)=>s+r.totalFailed,0);
  const ft=filtM.reduce((s,r)=>s+r.failedTOP,0);
  const fb=filtM.reduce((s,r)=>s+r.failedBOT,0);
  const it=filtM.reduce((s,r)=>s+r.inspTOP,0);
  const ib=filtM.reduce((s,r)=>s+r.inspBOT,0);
  const oy=tp?(tp-tf)/tp*100:0;
  const ot=it?(it-ft)/it*100:null;
  const ob=ib?(ib-fb)/ib*100:null;
  const od=tp?tf/tp*1e6:0;

  // week labels WW## format
  const labels=wkF.map(w=>{const m=w.week.match(/W(\d+)$/);return m?'WW'+m[1]:w.week;});
  const yVals=wkF.map(w=>w.yieldPct);
  const dVals=wkF.map(w=>w.dppm);

  // top 3 with model+component
  const lw=[...new Set(filtRaw.map(d=>d.week))].sort().pop()||'';
  const wr=filtRaw.filter(d=>d.week===lw);
  const wdf={};wr.forEach(d=>{wdf[d.defect]=(wdf[d.defect]||0)+1;});
  const t3=Object.entries(wdf).sort((a,b)=>b[1]-a[1]).slice(0,3);
  function topOf(def,key){const m={};wr.filter(d=>d.defect===def).forEach(d=>{m[d[key]]=(m[d[key]]||0)+1;});const s=Object.entries(m).sort((a,b)=>b[1]-a[1]);return s.length?s[0][0]+' ('+s[0][1]+')':'-';}

  // Canvas — dark theme
  const W=1100, PAD=32;
  const HDR=90, KPI=120, CHART=260, TOP3=t3.length?150:0, FTR=44;
  const TOTAL=HDR+KPI+CHART*2+TOP3+FTR+PAD*6;

  const cv=document.createElement('canvas');cv.width=W;cv.height=TOTAL;
  const ctx=cv.getContext('2d');

  // bg
  ctx.fillStyle='#0a0e17';ctx.fillRect(0,0,W,TOTAL);

  // header gradient
  const hg=ctx.createLinearGradient(0,0,W,0);hg.addColorStop(0,'#0f172a');hg.addColorStop(1,'#1e293b');
  ctx.fillStyle=hg;ctx.fillRect(0,0,W,HDR);
  ctx.strokeStyle='#3b82f6';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,HDR);ctx.lineTo(W,HDR);ctx.stroke();
  ctx.fillStyle='#3b82f6';ctx.font='bold 20px Courier New';ctx.textAlign='left';ctx.fillText('SMT WEEKLY QUALITY REPORT',PAD,34);
  ctx.fillStyle='#22c55e';ctx.font='bold 13px Courier New';ctx.fillText('Customer: '+custLabel,PAD,56);
  ctx.fillStyle='#64748b';ctx.font='10px Courier New';ctx.fillText('Week: '+weekLabel+'   |   By: '+author+'   |   '+now,PAD,74);
  ctx.fillStyle='#475569';ctx.font='10px Courier New';ctx.textAlign='right';
  ctx.fillText('Target: Yield ≥'+TY+'%  |  DPPM ≤'+fmt(TD),W-PAD,74);

  let y=HDR+PAD;

  // KPI boxes
  const kpis=[
    {l:'YIELD OVERALL',v:oy.toFixed(3)+'%',ok:oy>=TY,s:'Failed:'+tf+'/'+fmt(tp)},
    {l:'YIELD TOP',v:ot!=null?ot.toFixed(3)+'%':'—',ok:ot!=null&&ot>=TY,s:'Fail:'+ft+'/'+fmt(it)},
    {l:'YIELD BOT',v:ob!=null?ob.toFixed(3)+'%':'—',ok:ob!=null&&ob>=TY,s:'Fail:'+fb+'/'+fmt(ib)},
    {l:'DPPM',v:Math.round(od).toLocaleString(),ok:od<=TD,s:'Target ≤'+fmt(TD)},
  ];
  const kw=Math.floor((W-PAD*2-12*3)/4);
  kpis.forEach((k,i)=>{
    const kx=PAD+i*(kw+12);
    const col=k.ok?'#22c55e':'#ef4444';
    // box
    ctx.fillStyle=col+'18';rrect(ctx,kx,y,kw,KPI-10,8);ctx.fill();
    ctx.strokeStyle=col+'60';ctx.lineWidth=1;rrect(ctx,kx,y,kw,KPI-10,8);ctx.stroke();
    ctx.fillStyle='#64748b';ctx.font='9px Courier New';ctx.textAlign='center';ctx.fillText(k.l,kx+kw/2,y+20);
    ctx.fillStyle=col;ctx.font='bold 26px Courier New';ctx.fillText(k.v,kx+kw/2,y+56);
    ctx.fillStyle=col;ctx.font='bold 10px Courier New';ctx.fillText(k.ok?'✓ PASS':'✗ FAIL',kx+kw/2,y+76);
    ctx.fillStyle='#475569';ctx.font='9px Courier New';ctx.fillText(k.s,kx+kw/2,y+94);
  });
  y+=KPI+PAD;

  // Chart helper — draw directly on ctx
  function drawChartCtx(ox,oy2,vals,target,targLabel,isYield,lineColor,targColor){
    const PL=68,PR=20,PT=32,PB=52;
    const pw=W/2-PAD*1.5-PL-PR, ph=CHART-PT-PB;
    const allV=[...vals.filter(v=>v!=null),target||0];
    const maxV=Math.max(...allV)*(isYield?1.003:1.1);
    const minV=Math.min(...allV)*(isYield?0.997:0);
    const xp=i=>ox+PL+(labels.length<2?pw/2:i/(labels.length-1)*pw);
    const yp=v=>oy2+PT+ph-(v-minV)/(maxV-minV||1)*ph;

    // chart bg
    ctx.fillStyle='#111827';rrect(ctx,ox,oy2,W/2-PAD*1.5,CHART,6);ctx.fill();
    ctx.strokeStyle='#1e293b';ctx.lineWidth=1;rrect(ctx,ox,oy2,W/2-PAD*1.5,CHART,6);ctx.stroke();

    // grid
    for(let i=0;i<=5;i++){
      const gy=oy2+PT+ph*(1-i/5);
      ctx.strokeStyle='#1e293b';ctx.lineWidth=0.8;
      ctx.beginPath();ctx.moveTo(ox+PL,gy);ctx.lineTo(ox+PL+pw,gy);ctx.stroke();
      ctx.fillStyle='#64748b';ctx.font='9px Courier New';ctx.textAlign='right';
      const v=minV+(maxV-minV)*(i/5);
      ctx.fillText(isYield?v.toFixed(2)+'%':Math.round(v).toLocaleString(),ox+PL-5,gy+3);
    }

    // target
    if(target>=minV&&target<=maxV){
      const ty=yp(target);
      ctx.strokeStyle=targColor;ctx.lineWidth=1.5;ctx.setLineDash([6,4]);
      ctx.beginPath();ctx.moveTo(ox+PL,ty);ctx.lineTo(ox+PL+pw,ty);ctx.stroke();
      ctx.setLineDash([]);ctx.fillStyle=targColor;ctx.font='9px Courier New';ctx.textAlign='left';
      ctx.fillText(targLabel,ox+PL+4,ty-4);
    }
    ctx.setLineDash([]);

    // line
    ctx.strokeStyle=lineColor;ctx.lineWidth=2.5;ctx.beginPath();
    vals.forEach((v,i)=>{if(v==null)return;i===0?ctx.moveTo(xp(i),yp(v)):ctx.lineTo(xp(i),yp(v));});
    ctx.stroke();

    // dots + labels
    vals.forEach((v,i)=>{
      if(v==null)return;
      ctx.beginPath();ctx.arc(xp(i),yp(v),5,0,Math.PI*2);ctx.fillStyle=lineColor;ctx.fill();
      ctx.fillStyle='#e2e8f0';ctx.font='bold 9px Courier New';ctx.textAlign='center';
      const lbl=isYield?v.toFixed(2)+'%':Math.round(v).toLocaleString();
      ctx.fillText(lbl,xp(i),yp(v)-10);
      ctx.fillStyle='#64748b';ctx.font='9px Courier New';ctx.fillText(labels[i],xp(i),oy2+PT+ph+16);
    });

    // legend
    const ly=oy2+CHART-12;
    ctx.strokeStyle=lineColor;ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(ox+PL,ly);ctx.lineTo(ox+PL+22,ly);ctx.stroke();
    ctx.beginPath();ctx.arc(ox+PL+11,ly,4,0,Math.PI*2);ctx.fillStyle=lineColor;ctx.fill();
    ctx.fillStyle='#94a3b8';ctx.font='9px Courier New';ctx.textAlign='left';
    ctx.fillText(isYield?'Yield':'DPPM',ox+PL+27,ly+3);
    ctx.strokeStyle=targColor;ctx.lineWidth=1.5;ctx.setLineDash([5,3]);
    ctx.beginPath();ctx.moveTo(ox+PL+80,ly);ctx.lineTo(ox+PL+102,ly);ctx.stroke();
    ctx.setLineDash([]);ctx.fillStyle='#94a3b8';ctx.fillText(targLabel,ox+PL+107,ly+3);
  }

  // Yield chart (left)
  drawChartCtx(PAD,y,yVals,TY,TY+'% target',true,'#22c55e','#f59e0b');
  ctx.fillStyle='#3b82f6';ctx.font='bold 11px Courier New';ctx.textAlign='left';
  ctx.fillText('📈 '+custLabel+' — Yield',PAD+16,y+18);

  // DPPM chart (right)
  const rx=W/2+PAD/2;
  drawChartCtx(rx,y,dVals,TD,fmt(TD)+' target',false,'#3b82f6','#f59e0b');
  ctx.fillStyle='#3b82f6';ctx.font='bold 11px Courier New';ctx.textAlign='left';
  ctx.fillText('📈 '+custLabel+' — DPPM',rx+16,y+18);

  y+=CHART+PAD;

  // Yield trend (full width, second row)
  // ... skip second row for brevity, use top-level summary

  // Top 3 strip
  if(t3.length){
    ctx.fillStyle='#111827';rrect(ctx,PAD,y,W-PAD*2,TOP3,8);ctx.fill();
    ctx.strokeStyle='#1e293b';ctx.lineWidth=1;rrect(ctx,PAD,y,W-PAD*2,TOP3,8);ctx.stroke();
    ctx.fillStyle='#3b82f6';ctx.font='bold 11px Courier New';ctx.textAlign='left';
    ctx.fillText('🔴 TOP 3 DEFECTS — '+lw+' — '+custLabel,PAD+14,y+20);
    const sw2=(W-PAD*2-28)/3;
    const rc2=['#ef4444','#f59e0b','#22c55e'];
    t3.forEach(([def,cnt],i)=>{
      const bx=PAD+14+i*(sw2+10);
      ctx.fillStyle=rc2[i]+'15';rrect(ctx,bx,y+28,sw2,TOP3-40,5);ctx.fill();
      ctx.strokeStyle=rc2[i]+'40';ctx.lineWidth=1;rrect(ctx,bx,y+28,sw2,TOP3-40,5);ctx.stroke();
      ctx.fillStyle=rc2[i];ctx.font='bold 12px Courier New';ctx.textAlign='center';
      ctx.fillText('#'+(i+1)+'  '+(def.length>22?def.slice(0,21)+'…':def),bx+sw2/2,y+48);
      ctx.fillStyle=rc2[i];ctx.font='bold 18px Courier New';
      ctx.fillText(cnt+' defects',bx+sw2/2,y+72);
      ctx.fillStyle='#94a3b8';ctx.font='9px Courier New';
      ctx.fillText('Model: '+topOf(def,'model'),bx+sw2/2,y+92);
      ctx.fillStyle='#34d399';ctx.font='9px Courier New';
      ctx.fillText('Comp: '+topOf(def,'comp'),bx+sw2/2,y+108);
    });
    y+=TOP3+PAD;
  }

  // Footer
  ctx.fillStyle='#0f172a';ctx.fillRect(0,y,W,FTR);
  ctx.strokeStyle='#1e3a5f';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();
  ctx.fillStyle='#475569';ctx.font='10px Courier New';ctx.textAlign='center';
  ctx.fillText('SMT Command Center  ·  '+now+'  ·  Confidential',W/2,y+16);
  ctx.fillStyle='#3b82f6';ctx.font='9px Courier New';
  ctx.fillText('Yield ≥'+TY+'%  |  DPPM ≤'+fmt(TD)+'  |  '+filtRaw.length.toLocaleString()+' defect records',W/2,y+32);

  const link=document.createElement('a');
  link.download='SMT_'+custLabel.replace(/[^a-zA-Z0-9]/g,'-')+'_'+weekLabel.replace(/[^a-zA-Z0-9]/g,'-')+'.png';
  link.href=cv.toDataURL('image/png');link.click();
}

function rrect(ctx,x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();
}

// ═══════════════════════════════════════════════════════
// IMPORT
// ═══════════════════════════════════════════════════════
function importDef(){
  const txt=document.getElementById('def-txt').value.trim();
  document.getElementById('def-err').textContent='';
  try{
    const parsed=txt.split('\n').filter(l=>l.trim()).map(l=>{
      const p=l.split(/[\t,]/).map(x=>x.trim().replace(/^"|"$/g,''));
      if(p.length<7)return null;
      const[customer,sn,model,defect,comp,dtStr,side]=p;
      const row=mkRow(dtStr,customer,model,sn,side,comp,defect);
      if(!row)return null;
      return{dtStr,customer,model,sn,side:row.side,comp,defect};
    });
    const rows=parsed.filter(Boolean);
    const skipped=parsed.length-rows.length;
    if(!rows.length){document.getElementById('def-err').textContent='No valid rows. Format: Customer|SerialNo|Model|DefectType|Component|MM/DD/YYYY HH:MM:SS|Side';return;}
    if(!currentUser){document.getElementById('def-err').textContent='Not logged in.';return;}
    document.getElementById('def-err').textContent='Importing '+rows.length+' rows\u2026';
    fetch('/api/yield',{method:'POST',headers:{'Content-Type':'application/json','X-Badge':currentUser.badge},
      body:JSON.stringify({action:'importDefects',rows})})
      .then(r=>r.json()).then(d=>{
        if(d.ok){
          document.getElementById('def-txt').value='';
          document.getElementById('def-err').textContent=skipped?('\u26a0 Imported '+rows.length+' rows, skipped '+skipped+' invalid rows.'):'';
          tog('pd');showToast('Imported '+rows.length+' defect rows \u2713');
        } else document.getElementById('def-err').textContent='Error: '+d.error;
      }).catch(()=>{document.getElementById('def-err').textContent='Network error.';});
  }catch(e){document.getElementById('def-err').textContent='Error: '+e.message;}
}

function importProd(){
  const txt=document.getElementById('prod-txt').value.trim();
  document.getElementById('prod-err').textContent='';
  try{
    const parsed=txt.split('\n').filter(l=>l.trim()).map(l=>{
      const p=l.split(/[\t,]/).map(x=>x.trim().replace(/^"|"$/g,''));
      if(p.length<5)return null;
      const[week,customer,model,side,totalInspected]=p;
      if(!week||!model||!side)return null;
      const ns=side.toUpperCase().replace('BOTTOM','BOT');
      if(!['TOP','BOT'].includes(ns))return null;
      return{week,customer,model,side:ns,count:parseInt(totalInspected)||0};
    });
    const rows=parsed.filter(Boolean);
    const skipped=parsed.length-rows.length;
    if(!rows.length){document.getElementById('prod-err').textContent='No valid rows. Format: Week|Customer|Model|Side|TotalInspected';return;}
    if(!currentUser){document.getElementById('prod-err').textContent='Not logged in.';return;}
    document.getElementById('prod-err').textContent='Importing\u2026';
    fetch('/api/yield',{method:'POST',headers:{'Content-Type':'application/json','X-Badge':currentUser.badge},
      body:JSON.stringify({action:'importProdVol',rows})})
      .then(r=>r.json()).then(d=>{
        if(d.ok){
          document.getElementById('prod-txt').value='';
          document.getElementById('prod-err').textContent=skipped?('\u26a0 Imported, skipped '+skipped+' invalid rows.'):'';
          tog('pp');showToast('Production volume imported \u2713');
        } else document.getElementById('prod-err').textContent='Error: '+d.error;
      }).catch(()=>{document.getElementById('prod-err').textContent='Network error.';});
  }catch(e){document.getElementById('prod-err').textContent='Error: '+e.message;}
}

// ═══════════════════════════════════════════════════════
// NAVIGATION & FILTERS
// (Tab switching itself now goes through the main app's switchView() in
// ui.js, which calls populateFilters()/renderYield() etc. per view — see
// the yield/time/tiers/library/report cases added there.)
// ═══════════════════════════════════════════════════════

function tog(id){const el=document.getElementById(id);el.style.display=el.style.display==='none'?'block':'none';}

function populateFilters(){
  const allM=calcMetrics(rawDef,prodVol);
  const weeks=['ALL',...new Set(allM.map(m=>m.week))].sort();
  const custs=['ALL',...new Set(allM.map(m=>m.customer))].sort();
  const mods=['ALL',...new Set(allM.map(m=>m.model))].sort();
  [['f-week',weeks],['f-cust',custs],['f-model',mods]].forEach(([id,opts])=>{
    const el=document.getElementById(id);if(!el)return;
    const cur=el.value;el.innerHTML=opts.map(o=>`<option${o===cur?' selected':''}>${o}</option>`).join('');
  });
  ['chart-cust'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    const cur=el.value;el.innerHTML=custs.map(o=>`<option${o===cur?' selected':''}>${o}</option>`).join('');
  });
}

function populateTimeFilters(){
  const weeks=['ALL',...new Set(rawDef.map(d=>d.week))].sort();
  const custs=['ALL',...new Set(rawDef.map(d=>d.customer))].sort();
  const mods=['ALL',...new Set(rawDef.map(d=>d.model))].sort();
  [['tf-week',weeks],['tf-cust',custs],['tf-model',mods]].forEach(([id,opts])=>{
    const el=document.getElementById(id);if(!el)return;
    const cur=el.value;el.innerHTML=opts.map(o=>`<option${o===cur?' selected':''}>${o}</option>`).join('');
  });
}

function populateRptFilter(){
  const custs=['ALL',...new Set(rawDef.map(d=>d.customer))].sort();
  const el=document.getElementById('rpt-cust');if(!el)return;
  const cur=el.value;el.innerHTML=custs.map(o=>`<option${o===cur?' selected':''}>${o}</option>`).join('');
}

// ═══════════════════════════════════════════════════════
// INIT
// (No local storage — rawDef/prodVol/modelTiers are populated by the
// smt_defects/smt_prodvol/smt_modeltiers Firebase listeners in ui.js's
// initListeners(), the same pattern as customers/models/complaints.
// Rendering happens on view-switch and on each Firebase update, not here.)
// ═══════════════════════════════════════════════════════
window.addEventListener('resize',()=>{
  if(currentView==='yield')renderYield();
  if(currentView==='time')renderTime();
});
