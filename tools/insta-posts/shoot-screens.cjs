const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright'); const fs = require('fs'), path = require('path');
const ROOT = '/home/claude/plus-ev', OUT = process.argv[2];
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 3, locale: 'ko-KR' });
  const p = await ctx.newPage();
  await p.route('**/*', r => { const u = r.request().url(); if (u.startsWith('http://app.test/')) { let pn = new URL(u).pathname; if (pn.endsWith('/')) pn += 'index.html'; const f = path.join(ROOT, pn); const ct = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp' }[path.extname(f)] || 'text/plain'; return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: ct }) : r.fulfill({ status: 404, body: '' }); } if (u.includes('fonts.g')) return r.continue(); return r.fulfill({ status: 204, body: '' }); });
  await p.goto('http://app.test/demo/'); await p.waitForSelector('#auth-form', { timeout: 20000 }); await p.waitForTimeout(500);
  await p.evaluate(() => { const t = new Date().toISOString(); const it = (id, title, cat, price, area, qty) => ({ id, seller: 'x' + id, store_id: null, side: 'sell', status: '판매중', category: cat, condition: '상', title, price, qty, area, body: '', contact: '010', created_at: t, photos: [] });
    window.__DB.used_items.push(it('ui1', '홀덤 테이블 8인용 3대 (폐업 정리)', '홀덤 테이블', 1500000, '서울 강남구', 3), it('ui2', '딜러 의자 16개 일괄', '의자', 640000, '서울 마포구', 16), it('ui3', '세라믹 칩 세트 500개', '칩', 380000, '경기 성남시', 1), it('ui4', '매장용 CCTV 4채널 세트', 'CCTV', 250000, '서울 송파구', 1)); });
  await p.fill('[name=email]', 'owner@t.dev'); await p.fill('[name=pw]', '123456'); await p.click('#auth-form button'); await p.waitForSelector('#tabs:not([hidden])'); await p.waitForTimeout(1500);
  await p.addStyleTag({ content: `[data-act=fab],.fab,#fab{display:none!important}` });
  const tab = async (t) => { await p.click(`#tabs [data-tab=${t}]`); await p.waitForTimeout(900); };
  const btn = async (txt) => { for (const b of await p.$$('button')) { if ((await b.textContent()).trim() === txt && await b.isVisible()) { await b.click(); await p.waitForTimeout(900); return true } } console.log('버튼 없음', txt); return false };
  const scrollTo = async (txt) => { const ok = await p.evaluate((txt) => { const all = [...document.querySelectorAll('#view *')].filter(e => e.children.length < 4 && e.textContent.trim().startsWith(txt) && e.offsetParent); if (!all.length) return false; all[0].scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); return true }, txt); if (!ok) console.log('글자 없음', txt); await p.waitForTimeout(500); };
  const top = async () => { await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(400) };
  const hideFab = async () => { await p.evaluate(() => { for (const e of document.querySelectorAll('button')) { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); if (cs.position === 'fixed' && r.width < 80 && r.right > 300 && r.bottom > 500 && r.bottom < 720) e.style.display = 'none' } }) };
  const shot = async (n) => { await hideFab(); await p.screenshot({ path: `${OUT}/${n}.png` }); console.log('찍음', n) };
  // 홈
  await tab('home'); await top(); await shot('home_top');
  await scrollTo('이상 감지'); await shot('home_alert');
  await scrollTo('10월 계산서'); await shot('home_bill');
  await scrollTo('우리 매장 경고등'); await shot('home_warn');
  // 구인
  await tab('jobs'); await top(); await shot('jobs_form');
  await scrollTo('지금 바로 가능한 딜러'); await shot('jobs_dealers');
  await scrollTo('우리 매장 공고'); await shot('jobs_posts');
  // 직원
  await tab('staff'); await top(); await shot('staff_top');
  await btn('급여 대장'); await top(); await shot('payroll_top');
  await scrollTo('리버'); await shot('payroll_list');
  // 스케줄
  await tab('sched'); await top(); await shot('sched_top');
  await scrollTo('일'); 
  await btn('출퇴근 코드'); await top(); await scrollTo('체크한 사람'); await shot('qr');
  await btn('근무표'); await btn('월간'); await scrollTo('2026년 10월'); await shot('sched_month');
  // 매출
  await tab('sales'); await top(); await shot('sales_top');
  await scrollTo('10월 매출'); await shot('sales_cal');
  await scrollTo('요일별 평균 매출'); await shot('sales_dow');
  await btn('재고·발주'); await top(); await shot('stock');
  // 장터
  await p.click('#tabs [data-v=used]'); await p.waitForTimeout(1000); await top(); await shot('market');
  await btn('점포 양도양수'); await top(); await shot('transfer');
  // 매장 선택
  await tab('home'); await top();
  await b.close();
})();
