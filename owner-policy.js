export function visibleNotifications(rows=[],mode){return rows.filter(n=>mode==='hq'||(!/^\s*\[운영 점검\]|자동작업 실패/.test(n.body||'')&&!(mode==='store'&&(/최저임금/.test(n.body||'')||(/시드/.test(n.body||'')&&/급여|지급/.test(n.body||''))))));}
export function advertStatus(post,now=Date.now()){return post.status==='open'&&post.expires_at&&Date.parse(post.expires_at)<now?'expired':post.status||'draft';}
