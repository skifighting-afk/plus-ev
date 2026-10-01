// 가이드 영상 녹화기 — Playwright로 데모 앱을 조작하며 자막·커서·하이라이트를 입혀 webm으로 찍고, 단계별 시작 시각을 timeline.out.json에 남긴다.
// node record.js <timeline.json> <outDir>   (timeline.json: [{cap, dur(초), act?, sel?, val?, hl?}])
const { chromium } = require('playwright'); const fs = require('fs');
const [tlPath, OUT = 'out'] = process.argv.slice(2), TL = JSON.parse(fs.readFileSync(tlPath, 'utf8'));
const BASE = process.env.BASE || 'https://plusevapp.kr/demo/', W = 1280, H = 720;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: W, height: H }, locale: 'ko-KR' }); fs.mkdirSync(OUT, { recursive: true });
  const p = await ctx.newPage(); const t0 = Date.now();
  if (process.env.LOCAL_ROOT) { const path = require('path'); await p.route('**/*', r => { const u = r.request().url(); if (u.startsWith('http://app.test/')) { let pn = new URL(u).pathname; if (pn.endsWith('/')) pn += 'index.html'; const f = path.join(process.env.LOCAL_ROOT, pn); const ct = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json' }[path.extname(f)] || 'text/plain'; return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: ct }) : r.fulfill({ status: 404, body: '' }); } return r.fulfill({ status: 204, body: '' }); }); } const at = () => (Date.now() - t0) / 1000;
  await p.goto(BASE); await p.waitForSelector('#auth-form', { timeout: 20000 }); await p.waitForTimeout(600);
  await p.fill('[name=email]', 'owner@t.dev'); await p.fill('[name=pw]', '123456'); await p.click('#auth-form button'); await p.waitForSelector('#tabs:not([hidden])'); await p.waitForTimeout(500);
  await p.addStyleTag({ content: `#ov-cap{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:82%;background:rgba(8,12,22,.92);color:#fff;font:600 21px/1.45 'Noto Sans KR',sans-serif;padding:12px 22px;border-radius:14px;border:1px solid rgba(255,255,255,.14);z-index:99999;opacity:0;transition:opacity .25s}#ov-cap.on{opacity:1}
    #ov-cur{position:fixed;width:26px;height:26px;border-radius:50%;background:rgba(16,185,129,.35);border:2px solid #34D399;z-index:99998;pointer-events:none;transform:translate(-50%,-50%);transition:left .55s cubic-bezier(.2,.8,.2,1),top .55s cubic-bezier(.2,.8,.2,1);left:-50px;top:-50px}#ov-cur.dn{background:rgba(16,185,129,.8)}
    #ov-ring{position:fixed;border:3px solid #F59E0B;border-radius:12px;box-shadow:0 0 0 4px rgba(245,158,11,.25);z-index:99997;pointer-events:none;opacity:0;transition:opacity .2s}#ov-ring.on{opacity:1}
    #ov-title{position:fixed;inset:0;background:#0B0F19;display:grid;place-items:center;z-index:100000;color:#fff;text-align:center;font-family:'Noto Sans KR',sans-serif}#ov-title b{font-size:52px;display:block}#ov-title small{font-size:22px;color:#8C9AB3;display:block;margin-top:10px}` });
  await p.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<div id="ov-cap"></div><div id="ov-cur"></div><div id="ov-ring"></div>'); });
  // 프레임 캡처 루프 (내 시계 기준 → 오디오와 정확히 맞음)
  const frames = []; let running = true; let n = 0;
  const grab = (async () => { while (running) { const t = at(); try { const buf = await p.screenshot({ type: 'jpeg', quality: 82 }); const f = `${OUT}/f${String(n++).padStart(5, '0')}.jpg`; fs.writeFileSync(f, buf); frames.push([t, f]); } catch (e) { } } })();
  const out = [];
  for (const s of TL) {
    const start = at(); out.push({ i: out.length, start, cap: s.cap });
    if (s.title) { await p.evaluate(t => { document.body.insertAdjacentHTML('beforeend', `<div id="ov-title"><div><b>${t[0]}</b><small>${t[1]}</small></div></div>`); }, s.title); await sleep(s.dur * 1000 + 500); await p.evaluate(() => document.getElementById('ov-title').remove()); continue; }
    await p.evaluate(c => { const el = document.getElementById('ov-cap'); el.textContent = c; el.classList.add('on'); }, s.cap);
    const target = s.sel || s.hl;
    if (target) {
      const el = await p.$(target); if (!el) { console.error('없음:', target); } else {
        await el.scrollIntoViewIfNeeded(); await sleep(450);
        const place = async (pad) => { const r = await el.boundingBox(); await p.evaluate(({ r, pad }) => { const g = document.getElementById('ov-ring'); Object.assign(g.style, { left: r.x - pad + 'px', top: r.y - pad + 'px', width: r.width + pad * 2 - 6 + 'px', height: r.height + pad * 2 - 6 + 'px' }); g.classList.add('on'); const c = document.getElementById('ov-cur'); c.style.left = r.x + r.width / 2 + 'px'; c.style.top = r.y + r.height / 2 + 'px'; }, { r, pad }); return r; };
        let r = await place(s.hl && !s.sel ? 8 : 5); await sleep(900);
        if (s.sel) {
          if (s.act === 'type') { await el.click(); await sleep(250); r = await place(5); await el.fill(''); await el.type(String(s.val), { delay: 70 }); }
          else { await p.evaluate(() => document.getElementById('ov-cur').classList.add('dn')); await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await sleep(120); await p.evaluate(() => { document.getElementById('ov-cur').classList.remove('dn'); document.getElementById('ov-ring').classList.remove('on'); }); }
        }
        if (s.sel2) { const e2 = await p.$(s.sel2); if (e2) { await e2.click(); await sleep(200); const r2 = await e2.boundingBox(); await p.evaluate(r => { const g = document.getElementById('ov-ring'); Object.assign(g.style, { left: r.x - 5 + 'px', top: r.y - 5 + 'px', width: r.width + 4 + 'px', height: r.height + 4 + 'px' }); const c = document.getElementById('ov-cur'); c.style.left = r.x + r.width / 2 + 'px'; c.style.top = r.y + r.height / 2 + 'px'; }, r2); await e2.fill(''); await e2.type(String(s.val2), { delay: 70 }); } }
      }
    }
    const spent = at() - start, remain = Math.max(1.2, s.dur + 0.7 - spent); await sleep(remain * 1000);
    await p.evaluate(() => { document.getElementById('ov-ring').classList.remove('on'); });
  }
  await p.evaluate(() => document.getElementById('ov-cap').classList.remove('on')); await sleep(1200);
  running = false; await grab; const end = at(); await b.close();
  // ffmpeg concat 목록: 각 프레임을 다음 프레임까지 보여줌
  let list = ''; for (let i = 0; i < frames.length; i++) { const d = (i + 1 < frames.length ? frames[i + 1][0] : end) - frames[i][0]; list += `file '${frames[i][1].split('/').pop()}'\nduration ${Math.max(0.01, d).toFixed(3)}\n`; } list += `file '${frames[frames.length - 1][1].split('/').pop()}'\n`;
  fs.writeFileSync(OUT + '/frames.txt', list);
  fs.writeFileSync(OUT + '/timeline.out.json', JSON.stringify({ end, origin: frames[0][0], fps: (frames.length / end).toFixed(1), steps: out }, null, 1)); console.log(JSON.stringify({ end, frames: frames.length, steps: out.map(x => [x.i, +x.start.toFixed(2)]) }));
})();
