import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { initialHomeView } from './ui-policy.js';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const marker = '// ===== 홈 간편보기 (기존 홈 유지) =====';
assert.ok(source.includes(marker), 'home view switch is implemented');
const feature = source.slice(source.indexOf(marker));
function boot(saved = '', blocked = false) {
  const view = { innerHTML: '', querySelector: () => null, insertAdjacentHTML(_where, html) { this.innerHTML = html + this.innerHTML; } };
  const listeners = [];
  const store = new Map([['ev-home-view', saved]]);
  const c = {
    initialHomeView,
    compactChrome: () => {},
    bizDay: () => '2026-10-13',
    simpleLaborSummary: () => ({ready:false, projected:0, incomplete:0, note:'스케줄 예상'}),
    S: { mode: 'store', tab: 'home', sub: null, store: { id: 's', need_by_wd: [] }, company: {}, user: { id: 'u' }, members: [], reports: [], hist: [], open: null, tpl: [], ov: [] },
    TODAY: '2026-10-13', now: new Date(2026, 9, 13),
    lsGet: k => store.get(k) || '', lsSet: (k, v) => { if (!blocked) store.set(k, v); },
    document: { addEventListener: (_type, fn) => listeners.push(fn) },
    $: () => view, render: () => { view.innerHTML = '<div class="home">EXISTING HOME</div>'; },
    esc: s => String(s ?? '').replaceAll('<', '&lt;'), man: String,
    E: { shiftOn: () => null, WD: ['일','월','화','수','목','금','토'], wdOf: () => 2 },
    needOn: () => 4, monthSummary: () => ({ n: 0, est: false, left: 0 }),
    storeHead: () => '<h1>오늘 우리 매장</h1>', todoCard: () => '', dayTimeline: () => '',
    liveCard: () => '<div>LIVE</div>',
  };
  vm.createContext(c); vm.runInContext(feature, c);
  const click = value => listeners.forEach(fn => fn({ target: { closest: () => ({ dataset: { act: 'home-view', v: value } }) } }));
  return { c, view, store, click };
}
const a = boot(); a.c.render();
assert.ok(!a.view.innerHTML.includes('EXISTING HOME'), 'simple home is the default');
assert.ok(a.view.innerHTML.includes('간편보기'));
a.click('simple');
assert.ok(!a.view.innerHTML.includes('EXISTING HOME'));
assert.ok(a.view.innerHTML.includes('매출 입력 · 오픈'));
assert.ok(a.view.innerHTML.includes('직원 등록'));
assert.equal(a.store.get('ev-home-view'), 'simple');
a.click('detail'); assert.ok(a.view.innerHTML.includes('EXISTING HOME'));
a.click('invalid'); assert.ok(a.view.innerHTML.includes('EXISTING HOME'));
const b = boot('simple'); b.c.render(); assert.ok(!b.view.innerHTML.includes('EXISTING HOME'));
b.c.S.tab = 'sales'; b.c.render(); assert.equal(b.view.innerHTML, '<div class="home">EXISTING HOME</div>');
b.c.S.tab = 'home'; b.c.S.mode = 'staff'; b.c.render(); assert.equal(b.view.innerHTML, '<div class="home">EXISTING HOME</div>');
const d = boot('', true); d.click('simple'); assert.ok(d.view.innerHTML.includes('매출 입력 · 오픈'), 'in-memory switch works when storage is unavailable');
const e = boot('corrupt'); e.c.render(); assert.ok(!e.view.innerHTML.includes('EXISTING HOME'));
e.click('simple'); e.c.S.reports = [{ report_date: '2026-10-13', sales: 120000, entries: 3 }]; e.c.render();
assert.ok(e.view.innerHTML.includes('마감 완료')); assert.ok(e.view.innerHTML.includes('120000'));
console.log('home-view: default, switching, persistence, scope, empty and closed states passed');
