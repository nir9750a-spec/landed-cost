/* eslint-disable */
// Proves the multi-sheet Excel parse: read ALL sheets, extract products from
// the invoice sheet (price) and the packing sheet (weight/CBM), merge by name.
const XLSX = require('xlsx');
const FILE = process.argv[2] || 'C:/Users/Admin/Desktop/4elements/חתום משלוח חודש 7/YF-PI2025061701报关资料.xlsx';

const KW = {
  name: ['שם','מוצר','תיאור','description','item','product','goods','commodity','style','model','货名','品名','商品'],
  item_no: ['מקט','מק"ט','קוד','item no','item_no','sku','model no','part no','art no','ref','货号','型号','编号'],
  qty: ['כמות','יחידות','qty','quantity','pcs','pieces','units','数量'],
  fob_price: ['מחיר','unit price','fob price','price','rate','usd','unit cost','单价','价格'],
  amount: ['amount','total price','total amount','fob amount','total','金额','总价'],
  cbm: ['cbm','נפח','volume','m3','cubic','measurement','体积','立方'],
  weight: ['weight','משקל','gross weight','g.w.','gw','毛重','重量','kg'],
};
function toNumber(raw){ if(raw==null||raw==='')return 0; if(typeof raw==='number')return isFinite(raw)?raw:0; let s=String(raw).replace(/[^0-9.,-]/g,'').replace(/,/g,''); const n=Number(s); return isFinite(n)?n:0; }
function hMatch(v,kws){ v=String(v||'').trim().toLowerCase().replace(/[():.,\-_/\\]/g,' ').replace(/\s+/g,' ').trim(); if(!v)return false; return kws.some(k=>v===k||v.includes(k)||k.includes(v)); }
function detectHeader(rows){ for(let i=0;i<Math.min(rows.length,40);i++){ const r=rows[i]||[]; let nm=-1,q=-1,pr=-1,am=-1,wt=-1,cb=-1; for(let j=0;j<r.length;j++){ if(nm<0&&hMatch(r[j],KW.name))nm=j; if(q<0&&hMatch(r[j],KW.qty))q=j; if(pr<0&&hMatch(r[j],KW.fob_price))pr=j; if(am<0&&hMatch(r[j],KW.amount))am=j; if(wt<0&&hMatch(r[j],KW.weight))wt=j; if(cb<0&&hMatch(r[j],KW.cbm))cb=j; } if(nm>=0&&q>=0&&(pr>=0||am>=0||wt>=0||cb>=0))return i; } return -1; }
function mapCols(hr){ const m={}; for(let j=0;j<hr.length;j++){ for(const [f,kws] of Object.entries(KW)){ if(m[f]==null&&hMatch(hr[j],kws))m[f]=j; } } return m; }
function isCustoms(ws){ const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:''}); const top=rows.slice(0,5).flat().map(String).join(' '); return /报关单|海关|customs declaration/i.test(top); }
function sheetProducts(ws){ const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',blankrows:false}); const hi=detectHeader(rows); if(hi<0)return []; const cols=mapCols(rows[hi]); const out=[]; for(let i=hi+1;i<rows.length;i++){ const r=rows[i]; if(!Array.isArray(r)||r.every(c=>c===''||c==null))continue; const get=k=>cols[k]!=null?r[cols[k]]:''; const nm=String(get('name')||'').trim(); if(!nm||/^[\W_]+$/.test(nm)||/^\d+\s*[.、]/.test(nm)||nm.length>60||/total|合计|小计|共计|总计/i.test(nm))continue; const name=nm; const qty=toNumber(get('qty')); if(!qty||qty>100000)continue; const up=toNumber(get('fob_price')); const am=toNumber(get('amount')); const fob=up>0?up:(am>0?am/qty:0); const cbm=toNumber(get('cbm')); const wt=toNumber(get('weight')); out.push({ name:String(name).trim(), item_no:String(get('item_no')||'').trim(), qty, fob_price:fob, cbm:cbm>0&&cbm>qty*5?cbm/qty:cbm, gross_weight_kg:wt>0&&wt>qty*100?wt/qty:wt }); } return out; }
function norm(s){ return String(s||'').trim().toLowerCase().replace(/\s+/g,' '); }
function merge(list,p){ const nm=norm(p.name); let ex=list.find(x=>norm(x.name)===nm); if(!ex){ list.push({...p}); return; } for(const f of ['item_no']) if(!ex[f]&&p[f])ex[f]=p[f]; for(const f of ['qty','fob_price','cbm','gross_weight_kg']) if((ex[f]==null||ex[f]===0)&&p[f])ex[f]=p[f]; }

const wb = XLSX.readFile(FILE);
const merged = [];
for (const sn of wb.SheetNames) {
  if (isCustoms(wb.Sheets[sn])) { console.log(`(skip customs sheet: ${sn})`); continue; }
  const sp = sheetProducts(wb.Sheets[sn]);
  console.log(`sheet ${sn}: ${sp.length} product rows`);
  for (const p of sp) merge(merged, p);
}
console.log(`\nMERGED ${merged.length} products:`);
console.log('name                          | qty | fob$  | cbm   | gross kg');
for (const p of merged) {
  console.log(`${p.name.slice(0,29).padEnd(29)} | ${String(p.qty).padStart(3)} | ${String(p.fob_price.toFixed(2)).padStart(5)} | ${String(p.cbm).padStart(5)} | ${String(p.gross_weight_kg).padStart(7)}`);
}
