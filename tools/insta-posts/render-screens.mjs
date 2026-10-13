// 단일 게시물 21개 = 후킹 문구(singles.mjs) + 실제 앱 데모 화면(screens/*.png, shoot-screens.cjs 로 촬영)
// 사용: node tools/insta-posts/render-screens.mjs out
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url";
const dir = path.dirname(new URL(import.meta.url).pathname), out = path.resolve(process.argv[2] || "screens-out");
const { POSTS } = await import(pathToFileURL(path.join(dir, "singles.mjs")).href);
const Y = { jobs_form: 90, payroll_top: 300, staff_top: 190, sched_top: 100, transfer: 110, market: 230, sales_top: 150 };
const MAP = {
  S01: ["jobs_form", "결근 연락 오면 긴급 구인 한 번"], S02: ["jobs_posts", "올린 공고는 근처 딜러 폰으로 바로"],
  S03: ["sched_month", "사람 모자란 날, 달력에서 미리 보여요"], S04: ["payroll_top", "이번 달 실지급액까지 자동 계산"],
  S05: ["payroll_list", "직원별 근무시간 · 실지급액 한눈에"], S06: ["staff_top", "급여 정보 빠진 직원까지 알려줘요"],
  S07: ["qr", "30초마다 바뀌는 출퇴근 코드"], S08: ["sched_top", "법정 휴게 · 야간 연속까지 자동 체크"],
  S09: ["home_bill", "이번 달 남는 돈, 매일 마감하면 바로"], S10: ["stock", "재고 · 발주를 매출 탭에서 바로"],
  S11: ["transfer", "점포 양도양수, 매출 데이터와 함께"], S12: ["home_warn", "지난달과 비교한 매출 · 비용 기록"],
  S13: ["market", "홀덤펍 사장님끼리 집기 직거래"], S14: ["market", "테이블 · 의자 · 칩 · CCTV까지"],
  S15: ["home_top", "매장 선택 한 번으로 전환"], S16: ["sales_dow", "요일별 매출까지 아침에 확인"],
  S17: ["jobs_form", "일당 · 시간 · 택시비까지 공고에 그대로"], S18: ["payroll_top", "급여는 앱이, 사장님은 손님을"],
  S19: ["jobs_posts", "구인 · 근무표 · 급여 · 매출 · 장터"], S20: ["sales_top", "오픈 · 마감을 앱에서"],
  S21: ["home_bill", "이기는 펍의 선택"],
};
fs.mkdirSync(out, { recursive: true });
const { chromium } = await import("playwright");
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
await p.goto(pathToFileURL(path.join(dir, "screen.html")).href, { waitUntil: "networkidle" });
const b64 = (f, t) => fs.existsSync(f) ? `data:image/${t};base64,` + fs.readFileSync(f).toString("base64") : "";
for (const post of POSTS) {
  const [shot, sub] = MAP[post.id];
  const s = post.s[0].t === "cta" ? { ...post.s[0] } : post.s[0];
  await p.evaluate(([post, bg, sh]) => draw(post, bg, sh), [{ ...post, s: [s], sub, rot: 0, yoff: Y[shot] || 0 }, b64(path.join(dir, "bg", (post.s[0].bg || post.bg) + ".jpg"), "jpeg"), b64(path.join(dir, "screens", shot + ".png"), "png")]);
  await p.waitForTimeout(150);
  await p.locator("#c").screenshot({ path: path.join(out, `${post.id}.jpg`), type: "jpeg", quality: 92 });
  console.log(post.id, shot);
}
await b.close();
