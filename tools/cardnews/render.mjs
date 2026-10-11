// +EV 카드뉴스 렌더 (메타 광고용 1080x1350 JPG)
// 사용: node tools/cardnews/render.mjs out [W1,W2]   (배경은 backgrounds.json 주소에서 받음)
import fs from "node:fs"; import path from "node:path";
const dir = path.dirname(new URL(import.meta.url).pathname);
const out = path.resolve(process.argv[2] || "cardnews-out");
const only = (process.argv[3] || "").split(",").filter(Boolean);
fs.mkdirSync(out, { recursive: true });
const bg = JSON.parse(fs.readFileSync(path.join(dir, "backgrounds.json"), "utf8"));
for (const [f, u] of Object.entries(bg)) {
  const dst = path.join(dir, f);
  if (fs.existsSync(dst)) continue;
  const r = await fetch(u); if (!r.ok) throw new Error(`배경 ${f} ${r.status}`);
  fs.writeFileSync(dst, Buffer.from(await r.arrayBuffer()));
}
const { chromium } = await import("playwright");
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
await p.goto("file://" + path.join(dir, "template.html"), { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(800);
const fam = await p.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family).join(","));
console.log("글꼴:", fam || "(없음)");
for (const el of await p.$$(".c")) {
  const id = await el.getAttribute("id");
  if (only.length && !only.some((w) => id.startsWith(w + "_"))) continue;
  await el.screenshot({ path: path.join(out, id + ".jpg"), type: "jpeg", quality: 93 });
  console.log(id);
}
await b.close();
