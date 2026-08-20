const KEY="ecodata_mobile_v4";
const samples=[];
const DEMO_CLEANUP_KEY="ecodata_demo_cleanup_v1";

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
function data(){let d=JSON.parse(localStorage.getItem(KEY));if(!d){d=samples;localStorage.setItem(KEY,JSON.stringify(d))}return d}
function save(d){localStorage.setItem(KEY,JSON.stringify(d));render()}
function now(){let d=new Date();return{fecha:d.toLocaleDateString("es-AR"),hora:d.toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"})}}
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
 $("history").innerHTML=d.map(r=>`<div class="row"><div class="row-icon">KG</div><div class="row-info"><b>${safe(r.empleado)}</b><small>${safe(r.fecha)} · ${safe(r.hora)} · ${safe(r.sucursal)}</small></div><div class="row-weight">${kg(r.peso)} kg<small>${""}</small></div></div>`).join("")||'<div class="row">No se encontraron registros.</div>';
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
 e.preventDefault();let p=Number($("peso").value);
 if(!p||p<0)return toast("Ingresá un peso válido.");
 if(!$("sucursal").value)return toast("Escaneá primero el QR de la sucursal.");
 let n=now(),d=data();
 d.unshift({fecha:n.fecha,hora:n.hora,sucursal:$("sucursal").value,empleado:$("empleado").value,peso:p,observaciones:$("obs").value});
 save(d);$("form").reset();$("sucursal").value="";$("sucursalLabel").textContent="Sin identificar";$("branchAuto").classList.remove("identified");setQrStatus("Escaneá el QR de la sucursal","Usá la cámara para identificarla automáticamente.");screen("home");toast("✓ Pesaje guardado correctamente");
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
   PWA — actualización automática
   ========================= */

const APP_VERSION = "8";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("./service-worker-v8.js?v=" + APP_VERSION, {
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

