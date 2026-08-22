const KEY="ecodata_mobile_v4";
const samples=[];
const DEMO_CLEANUP_KEY="ecodata_demo_cleanup_v1";
const PENDING_UPLOAD_KEY="ecodata_pending_uploads_v1";

/* =========================
   SUPABASE Y GOOGLE SHEETS
   ========================= */
const SUPABASE_URL = "https://axcygjpdfwcjwdwyxlpl.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable__EwVnv-w3DodsB80N1hRkA_xHwRG7M9";
const SUPABASE_TABLE = "pesajes";

/* =========================
   GOOGLE SHEETS (Apps Script)
   ========================= */
// Pegá acá la URL del Web App que te da Google Apps Script al desplegarlo
// (Deploy → New deployment → Web app). Ver instrucciones de configuración.
const GOOGLE_SHEETS_CONFIG = {
  endpoint: "https://script.google.com/macros/s/AKfycbyvU0ykE-uA7FhnAi2rf4PUYV8Dz_dCQHmooOMw4vLE49edVedfMeCY9fHGju9bhvtLYQ/exec",
  enabled: true
};
const GOOGLE_PENDING_KEY = "ecodata_google_pending_v1";
const GOOGLE_SEND_TIMEOUT_MS = 15000;



let supabaseClient = null;

