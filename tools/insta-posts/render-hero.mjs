// 홈페이지 히어로 배경(hero.mp4 프레임 또는 hero-poster.jpg)으로 3240x2700 파노라마 → 1080x1350 6장 (피드 2줄)
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { pathToFileURL } from "node:url";
const dir = path.dirname(new URL(import.meta.url).pathname), out = path.resolve(process.argv[2] || "posts-out", "HERO");
fs.mkdirSync(out, { recursive: true });
const get = async (u, f) => { const r = await fetch(u); if (!r.ok) return false; fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); return true; };
let src = path.join(out, "_bg.jpg");
const mp4 = path.join(out, "_hero.mp4");
let usedVideo = false;
if (await get("https://plusev.co.kr/hero.mp4", mp4)) {
  const wh = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", mp4]).toString().trim();
  console.log("hero.mp4", wh);
  if (Number(wh.split(",")[0]) >= 1600) { execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", "1.5", "-i", mp4, "-frames:v", "1", "-q:v", "2", src]); usedVideo = true; }
}
if (!usedVideo) await get("https://plusev.co.kr/hero-poster.jpg", src);
fs.rmSync(mp4, { force: true });
console.log("배경:", usedVideo ? "영상 프레임" : "포스터", execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", src]).toString().trim());
const { chromium } = await import("playwright");
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 3240, height: 2700 } });
await p.goto(pathToFileURL(path.join(dir, "hero.html")).href, { waitUntil: "networkidle" });
await p.evaluate((d) => { document.getElementById("p").style.backgroundImage = `url(${d})`; return document.fonts.ready; }, "data:image/jpeg;base64," + fs.readFileSync(src).toString("base64"));
await p.waitForTimeout(500);
await p.screenshot({ path: path.join(out, "panorama.jpg"), type: "jpeg", quality: 92 });
await b.close();
// 파일 이름 = 올리는 순서 (그리드는 최신이 왼쪽 위 → 아래줄 오른쪽부터 올림)
const tiles = [["1_아래줄_오른쪽", 2, 1], ["2_아래줄_가운데", 1, 1], ["3_아래줄_왼쪽", 0, 1], ["4_윗줄_오른쪽", 2, 0], ["5_윗줄_가운데", 1, 0], ["6_윗줄_왼쪽", 0, 0]];
for (const f of fs.readdirSync(out)) if (/^\d_.*\.jpg$/.test(f)) fs.rmSync(path.join(out, f));
for (const [n, c, r] of tiles) execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(out, "panorama.jpg"), "-vf", `crop=1080:1350:${c * 1080}:${r * 1350}`, "-q:v", "2", path.join(out, `${n}.jpg`)]);
fs.rmSync(src);
console.log("HERO 완료");
