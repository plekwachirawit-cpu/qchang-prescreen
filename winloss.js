// ── AUTH ──────────────────────────────────────
if(!sessionStorage.getItem('qc_auth')){location.href='login.html'}
function logout(){sessionStorage.removeItem('qc_auth');location.href='login.html'}

const SUPA_URL='https://zgcvjrwnhtpvhevnoeqs.supabase.co'
const SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnY3ZqcnduaHRwdmhldm5vZXFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5ODMwMTQsImV4cCI6MjA5NjU1OTAxNH0.zAoLV-som-K01WaFhSzsbgavwL2xf_iPoBhzNgN9zUM'
const SUPA_H={'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY,'Content-Type':'application/json'}

const TH_MONTH=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

let PROJECTS=[]
let curMonth='all'      // 'all' | 'YYYY-MM'
let editId=null
let editResult=''

// ── DATA ──────────────────────────────────────
async function loadProjects(){
  try{
    const ctrl=new AbortController()
    const timer=setTimeout(()=>ctrl.abort(),8000)
    const r=await fetch(`${SUPA_URL}/rest/v1/projects?select=*&order=created_at.desc`,{headers:SUPA_H,signal:ctrl.signal})
    clearTimeout(timer)
    if(!r.ok){console.error('loadProjects error:',r.status);return []}
    return await r.json()
  }catch(e){console.error('loadProjects:',e.message);return []}
}

// win/loss meta stored inside fields._winloss to avoid schema change
function wl(p){return (p.fields&&p.fields._winloss)||{}}
function monthOf(p){
  const w=wl(p)
  const d=w.closed||p.date||(p.created_at?p.created_at.split('T')[0]:'')
  return d?d.slice(0,7):''   // YYYY-MM
}
function resultOf(p){return wl(p).result||''}
function valueOf(p){const v=wl(p).value;return v?Number(v):0}

async function persistWL(p,data){
  const fields=Object.assign({},p.fields||{})
  fields._winloss=Object.assign({},fields._winloss||{},data)
  p.fields=fields
  await fetch(`${SUPA_URL}/rest/v1/projects?id=eq.${p.id}`,{
    method:'PATCH',
    headers:{...SUPA_H,'Prefer':'return=minimal'},
    body:JSON.stringify({fields})
  })
}

// ── MONTH SELECT ──────────────────────────────
function buildMonthOptions(){
  const set=new Set()
  PROJECTS.forEach(p=>{const m=monthOf(p);if(m)set.add(m)})
  const months=[...set].sort().reverse()
  const sel=document.getElementById('month-sel')
  let html='<option value="all">ทุกเดือน (ทั้งหมด)</option>'
  months.forEach(m=>{
    const[y,mo]=m.split('-')
    html+=`<option value="${m}">${TH_MONTH[+mo-1]} ${(+y)+543}</option>`
  })
  sel.innerHTML=html
  // default to most recent month with data, else all
  if(curMonth==='all'&&months.length){curMonth=months[0];sel.value=curMonth}
  else sel.value=curMonth
}
function onMonthChange(){curMonth=document.getElementById('month-sel').value;render()}
function stepMonth(dir){
  const sel=document.getElementById('month-sel')
  const opts=[...sel.options].map(o=>o.value)
  let i=opts.indexOf(curMonth)
  i=Math.min(Math.max(i+dir,0),opts.length-1)
  curMonth=opts[i];sel.value=curMonth;render()
}

function inView(p){return curMonth==='all'||monthOf(p)===curMonth}

// ── RENDER ────────────────────────────────────
const fmt=n=>n.toLocaleString('en-US')

function render(){
  const ps=PROJECTS.filter(inView)
  const wins=ps.filter(p=>resultOf(p)==='win')
  const losses=ps.filter(p=>resultOf(p)==='loss')
  const pend=ps.filter(p=>!resultOf(p))
  const decided=wins.length+losses.length
  const rate=decided?Math.round(wins.length/decided*100):0
  const wonValue=wins.reduce((s,p)=>s+valueOf(p),0)

  document.getElementById('kpi-row').innerHTML=`
    <div class="kpi"><div class="kpi-accent" style="background:var(--green)"></div><div class="kpi-n" style="color:var(--green)">${wins.length}</div><div class="kpi-l">ชนะ (Win)</div><div class="kpi-sub">฿${fmt(wonValue)}</div></div>
    <div class="kpi"><div class="kpi-accent" style="background:var(--accent)"></div><div class="kpi-n" style="color:var(--accent)">${losses.length}</div><div class="kpi-l">แพ้ (Loss)</div><div class="kpi-sub">มูลค่า ฿${fmt(losses.reduce((s,p)=>s+valueOf(p),0))}</div></div>
    <div class="kpi"><div class="kpi-accent" style="background:var(--blue)"></div><div class="kpi-n" style="color:var(--blue)">${rate}%</div><div class="kpi-l">Win Rate</div><div class="kpi-sub">${wins.length}/${decided} ดีล</div></div>
    <div class="kpi"><div class="kpi-accent" style="background:var(--amber)"></div><div class="kpi-n" style="color:var(--amber)">${pend.length}</div><div class="kpi-l">รอผล / Pipeline</div><div class="kpi-sub">ยังไม่ปิดดีล</div></div>`

  renderTrend()
  renderBoard(pend,wins,losses)
}

function renderTrend(){
  const map={}
  PROJECTS.forEach(p=>{
    const m=monthOf(p);if(!m)return
    if(!map[m])map[m]={w:0,l:0}
    const r=resultOf(p)
    if(r==='win')map[m].w++;else if(r==='loss')map[m].l++
  })
  const months=Object.keys(map).sort().slice(-12)
  const max=Math.max(1,...months.map(m=>map[m].w+map[m].l))
  const bars=document.getElementById('trend-bars')
  if(!months.length){bars.innerHTML='<div style="color:var(--ink3);font-size:12px;padding:20px">ยังไม่มีข้อมูลผล — ลากการ์ดเข้าคอลัมน์ Win/Loss เพื่อเริ่มบันทึก</div>';return}
  bars.innerHTML=months.map(m=>{
    const[y,mo]=m.split('-')
    const d=map[m]
    const wh=d.w/max*100, lh=d.l/max*100
    const sel=m===curMonth?'sel':''
    return `<div class="tcol ${sel}" onclick="curMonth='${m}';document.getElementById('month-sel').value='${m}';render()">
      <div class="tcol-stack">
        ${d.l?`<div class="tseg l" style="height:${lh}%" title="แพ้ ${d.l}"></div>`:''}
        ${d.w?`<div class="tseg w" style="height:${wh}%" title="ชนะ ${d.w}"></div>`:''}
        ${!d.w&&!d.l?`<div style="height:3px;background:var(--rule);border-radius:2px"></div>`:''}
      </div>
      <div class="tcol-lbl">${TH_MONTH[+mo-1]} ${((+y)+543)%100}</div>
    </div>`
  }).join('')
}

const SRC_ICON={'Old Customer (P1)':'⭐','Connection / Referral (P1)':'🤝','Web Lead Form (P2)':'🌐'}

function cardHTML(p){
  const r=resultOf(p),v=valueOf(p),w=wl(p)
  const tags=[p.ptype,p.btype,p.sales].filter(Boolean)
  return `<div class="card" draggable="true" data-id="${p.id}"
      ondragstart="onDragStart(event,'${p.id}')" ondragend="onDragEnd(event)">
    <button class="card-edit" onclick="event.stopPropagation();openEdit('${p.id}')" title="แก้ไข">✎</button>
    <div class="card-name">${p.name||'(ไม่มีชื่อ)'}</div>
    <div class="card-client">${p.client||'—'}</div>
    ${tags.length?`<div class="card-tags">${tags.map(t=>`<span class="ctag">${t}</span>`).join('')}</div>`:''}
    ${v?`<div class="card-val ${r}">฿${fmt(v)}</div>`:''}
    ${w.reason?`<div class="card-reason">"${w.reason}"</div>`:''}
  </div>`
}

function colHTML(key,title,color,arr){
  const sum=arr.reduce((s,p)=>s+valueOf(p),0)
  const body=arr.length?arr.map(cardHTML).join(''):`<div class="col-empty">ลากการ์ดมาที่นี่</div>`
  return `<div class="col">
    <div class="col-head"><span class="col-bar" style="background:${color}"></span><span class="col-title">${title}</span><span class="col-cnt">${arr.length}</span></div>
    ${sum?`<div class="col-sum">รวม ฿${fmt(sum)}</div>`:''}
    <div class="col-body" data-col="${key}" ondragover="onDragOver(event)" ondragleave="onDragLeave(event)" ondrop="onDrop(event,'${key}')">${body}</div>
  </div>`
}

function renderBoard(pend,wins,losses){
  document.getElementById('board').innerHTML=
    colHTML('','รอผล / Pipeline','#9A5800',pend)+
    colHTML('win','ชนะ (Win)','#1A6B44',wins)+
    colHTML('loss','แพ้ (Loss)','#D64F2A',losses)
}

// ── DRAG & DROP ───────────────────────────────
let dragId=null
function onDragStart(e,id){dragId=id;e.currentTarget.classList.add('dragging');e.dataTransfer.effectAllowed='move'}
function onDragEnd(e){e.currentTarget.classList.remove('dragging');document.querySelectorAll('.col-body').forEach(c=>c.classList.remove('drag-over'))}
function onDragOver(e){e.preventDefault();e.currentTarget.classList.add('drag-over')}
function onDragLeave(e){e.currentTarget.classList.remove('drag-over')}
async function onDrop(e,col){
  e.preventDefault();e.currentTarget.classList.remove('drag-over')
  if(!dragId)return
  const p=PROJECTS.find(x=>x.id==dragId);if(!p)return
  if(resultOf(p)===col){return}
  const data={result:col}
  if(col&&!wl(p).closed)data.closed=new Date().toISOString().split('T')[0]
  await persistWL(p,data)
  buildMonthOptions();render()
  toast(col==='win'?'บันทึกเป็น ชนะ ✓':col==='loss'?'บันทึกเป็น แพ้ ✓':'ย้ายกลับ Pipeline')
}

// ── EDIT MODAL ────────────────────────────────
function openEdit(id){
  const p=PROJECTS.find(x=>x.id==id);if(!p)return
  editId=id
  const w=wl(p)
  editResult=w.result||''
  document.getElementById('m-title').textContent=p.name||'บันทึกผล'
  document.getElementById('m-sub').textContent=(p.client||'—')+(p.sales?' · '+p.sales:'')
  document.getElementById('m-value').value=w.value||''
  document.getElementById('m-closed').value=w.closed||p.date||new Date().toISOString().split('T')[0]
  document.getElementById('m-reason').value=w.reason||''
  paintSeg()
  document.getElementById('modal').classList.add('show')
}
function pickResult(r){editResult=r;paintSeg()}
function paintSeg(){
  document.getElementById('seg-p').className='seg-btn'+(editResult===''?' on-p':'')
  document.getElementById('seg-w').className='seg-btn'+(editResult==='win'?' on-w':'')
  document.getElementById('seg-l').className='seg-btn'+(editResult==='loss'?' on-l':'')
}
function closeModal(){document.getElementById('modal').classList.remove('show');editId=null}
async function saveOutcome(){
  const p=PROJECTS.find(x=>x.id==editId);if(!p)return
  const data={
    result:editResult,
    value:document.getElementById('m-value').value||'',
    closed:document.getElementById('m-closed').value||'',
    reason:document.getElementById('m-reason').value.trim()
  }
  await persistWL(p,data)
  closeModal();buildMonthOptions();render();toast('บันทึกแล้ว ✓')
}

// ── EXCEL EXPORT ──────────────────────────────
function exportXlsx(){
  const ps=PROJECTS.filter(inView)
  if(!ps.length){toast('ไม่มีข้อมูลให้ส่งออก');return}
  const RES={'win':'ชนะ (Win)','loss':'แพ้ (Loss)','':'รอผล / Pipeline'}
  const rows=ps.map(p=>{
    const w=wl(p)
    return {
      'ชื่อโครงการ':p.name||'',
      'ลูกค้า':p.client||'',
      'ประเภทโครงการ':p.ptype||'',
      'ประเภทอาคาร':p.btype||'',
      'Sales':p.sales||'',
      'Lead Source':p.source||'',
      'เดือน':monthOf(p),
      'ผล':RES[resultOf(p)]||'',
      'มูลค่า (บาท)':valueOf(p)||'',
      'วันที่ปิดดีล':w.closed||'',
      'เหตุผล / หมายเหตุ':w.reason||''
    }
  })
  // summary sheet
  const wins=ps.filter(p=>resultOf(p)==='win'),losses=ps.filter(p=>resultOf(p)==='loss')
  const decided=wins.length+losses.length
  const summary=[
    {'สรุป':'ช่วงข้อมูล','ค่า':curMonth==='all'?'ทุกเดือน':curMonth},
    {'สรุป':'จำนวนชนะ (Win)','ค่า':wins.length},
    {'สรุป':'จำนวนแพ้ (Loss)','ค่า':losses.length},
    {'สรุป':'รอผล / Pipeline','ค่า':ps.length-decided},
    {'สรุป':'Win Rate (%)','ค่า':decided?Math.round(wins.length/decided*100):0},
    {'สรุป':'มูลค่าที่ชนะ (บาท)','ค่า':wins.reduce((s,p)=>s+valueOf(p),0)},
    {'สรุป':'มูลค่าที่แพ้ (บาท)','ค่า':losses.reduce((s,p)=>s+valueOf(p),0)}
  ]
  const wb=XLSX.utils.book_new()
  const ws1=XLSX.utils.json_to_sheet(rows)
  ws1['!cols']=[{wch:30},{wch:22},{wch:20},{wch:18},{wch:14},{wch:22},{wch:10},{wch:16},{wch:14},{wch:13},{wch:34}]
  XLSX.utils.book_append_sheet(wb,ws1,'รายโครงการ')
  const ws2=XLSX.utils.json_to_sheet(summary)
  ws2['!cols']=[{wch:24},{wch:18}]
  XLSX.utils.book_append_sheet(wb,ws2,'สรุป')
  const tag=curMonth==='all'?'ทั้งหมด':curMonth
  XLSX.writeFile(wb,`WinLoss_${tag}.xlsx`)
  toast('ส่งออก Excel แล้ว ✓')
}

let _tt;function toast(m){const el=document.getElementById('toast');el.textContent=m;el.classList.add('show');clearTimeout(_tt);_tt=setTimeout(()=>el.classList.remove('show'),2400)}

document.getElementById('modal').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal()})
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()})

// ── BOOT ──────────────────────────────────────
;(async()=>{
  PROJECTS=await loadProjects()
  buildMonthOptions()
  render()
})()