function initSupabase(){
  try{
    if(window.supabase && typeof window.supabase.createClient === "function"){
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
      return true;
    }
  }catch(err){ console.warn("Supabase no disponible:",err); }
  return false;
}
function setSyncStatus(text, ok=false){
  const el=$("syncStatus"); if(!el)return;
  el.textContent=text; el.classList.toggle("sync-ok",ok);
}
function localId(){
  if(window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "local-"+Date.now()+"-"+Math.random().toString(16).slice(2);
}
function normalizeLocalRecords(records){
  let changed=false;
  const out=(Array.isArray(records)?records:[]).map(r=>{
    const item={...r};
    if(!item.id){item.id=localId();changed=true;}
    if(item.observaciones==null)item.observaciones="";
    if(item.empleado==null)item.empleado="";
    return item;
  });
  if(changed)localStorage.setItem(KEY,JSON.stringify(out));
  return out;
}
function pendingIds(){
  try {
    const raw=JSON.parse(localStorage.getItem(PENDING_UPLOAD_KEY)||"[]");
    return new Set(Array.isArray(raw)?raw.map(String):[]);
  } catch(_) { return new Set(); }
}
function savePendingIds(ids){
  localStorage.setItem(PENDING_UPLOAD_KEY,JSON.stringify(Array.from(ids).map(String)));
}
function markPending(id){
  const ids=pendingIds(); ids.add(String(id)); savePendingIds(ids);
}
function clearPending(id){
  const ids=pendingIds(); ids.delete(String(id)); savePendingIds(ids);
}

/* Pendientes de envío a Google Sheets (independiente de los pendientes de Supabase) */
function googlePendingIds(){
  try{
    const raw=JSON.parse(localStorage.getItem(GOOGLE_PENDING_KEY)||"[]");
    return new Set(Array.isArray(raw)?raw.map(String):[]);
  }catch(_){ return new Set(); }
}
function saveGooglePendingIds(ids){
  localStorage.setItem(GOOGLE_PENDING_KEY,JSON.stringify(Array.from(ids).map(String)));
}
function markGooglePending(id){
  const ids=googlePendingIds(); ids.add(String(id)); saveGooglePendingIds(ids);
}
function clearGooglePending(id){
  const ids=googlePendingIds(); ids.delete(String(id)); saveGooglePendingIds(ids);
}

/* normalizePeso: valida y normaliza el peso ingresado (acepta coma o punto decimal) */
function normalizePeso(value){
  if(value===null || value===undefined || value==="") return {ok:false,value:null};
  const raw=String(value).trim().replace(",",".");
  const num=Number(raw);
  if(!Number.isFinite(num) || num<0) return {ok:false,value:null};
  return {ok:true,value:Math.round(num*100)/100};
}

/* Convierte fecha/hora al formato prolijo que se muestra en Google Sheets (dd/mm/aaaa y HH:mm[:ss]) */
function padZero2(n){ return String(n).padStart(2,"0"); }
function formatFechaForSheets(value){
  const raw=String(value||"").trim();
  const m=raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if(m) return `${padZero2(m[1])}/${padZero2(m[2])}/${m[3]}`;
  return raw;
}
function formatHoraForSheets(value){
  const raw=String(value||"").trim();
  const m=raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if(m) return `${padZero2(m[1])}:${m[2]}${m[3]?":"+m[3]:""}`;
  return raw;
}

function toSupabaseTime(value){
  let raw=String(value??"").trim().toLowerCase();
  raw=raw.replace(/\u00a0/g," ").replace(/\s+/g," ").trim();

  let mer="";
  const merMatch=raw.match(/(?:^|\s)(a\s*\.?\s*m\.?|p\s*\.?\s*m\.?)[.!]?$/i);
  if(merMatch){
    mer=merMatch[1].replace(/[\s.]/g,"");
    raw=raw.slice(0,merMatch.index).trim();
  }

  if(!mer){
    const attached=raw.match(/(a\s*\.?\s*m\.?|p\s*\.?\s*m\.?)[.!]?$/i);
    if(attached){
      mer=attached[1].replace(/[\s.]/g,"");
      raw=raw.slice(0,attached.index).trim();
    }
  }

  const m=raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if(!m) return raw;

  let h=Number(m[1]);
  const min=Number(m[2]);
  const sec=m[3]?Number(m[3]):0;
  if(mer==="pm" && h<12) h+=12;
  if(mer==="am" && h===12) h=0;
  if(h<0||h>23||min<0||min>59||sec<0||sec>59) return raw;
  return `${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

function toSupabaseDate(value){
  const raw=String(value||"").trim();
  let m=raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(m) return `${m[3]}-${String(m[2]).padStart(2,"0")}-${String(m[1]).padStart(2,"0")}`;
  m=raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if(m) return `${m[1]}-${String(m[2]).padStart(2,"0")}-${String(m[3]).padStart(2,"0")}`;
  return raw;
}
function fromSupabaseDate(value){
  const raw=String(value||"").trim();
  const m=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m) return `${Number(m[3])}/${Number(m[2])}/${m[1]}`;
  return raw;
}


function recordToRemote(r){
  return {
    id:String(r.id),
    fecha:toSupabaseDate(r.fecha),
    hora:toSupabaseTime(r.hora),
    sucursal:String(r.sucursal||"Sin sucursal"),
    empleado:String(r.empleado||""),
    peso:normalizePeso(r.peso).ok ? normalizePeso(r.peso).value : r.peso,
    observaciones:String(r.observaciones||""),
    created_at:r.created_at||new Date().toISOString()
  };
}
function remoteToLocal(r){
  return {
    id:String(r.id),
    fecha:fromSupabaseDate(r.fecha),
    hora:String(r.hora||""),
    sucursal:String(r.sucursal||"Sin sucursal"),
    empleado:String(r.empleado||""),
    peso:normalizePeso(r.peso).ok ? normalizePeso(r.peso).value : r.peso,
    observaciones:String(r.observaciones||""),
    created_at:r.created_at||null
  };
}
function formatSupabaseError(err){
  if(!err) return "Error desconocido";
  const parts=[];
  if(err.message) parts.push(err.message);
  if(err.code) parts.push(`Código ${err.code}`);
  if(err.details) parts.push(err.details);
  if(err.hint) parts.push(`Ayuda: ${err.hint}`);
  return parts.join(" · ") || String(err);
}

function showSyncError(err){
  const detail=formatSupabaseError(err);
  console.error("EcoData · error Supabase:", err);
  setSyncStatus(`⚠️ Supabase: ${detail}`, false);
}

async function fetchRemoteRecords(){
  const {data:remote,error}=await supabaseClient
    .from(SUPABASE_TABLE)
    .select("id,fecha,hora,sucursal,empleado,peso,observaciones,created_at")
    .order("created_at",{ascending:false});
  if(error) throw error;
  return Array.isArray(remote) ? remote.map(remoteToLocal) : [];
}

async function insertMissingLocalRecords(local,remote){
  const remoteIds=new Set(remote.map(r=>String(r.id)));
  const pendingSet=pendingIds();
  const pending=local.filter(r=>pendingSet.has(String(r.id)) && !remoteIds.has(String(r.id)));
  if(!pending.length) return 0;

  const payload=pending.map(recordToRemote);
  const {error}=await supabaseClient.from(SUPABASE_TABLE).insert(payload);
  if(error) throw error;
  
  for (const r of pending) {
    clearPending(r.id);
    await sendToGoogleSheets(r);
  }
  return pending.length;
}

async function syncWithSupabase(){
  if(!supabaseClient){setSyncStatus("⚠️ Supabase no disponible");return;}
  if(!navigator.onLine){setSyncStatus("📴 Sin conexión · guardado local");return;}

  try{
    setSyncStatus("☁️ Sincronizando...");

    let remote=await fetchRemoteRecords();
    const local=normalizeLocalRecords(data());
    const inserted=await insertMissingLocalRecords(local,remote);
    if(inserted) remote=await fetchRemoteRecords();

    const result=remote.sort((a,b)=>{
      const da=a.created_at?new Date(a.created_at).getTime():0;
      const db=b.created_at?new Date(b.created_at).getTime():0;
      if(db!==da)return db-da;
      return String(b.fecha+" "+b.hora).localeCompare(String(a.fecha+" "+a.hora));
    });

    localStorage.setItem(KEY,JSON.stringify(result));
    render();
    setSyncStatus(`☁️ Datos sincronizados · ${result.length} registros`,true);
  }catch(err){
    showSyncError(err);
  }
}

async function syncSingleRecord(record){
  markPending(record.id);
  markGooglePending(record.id);
  if(!supabaseClient || !navigator.onLine){
    setSyncStatus("📴 Guardado local · pendiente de sincronizar");
    return false;
  }

  try{
    const {data:existing,error:checkError}=await supabaseClient
      .from(SUPABASE_TABLE)
      .select("id")
      .eq("id",String(record.id))
      .maybeSingle();
    if(checkError) throw checkError;

    if(!existing){
      const {error}=await supabaseClient
        .from(SUPABASE_TABLE)
        .insert([recordToRemote(record)]);
      if(error) throw error;
    }

    clearPending(record.id);
    const sheetsOk = await sendToGoogleSheets(record);
    if (!sheetsOk) {
      setSyncStatus("⚠️ Supabase OK · Google Sheets no confirmó el envío", false);
    } else {
      setSyncStatus("☁️ Pesaje sincronizado",true);
    }
    return true;
  }catch(err){
    showSyncError(err);
    return false;
  }
}

/* =========================
   ENVÍO A GOOGLE SHEETS
   ========================= */
// Envía un registro al Google Apps Script Web App. NUNCA bloquea el guardado
// en Supabase/localStorage: si falla, el registro queda marcado como
// pendiente (ecodata_google_pending_v1) y se reintenta más adelante.
async function sendToGoogleSheets(record){
  if(!GOOGLE_SHEETS_CONFIG.enabled) return false;
  if(!GOOGLE_SHEETS_CONFIG.endpoint || GOOGLE_SHEETS_CONFIG.endpoint.indexOf("PEGAR_AQUI")!==-1){
    // Todavía no se configuró la URL del Apps Script: no es un error del usuario,
    // simplemente no hay nada a dónde enviar.
    return false;
  }
  if(!record || !record.id) return false;

  if(!navigator.onLine){
    markGooglePending(record.id);
    return false;
  }

  const pesoCheck=normalizePeso(record.peso);
  const payload={
    id:String(record.id),
    fecha:formatFechaForSheets(record.fecha),
    hora:formatHoraForSheets(record.hora),
    empleado:String(record.empleado||""),
    sucursal:String(record.sucursal||""),
    peso:pesoCheck.ok?pesoCheck.value:Number(record.peso)||0,
    observaciones:String(record.observaciones||"")
  };

  const controller=(typeof AbortController!=="undefined")?new AbortController():null;
  const timeoutId=controller?setTimeout(()=>controller.abort(),GOOGLE_SEND_TIMEOUT_MS):null;

  try{
    const response=await fetch(GOOGLE_SHEETS_CONFIG.endpoint,{
      method:"POST",
      // text/plain evita el preflight CORS que Google Apps Script Web Apps no
      // maneja bien; el Apps Script igualmente parsea el body como JSON.
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify(payload),
      signal:controller?controller.signal:undefined
    });
    if(timeoutId) clearTimeout(timeoutId);

    if(!response.ok){
      console.warn("EcoData · Google Sheets respondió con error HTTP",response.status);
      markGooglePending(record.id);
      return false;
    }

    let result=null;
    try{ result=await response.json(); }catch(_){ result=null; }

    if(result && result.success===false){
      console.warn("EcoData · Google Sheets rechazó el registro:",result.error);
      markGooglePending(record.id);
      return false;
    }

    clearGooglePending(record.id);
    return true;
  }catch(err){
    if(timeoutId) clearTimeout(timeoutId);
    console.warn("EcoData · no se pudo enviar a Google Sheets:",err);
    markGooglePending(record.id);
    return false;
  }
}

let googleSyncInFlight=false;
// Reintenta enviar a Google Sheets todos los registros que quedaron pendientes.
async function syncPendingGoogleSheets(){
  if(googleSyncInFlight) return;
  if(!GOOGLE_SHEETS_CONFIG.enabled || !navigator.onLine) return;
  const pending=googlePendingIds();
  if(!pending.size) return;

  googleSyncInFlight=true;
  try{
    const records=data();
    const byId=new Map(records.map(r=>[String(r.id),r]));
    for(const id of pending){
      const record=byId.get(String(id));
      if(!record){ clearGooglePending(id); continue; } // el registro ya no existe localmente
      await sendToGoogleSheets(record);
    }
  }finally{
    googleSyncInFlight=false;
  }
}

async function deleteRecord(id){
  const recordId=String(id);
  if(!navigator.onLine || !supabaseClient){
    toast("Necesitás conexión para eliminar el registro compartido.");
    return;
  }

  const confirmed=window.confirm("¿Eliminar este registro?\n\nSe eliminará de Supabase y de todos los dispositivos sincronizados.");
  if(!confirmed) return;

  try{
    setSyncStatus("☁️ Eliminando registro...");
    const {error}=await supabaseClient
      .from(SUPABASE_TABLE)
      .delete()
      .eq("id",recordId);
    if(error) throw error;

    clearPending(recordId);
    const updated=data().filter(r=>String(r.id)!==recordId);
    localStorage.setItem(KEY,JSON.stringify(updated));
    render();
    setSyncStatus(`☁️ Datos sincronizados · ${updated.length} registros`,true);
    toast("✓ Registro eliminado correctamente");
  }catch(err){
    showSyncError(err);
  }
}

function removeDemoRecords(){
  if(localStorage.getItem(DEMO_CLEANUP_KEY)) return;
  try{
    const current=JSON.parse(localStorage.getItem(KEY)||"[]");
    const demoNames=new Set(["dina","nadia","solé","sole"]);
    const cleaned=Array.isArray(current)
      ? current.filter(r=>!demoNames.has(String(r.empleado||"").trim().toLowerCase()))
      : [];
    localStorage.setItem(KEY,JSON.stringify(cleaned));
  }catch(_){
    localStorage.setItem(KEY,JSON.stringify([]));
  }
  localStorage.setItem(DEMO_CLEANUP_KEY,"1");
}
removeDemoRecords();
const $=id=>document.getElementById(id);
function data(){let d=JSON.parse(localStorage.getItem(KEY));if(!d){d=samples;localStorage.setItem(KEY,JSON.stringify(d))}return normalizeLocalRecords(d)}
function save(d){localStorage.setItem(KEY,JSON.stringify(d));render()}
function now(){let d=new Date();return{fecha:d.toLocaleDateString("es-AR"),hora:`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`}}
function kg(n){return Number(n).toLocaleString("es-AR",{minimumFractionDigits:2,maximumFractionDigits:2})}
function render(){
 const d=data(),total=d.reduce((s,r)=>s+Number(r.peso),0);
 $("total").textContent=kg(total);$("records").textContent=d.length;
 renderDashboard(d);
 renderHistorical(d);
 $("recent").innerHTML=d.slice(0,5).map(r=>`<div class="row"><div class="row-icon">KG</div><div class="row-info"><b>${safe(r.empleado)} · ${safe(r.sucursal)}</b><small>${safe(r.fecha)} · ${safe(r.hora)}</small></div><div class="row-weight">${kg(r.peso)} kg<small>${""}</small></div></div>`).join("")||'<div class="row">Sin registros.</div>';
 renderHistory();
}

function parseRecordDate(record){
  const raw=String(record.fecha||"").trim();
  let match=raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if(match){
    const d=new Date(Number(match[3]),Number(match[2])-1,Number(match[1]));
    return Number.isNaN(d.getTime())?null:d;
  }
  match=raw.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if(match){
    const d=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
    return Number.isNaN(d.getTime())?null:d;
  }
  return null;
}

function renderDashboard(records){
  const nowDate=new Date();
  const monthRecords=records.filter(r=>{
    const d=parseRecordDate(r);
    return d && d.getFullYear()===nowDate.getFullYear() && d.getMonth()===nowDate.getMonth();
  });
  const monthKg=monthRecords.reduce((s,r)=>s+Number(r.peso||0),0);
  const totalKg=records.reduce((s,r)=>s+Number(r.peso||0),0);
  const average=records.length?totalKg/records.length:0;

  $("monthKg").textContent=`${kg(monthKg)} kg`;
  $("monthRecords").textContent=`${monthRecords.length} ${monthRecords.length===1?"registro":"registros"}`;
  $("averageKg").textContent=`${kg(average)} kg`;
  $("dashboardPeriod").textContent=nowDate.toLocaleDateString("es-AR",{month:"long",year:"numeric"});

  const branches={};
  records.forEach(r=>{
    const name=String(r.sucursal||"Sin sucursal").trim()||"Sin sucursal";
    branches[name]=(branches[name]||0)+Number(r.peso||0);
  });
  const branchEntries=Object.entries(branches).sort((a,b)=>b[1]-a[1]);
  if(branchEntries.length){
    const [topName,topKg]=branchEntries[0];
    $("topBranch").textContent=safe(topName);
    $("topBranchKg").textContent=`${kg(topKg)} kg acumulados`;
    $("branchCount").textContent=`${branchEntries.length} ${branchEntries.length===1?"sucursal":"sucursales"}`;
    const maxKg=branchEntries[0][1]||1;
    $("branchBars").innerHTML=branchEntries.slice(0,4).map(([name,value])=>{
      const width=Math.max(4,Math.round((value/maxKg)*100));
      return `<div class="branch-bar-row"><div class="branch-bar-label"><span>${safe(name)}</span><b>${kg(value)} kg</b></div><div class="branch-track"><span style="width:${width}%"></span></div></div>`;
    }).join("");
  }else{
    $("topBranch").textContent="Sin datos";
    $("topBranchKg").textContent="Registrá un pesaje para comenzar";
    $("branchCount").textContent="Sin registros";
    $("branchBars").innerHTML='<div class="dashboard-empty">Todavía no hay datos por sucursal.</div>';
  }
}
function renderHistorical(records){
  const year=new Date().getFullYear();
  const monthNames=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const monthly=Array(12).fill(0);
  let validRecords=0;

  records.forEach(r=>{
    const d=parseRecordDate(r);
    if(d && d.getFullYear()===year){
      monthly[d.getMonth()]+=Number(r.peso||0);
      validRecords++;
    }
  });

  const annualTotal=monthly.reduce((a,b)=>a+b,0);
  const activeMonths=monthly.filter(v=>v>0).length;
  const averageMonthly=activeMonths?annualTotal/activeMonths:0;
  const peakValue=Math.max(...monthly);
  const peakIndex=peakValue>0?monthly.indexOf(peakValue):-1;

  $("historicalYear").textContent=`${year}`;
  $("historicalTotal").textContent=`${kg(annualTotal)} kg`;
  $("peakMonth").textContent=peakIndex>=0?`${monthNames[peakIndex]} · ${kg(peakValue)} kg`:"Sin datos";
  $("yearlyAverage").textContent=`${kg(averageMonthly)} kg`;

  const max=Math.max(...monthly,1);
  $("historyChart").innerHTML=monthly.map((value,index)=>{
    const height=value>0?Math.max(8,Math.round((value/max)*100)):4;
    return `<div class="history-bar-item" title="${monthNames[index]}: ${kg(value)} kg">
      <div class="history-bar-value">${value>0?kg(value):""}</div>
      <div class="history-bar-track"><span style="height:${height}%"></span></div>
      <small>${monthNames[index]}</small>
    </div>`;
  }).join("");

  $("historyNote").textContent=annualTotal>0
    ? `${validRecords} ${validRecords===1?"registro":"registros"} en ${activeMonths} ${activeMonths===1?"mes":"meses"}.`
    : "Todavía no hay datos del año.";
}

function renderHistory(){
 const q=($("search")?.value||"").toLowerCase();
 const d=data().filter(r=>[r.fecha,r.hora,r.sucursal,r.empleado].join(" ").toLowerCase().includes(q));
 $("history").innerHTML=d.map(r=>`<div class="row">
   <div class="row-icon">KG</div>
   <div class="row-info"><b>${safe(r.empleado)}</b><small>${safe(r.fecha)} · ${safe(r.hora)} · ${safe(r.sucursal)}</small></div>
   <div class="row-actions"><div class="row-weight">${kg(r.peso)} kg</div><button type="button" class="delete-record" data-delete-id="${safe(r.id)}" aria-label="Eliminar registro">Eliminar</button></div>
 </div>`).join("")||'<div class="row">No se encontraron registros.</div>';
 document.querySelectorAll("[data-delete-id]").forEach(btn=>btn.addEventListener("click",()=>deleteRecord(btn.dataset.deleteId)));
}
function safe(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function screen(id){
 document.querySelectorAll(".screen").forEach(s=>s.classList.toggle("active",s.id===id));
 document.querySelectorAll(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.screen===id));
 if(id==="registro"){let n=now();$("fecha").value=n.fecha;$("sucursal").value="";$("sucursalLabel").textContent="Sin identificar";$("hora").value=n.hora}
 window.scrollTo(0,0);
}
document.querySelectorAll("[data-screen]").forEach(b=>b.addEventListener("click",()=>screen(b.dataset.screen)));
$("form").addEventListener("submit",e=>{
 e.preventDefault();
 const pesoInput=$("peso").value;
 const pesoCheck=normalizePeso(pesoInput);
 console.log("PESO DEL INPUT:", pesoInput);
 console.log("PESO CONVERTIDO:", pesoCheck.ok ? pesoCheck.value : undefined);
 if(!pesoCheck.ok || pesoCheck.value<0)return toast("Ingresá un peso válido.");
 const p=pesoCheck.value;
 if(!$("sucursal").value)return toast("Escaneá primero el QR de la sucursal.");
 let n=now(),d=data();
 const record={id:localId(),fecha:n.fecha,hora:n.hora,sucursal:$("sucursal").value,empleado:$("empleado").value,peso:p,observaciones:$("obs").value,created_at:new Date().toISOString()};
 console.log("RECORD:",record);
 d.unshift(record);
 save(d);markPending(record.id);syncSingleRecord(record).then(()=>syncPendingGoogleSheets());$("form").reset();$("sucursal").value="";$("sucursalLabel").textContent="Sin identificar";$("branchAuto").classList.remove("identified");setQrStatus("Escaneá el QR de la sucursal","Usá la cámara para identificarla automáticamente.");screen("home");toast("✓ Pesaje guardado correctamente");
});
$("search").addEventListener("input",renderHistory);
function toast(t){$("toast").textContent=t;$("toast").classList.add("show");clearTimeout(window.tt);window.tt=setTimeout(()=>$("toast").classList.remove("show"),2200)}
let n=now();$("fecha").value=n.fecha;$("sucursal").value="";$("sucursalLabel").textContent="Sin identificar";$("hora").value=n.hora;setInterval(()=>{let n=now();$("fecha").value=n.fecha;$("hora").value=n.hora},30000);render();

/* =========================
   ESCÁNER QR DE SUCURSAL
   ========================= */

let qrScannerInstance=null;
let qrStarting=false;

function setQrStatus(title,text,ok=false){
  $("qrStatusTitle").textContent=title;
  $("qrStatusText").textContent=text;
  $("qrStatus").classList.toggle("qr-ok",ok);
  $("qrStatus").querySelector("span").textContent=ok?"✓":"⌁";
}

function extractSucursal(decodedText){
  const raw=String(decodedText||"").trim();
  if(!raw)return "";

  let value=raw;

  try{
    const obj=JSON.parse(raw);
    if(obj && typeof obj.sucursal==="string") value=obj.sucursal.trim();
  }catch(_){
    const match=raw.match(/(?:sucursal|branch)\s*[:=]\s*(.+)$/i);
    if(match)value=match[1].trim();
  }

  const normalized=value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const fixed={
    "lanus":"Lanús",
    "adrogue":"Adrogué",
    "canning":"Canning"
  };

  return fixed[normalized]||"";
}

function setSucursalFromQr(decodedText){
  const sucursal=extractSucursal(decodedText);

  if(!sucursal){
    setQrStatus("QR no válido","Este código no corresponde a una sucursal de EcoData.",false);
    return;
  }

  $("sucursal").value=sucursal;
  $("sucursalLabel").textContent=sucursal;
  $("branchAuto").classList.add("identified");
  setQrStatus("Sucursal identificada",`EcoData detectó automáticamente: ${sucursal}`,true);
  closeQrScanner();
  toast(`✓ Sucursal: ${sucursal}`);
}

async function openQrScanner(){
  const box=$("qrScanner");
  const error=$("qrError");
  box.hidden=false;
  error.textContent="";

  if(typeof Html5Qrcode==="undefined"){
    error.textContent="No se pudo cargar el lector QR. Verificá tu conexión a internet.";
    return;
  }

  if(qrScannerInstance || qrStarting)return;

  qrStarting=true;
  qrScannerInstance=new Html5Qrcode("qr-reader");

  try{
    const config={
      fps:10,
      qrbox:{width:220,height:220},
      aspectRatio:1
    };

    await qrScannerInstance.start(
      {facingMode:"environment"},
      config,
      decodedText=>setSucursalFromQr(decodedText),
      ()=>{}
    );
  }catch(err){
    console.error(err);
    error.textContent="No se pudo acceder a la cámara. Permití el acceso a la cámara y probá nuevamente.";
    try{
      if(qrScannerInstance){
        await qrScannerInstance.clear();
      }
    }catch(_){}
    qrScannerInstance=null;
  }finally{
    qrStarting=false;
  }
}

async function closeQrScanner(){
  $("qrScanner").hidden=true;
  if(qrScannerInstance){
    try{
      await qrScannerInstance.stop();
    }catch(_){}
    try{
      await qrScannerInstance.clear();
    }catch(_){}
    qrScannerInstance=null;
  }
}

$("openQrScanner").addEventListener("click",openQrScanner);
$("closeQrScanner").addEventListener("click",closeQrScanner);


/* =========================
   SINCRONIZACIÓN EN LA NUBE
   ========================= */
initSupabase();
window.addEventListener("online",()=>syncWithSupabase());
window.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")syncWithSupabase();});
window.addEventListener("load",()=>setTimeout(()=>syncWithSupabase(),300));
setInterval(()=>{if(document.visibilityState==="visible" && navigator.onLine)syncWithSupabase();},60000);

/* Reintentos de Google Sheets: al volver la conexión, al volver a estar visible,
   al iniciar la PWA y periódicamente (solo si hay pendientes). */
window.addEventListener("online",()=>syncPendingGoogleSheets());
window.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")syncPendingGoogleSheets();});
window.addEventListener("load",()=>setTimeout(()=>syncPendingGoogleSheets(),1500));
setInterval(()=>{if(document.visibilityState==="visible" && navigator.onLine)syncPendingGoogleSheets();},90000);

/* =========================
   PWA — actualización automática
   ========================= */

const APP_VERSION = "16";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./service-worker-v16.js", {
        scope: "./",
        updateViaCache: "none"
      });
      console.info("EcoData PWA activa", reg.scope);
      try { await reg.update(); } catch (_) {}
    } catch (err) {
      console.warn("No se pudo registrar la PWA:", err);
    }
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

let deferredInstallPrompt = null;

function isStandalone(){
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function updateInstallButton(){
  const button = $("installApp");
  if (!button) return;
  if (isStandalone()) { button.hidden = true; return; }
  button.hidden = false;
  button.textContent = deferredInstallPrompt ? "Instalar" : "Cómo instalar";
}
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  updateInstallButton();
});
window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  updateInstallButton();
  toast("✓ EcoData instalada en el dispositivo");
});
window.addEventListener("load", updateInstallButton);
const installButton = $("installApp");
if (installButton) {
  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      toast("Chrome: menú ⋮ → Instalar aplicación / Agregar a pantalla principal");
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    updateInstallButton();
  });
}
