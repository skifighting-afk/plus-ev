// 사용: node tools/insta-posts/render.mjs out [P01,P02]  (bg/ 폴더의 배경 사진 사용, 없으면 어두운 그라데이션)
import fs from "node:fs"; import path from "node:path"; import { pathToFileURL } from "node:url";
const dir = path.dirname(new URL(import.meta.url).pathname);
const out = path.resolve(process.argv[2] || "posts-out");
const only = (process.argv[3] || "").split(",").filter(Boolean);
const { POSTS, FOOT } = await import(pathToFileURL(path.join(dir, process.env.POSTS_FILE || "posts.mjs")).href);
fs.mkdirSync(out, { recursive: true });
const { chromium } = await import("playwright");
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
await p.goto(pathToFileURL(path.join(dir, "template.html")).href, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
let md = `# +EV 인스타 게시물 ${POSTS.length}개 · 캡션\n`;
for (const post of POSTS) {
  if (only.length && !only.includes(post.id)) continue;
  if (!post.single) fs.mkdirSync(path.join(out, post.id), { recursive: true });
  for (const [i, s] of post.s.entries()) {
    const key = s.bg || post.bg, f = path.join(dir, "bg", key + ".jpg");
    const bg = fs.existsSync(f) ? "data:image/jpeg;base64," + fs.readFileSync(f).toString("base64") : "";
    await p.evaluate(([post, s, i, bg]) => draw(post, s, i, bg), [post, s, i, bg]);
    await p.waitForTimeout(120);
    await p.locator("#c").screenshot({ path: post.single ? path.join(out, `${post.id}.jpg`) : path.join(out, post.id, `${i + 1}.jpg`), type: "jpeg", quality: 92 });
  }
  md += `\n## ${post.id} · ${post.pillar}\n\n${post.cap}${FOOT}\n`;
  console.log(post.id);
}
fs.writeFileSync(path.join(out, "captions.md"), md);
await b.close();
