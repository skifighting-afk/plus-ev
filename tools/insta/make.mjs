// +EV 인스타 릴스 자동 제작 (GitHub Actions에서 실행)
// 흐름: insta-reels 큐 조회 → Higgsfield Seedance 실사 8초 → 자막 2줄 → 앱·엔딩 장면(render.mjs) → 나레이션(MeloTTS)
//      → 합치기(15.6초) → media/<slug>-<시각>.mp4 + media/manifest.json 기록. 게시는 Supabase insta-bot이 기존 시간대로 한다.
// 사용: node tools/insta/make.mjs --media media [--slug o06] [--days 3] [--max 2] [--dry]
//   HF_API_KEY (또는 HF_API_KEY_ID + HF_API_KEY_SECRET) 가 없거나 --dry 이면 실사 대신 회색 자리 영상으로 리허설만 한다(매니페스트에 올리지 않음).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i < 0 ? d : (process.argv[i + 1]?.startsWith("--") || process.argv[i + 1] == null ? true : process.argv[i + 1]); };
const MEDIA = path.resolve(arg("media", "media"));
const ONLY = arg("slug", "");
const DAYS = Number(arg("days", 3));
const MAX = Number(arg("max", 2));
// 키 한 줄(HF_API_KEY, 보통 "ID:Secret" 모양) 또는 ID·Secret 두 개 중 있는 쪽을 쓴다
const KEY = (process.env.HF_API_KEY || "").trim() || (process.env.HF_API_KEY_ID && process.env.HF_API_KEY_SECRET ? `${process.env.HF_API_KEY_ID}:${process.env.HF_API_KEY_SECRET}` : "");
const DRY = arg("dry", false) === true || !KEY;
const FN = "https://hkcmsjwuwopxritafreg.supabase.co/functions/v1";
const RAW = "https://raw.githubusercontent.com/skifighting-afk/plus-ev/insta-media/";
const BGM_URL = "https://d2ol7oe51mr4n9.cloudfront.net/user_3JmZNKTZQ2jvOCOpKVIQpiy6WR9/f10a007a-7e01-48d6-8353-c8b623f2ae8e.mp3";
const LIVE = 8, FPS = 30, W = 1080, H = 1920;
const ff = (a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a], { stdio: "inherit" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

async function getJSON(url, opt = {}) {
  const r = await fetch(url, opt);
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`${r.status} ${url.split("?")[0]} ${t.slice(0, 300)}`);
  return j;
}
async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status} ${url}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

// 1) 실사 8초 (Higgsfield Seedance 2.5, 소리 없음)
async function seedance(p, dir) {
  const out = path.join(dir, "live_raw.mp4");
  if (DRY) {
    ff(["-f", "lavfi", "-i", `color=c=0x2a2f36:s=${W}x${H}:d=${LIVE}:r=${FPS}`, "-vf",
      `drawbox=x=0:y=0:w=iw:h=ih:color=0x8FE3C4@0.06:t=fill`, "-pix_fmt", "yuv420p", out]);
    return { out, job: "dry-run" };
  }
  const s = p.script;
  const body = { prompt: s.seedance_prompt, duration: LIVE, resolution: "1080p", aspect_ratio: "9:16", generate_audio: false };
  const idem = p.slug + "-" + crypto.createHash("sha1").update(s.seedance_prompt).digest("hex").slice(0, 12);
  const sub = await getJSON("https://api.higgsfield.ai/bytedance/seedance-2.5/text-to-video", {
    method: "POST", body: JSON.stringify(body),
    headers: { Authorization: `Key ${KEY}`, "Content-Type": "application/json", "Idempotency-Key": idem },
  });
  log(p.slug, "seedance 요청", sub.request_id, sub.status);
  const statusUrl = sub.status_url || `https://api.higgsfield.ai/requests/${sub.request_id}/status`;
  for (let i = 0; i < 120; i++) {
    await sleep(10000);
    const st = await getJSON(statusUrl, { headers: { Authorization: `Key ${KEY}` } });
    if (st.status === "completed") {
      const url = st.video?.url;
      if (!url) throw new Error("completed but no video.url");
      await download(url, out);
      log(p.slug, "seedance 완료");
      return { out, job: sub.request_id };
    }
    if (["failed", "nsfw", "canceled"].includes(st.status)) throw new Error("seedance " + st.status + " " + JSON.stringify(st).slice(0, 200));
    if (i % 6 === 5) log(p.slug, "seedance 대기", st.status);
  }
  throw new Error("seedance 20분 안에 안 끝남");
}

