const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function formatHours(hours){const minutes=Math.max(0,Math.round((Number(hours)||0)*60));return `${Math.floor(minutes/60)}시간${minutes%60?' '+minutes%60+'분':''}`;}
export function ratioParts({cost=0,sales=0,goal=0,dayCost=0,daySales=0}){const ratio=(n,d)=>d>0?n/d*100:null;return {actual:ratio(cost,sales),target:ratio(cost,goal),daily:ratio(dayCost,daySales)};}
export function foldSection(id,title,html,initial=false,prefs={}){return html?`<details class="workflow-fold card" data-fold="${esc(id)}" ${(prefs[id]??initial)?'open':''}><summary>${esc(title)}</summary><div class="workflow-fold-body">${html}</div></details>`:'';}
export function enhanceFoldableCards(root,prefs={},save=()=>{}){
 if(!root)return;
 for(const panel of root.querySelectorAll('.hmain > .card,.hside > .card,.simple-home > .card,.sched-folds > .card')){
  if(panel.tagName==='DETAILS'||panel.classList.contains('workflow-fold')||panel.classList.contains('simple-home-month'))continue;
  const heading=panel.querySelector('h2,h3'),label=panel.id==='labor-total'?'인건비율 · 누적 인건비':heading?.textContent?.trim();if(!label)continue;
  const key=panel.id||label.replace(/\s+/g,' ').slice(0,80),doc=panel.ownerDocument,details=doc.createElement('details'),summary=doc.createElement('summary');details.className='card workflow-fold';details.dataset.fold=key;details.open=prefs[key]??true;summary.textContent=label;panel.before(details);details.append(summary,panel);panel.classList.add('workflow-inner');details.addEventListener('toggle',()=>save(key,details.open));
 }
}