// 2) 자막 PNG (하단 그라데이션, x=84 y=1180, Noto Sans KR 92px, [강조]=#C8F43A, | = 줄바꿈)
async function captionPngs(browser, caps, dir) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const files = [];
  for (const [i, c] of caps.entries()) {
    const lines = c.split("|").map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\[(.+?)\]/g, '<b>$1</b>'));
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;width:${W}px;height:${H}px;background:transparent;overflow:hidden}
      .g{position:absolute;left:0;right:0;bottom:0;height:980px;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.55) 45%,rgba(0,0,0,.78))}
      .t{position:absolute;left:84px;right:84px;top:1180px;font-family:'Noto Sans CJK KR','Noto Sans KR',sans-serif;font-size:92px;font-weight:900;line-height:1.22;letter-spacing:-3px;color:#fff;text-shadow:0 4px 24px rgba(0,0,0,.6);word-break:keep-all}
      b{color:#C8F43A;font-weight:900}
    </style></head><body><div class="g"></div><div class="t">${lines.join("<br>")}</div></body></html>`);
    await page.evaluate(() => document.fonts.ready);
    const f = path.join(dir, `cap${i}.png`);
    await page.screenshot({ path: f, omitBackground: true });
    files.push(f);
  }
  await page.close();
  return files;
}

// 3) 앱·엔딩 장면: Supabase에 저장된 확정 렌더러(template.html + render.mjs) 그대로 사용
async function renderTail(p, dir) {
  const scenes = p.script.scenes || [];
  if (!scenes.length) return null;
  const rd = path.join(dir, "tail");
  fs.mkdirSync(rd, { recursive: true });
  for (const a of ["template.html", "render.mjs"]) {
    if (process.env.ASSET_DIR) { fs.copyFileSync(path.join(process.env.ASSET_DIR, a), path.join(rd, a)); continue; }
    const r = await fetch(`${FN}/insta-bot?asset=${a}`);
    if (!r.ok) throw new Error("renderer asset " + a + " " + r.status);
    fs.writeFileSync(path.join(rd, a), await r.text());
  }
  const sc = JSON.parse(JSON.stringify(scenes));
  if (p.audience === "딜러") sc.filter((s) => s.type === "end" && !s.sub).forEach((s) => (s.sub = "딜러 지원 무료 · plusevapp.kr"));
  fs.writeFileSync(path.join(rd, "video.json"), JSON.stringify({ bgm: false, scenes: sc }));
  execFileSync("node", ["render.mjs", "video.json", "tail.mp4"], { cwd: rd, stdio: "inherit", env: { ...process.env } });
  return { mp4: path.join(rd, "tail.mp4"), silent: path.join(rd, "v.mp4"), sfx: path.join(rd, "sfx"), scenes: sc };
}

// 4) 나레이션 (MeloTTS 한국어, 속도 1.0 · 빨리 감기 없음)
function narration(lines, dir) {
  const py = process.env.REEL_PYTHON;
  if (!py || !lines?.length) return [];
  const lj = path.join(dir, "lines.json");
  fs.writeFileSync(lj, JSON.stringify(lines));
  try {
    execFileSync(py, [new URL("./tts.py", import.meta.url).pathname, lj, dir], { stdio: "inherit", timeout: 900000, env: { ...process.env, REEL_TTS_SPEED: "1.0" } });
  } catch (e) { log("나레이션 실패 → 배경음만", String(e).slice(0, 120)); return []; }
  return lines.map((_, i) => path.join(dir, `voice-${i}.wav`)).filter((f) => fs.existsSync(f));
}
const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());

async function makeOne(browser, p) {
  const dir = path.resolve("work", p.slug);
  fs.mkdirSync(dir, { recursive: true });
  const s = p.script;
  const live = await seedance(p, dir);
  // 실사 정규화 + 자막 2줄 (0~3.8초 / 4.0~8초)
  const caps = await captionPngs(browser, (s.captions || []).slice(0, 2), dir);
  const liveOut = path.join(dir, "live.mp4");
  const inputs = ["-i", live.out, ...caps.flatMap((c) => ["-loop", "1", "-t", String(LIVE), "-i", c])];
  const win = [[0, 3.8], [4.0, LIVE]];
  let fl = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},trim=0:${LIVE},setpts=PTS-STARTPTS,format=yuv420p[v0]`;
  caps.forEach((_, i) => { fl += `;[v${i}][${i + 1}:v]overlay=0:0:enable='between(t,${win[i][0]},${win[i][1]})'[v${i + 1}]`; });
  ff([...inputs, "-filter_complex", fl, "-map", `[v${caps.length}]`, "-an", "-t", String(LIVE), "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", liveOut]);

  const tail = await renderTail(p, dir);
  const vids = [liveOut, ...(tail ? [tail.silent] : [])];
  const tailDur = tail ? tail.scenes.reduce((a, x) => a + x.dur, 0) : 0;
  const total = LIVE + tailDur;
  const joined = path.join(dir, "joined.mp4");
  ff([...vids.flatMap((v) => ["-i", v]), "-filter_complex",
    vids.map((_, i) => `[${i}:v]fps=${FPS},scale=${W}:${H},setsar=1,format=yuv420p[c${i}]`).join(";") + ";" + vids.map((_, i) => `[c${i}]`).join("") + `concat=n=${vids.length}:v=1:a=0[v]`,
    "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", joined]);

  // 소리: 나레이션 1.6 · BGM 0.28(끝 1.2초 페이드) · 효과음(앱·엔딩) · alimiter 0.95
  const voices = narration(s.narration_lines, dir);
  const delays = s.narration_delays_ms || [300, 4300, 8600, 12650];
  voices.forEach((v, i) => { const d = dur(v), slot = ((delays[i + 1] ?? total * 1000) - delays[i]) / 1000; if (d > slot) log(p.slug, `나레이션 ${i + 1} 길이 ${d.toFixed(2)}s > 칸 ${slot.toFixed(2)}s`); });
  const bgm = path.join(dir, "bgm.mp3");
  let haveBgm = true; try { await download(BGM_URL, bgm); } catch { haveBgm = false; }
  const ain = [], af = [], mix = [];
  let n = 1; // 0번 입력은 영상
  if (haveBgm) { ain.push("-stream_loop", "-1", "-i", bgm); af.push(`[${n}]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.28,atrim=0:${total},afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2[a${n}]`); mix.push(`[a${n}]`); n++; }
  else { ain.push("-f", "lavfi", "-i", `anullsrc=r=48000:cl=stereo:d=${total}`); af.push(`[${n}]atrim=0:${total}[a${n}]`); mix.push(`[a${n}]`); n++; }
  voices.forEach((v, i) => { const ms = delays[i] ?? 0; ain.push("-i", v); af.push(`[${n}]aformat=sample_rates=48000:channel_layouts=stereo,volume=1.6,adelay=${ms}|${ms}[a${n}]`); mix.push(`[a${n}]`); n++; });
  if (tail) {
    const ev = []; let at = LIVE;
    ev.push(["whoosh", at - 0.12]);
    for (const sc of tail.scenes) { if (sc.type === "app") { ev.push(["click", at + sc.dur * 0.5]); if (sc.toast) ev.push(["notif", at + sc.dur * 0.5 + 0.35]); } if (sc.type === "end") ev.push(["ding", at + 0.1]); at += sc.dur; }
    for (const [k, t] of ev) { const f = path.join(tail.sfx, k + ".wav"); if (!fs.existsSync(f)) continue; const ms = Math.round(t * 1000); ain.push("-i", f); af.push(`[${n}]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.7,adelay=${ms}|${ms}[a${n}]`); mix.push(`[a${n}]`); n++; }
  }
  af.push(`${mix.join("")}amix=inputs=${mix.length}:normalize=0:duration=first,alimiter=limit=0.95[a]`);
  const final = path.join(dir, "final.mp4");
  ff(["-i", joined, ...ain, "-filter_complex", af.join(";"), "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", String(total), "-movflags", "+faststart", final]);
  log(p.slug, "완성", dur(final).toFixed(1) + "s", voices.length ? `나레이션 ${voices.length}줄` : "나레이션 없음");
  return { final, job: live.job, seconds: Number(dur(final).toFixed(1)) };
}

async function main() {
  fs.mkdirSync(MEDIA, { recursive: true });
  const mf = path.join(MEDIA, "manifest.json");
  const manifest = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, "utf8")) : {};
  const { queue } = process.env.QUEUE_FILE ? JSON.parse(fs.readFileSync(process.env.QUEUE_FILE, "utf8")) : await getJSON(`${FN}/insta-reels?queue=1&days=${DAYS}`);
  let todo = queue.filter((p) => !ONLY || p.slug === ONLY).filter((p) => !manifest[p.slug]?.video_url);
  log(`큐 ${queue.length}건, 만들 것 ${todo.length}건`, DRY ? "(리허설: Higgsfield 키 없음 또는 --dry)" : "");
  todo = todo.slice(0, MAX);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  let fails = 0;
  for (const p of todo) {
    try {
      const r = await makeOne(browser, p);
      const name = `${p.slug}-${Date.now().toString(36)}.mp4`;
      if (DRY) { fs.copyFileSync(r.final, path.resolve("work", `DRY-${name}`)); log(p.slug, "리허설 완료 (매니페스트에 안 올림)"); continue; }
      fs.copyFileSync(r.final, path.join(MEDIA, name));
      manifest[p.slug] = { video_url: RAW + name, file: name, video_job: r.job, seconds: r.seconds, date: p.scheduled_for, at: new Date().toISOString() };
    } catch (e) {
      fails++;
      log(p.slug, "실패", String(e).slice(0, 300));
      if (!DRY) manifest[p.slug] = { error: String(e).slice(0, 400), date: p.scheduled_for, at: new Date().toISOString() };
    }
  }
  await browser.close();
  // 게시가 끝난 지 이틀 지난 영상은 정리 (브랜치를 가볍게 유지)
  const keepFrom = new Date(Date.now() + 9 * 3600e3 - 2 * 864e5).toISOString().slice(0, 10);
  for (const [k, v] of Object.entries(manifest)) if (v.date && v.date < keepFrom) delete manifest[k];
  const keep = new Set(Object.values(manifest).map((v) => v.file).filter(Boolean));
  for (const f of fs.readdirSync(MEDIA)) if (f.endsWith(".mp4") && !keep.has(f)) fs.rmSync(path.join(MEDIA, f));
  fs.writeFileSync(mf, JSON.stringify(manifest, null, 2));
  log("끝", kstToday(), `실패 ${fails}건`);
}
main().catch((e) => { console.error(e); process.exit(1); });
