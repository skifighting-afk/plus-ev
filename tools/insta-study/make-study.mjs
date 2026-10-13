// +EV 홀덤 스터디 릴스 렌더러
// 사용: node tools/insta-study/make-study.mjs out [s01,s02]   (REEL_PYTHON 있으면 MeloTTS 나레이션)
// 장면마다 등장 애니메이션 0.9초만 프레임으로 찍고 나머지는 같은 프레임을 이어 붙여 빠르게 만든다.
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process"; import { pathToFileURL } from "node:url";
const dir = path.dirname(new URL(import.meta.url).pathname);
const out = path.resolve(process.argv[2] || "study-out");
const only = (process.argv[3] || "").split(",").filter(Boolean);
const { LESSONS, CAPTION } = await import(pathToFileURL(path.join(dir, "lessons.mjs")).href);
const FPS = 30, ANIM = 27, END_SAY = "이기는 펍의 선택, 플러스 이브이.";
const BGM_URL = "https://d2ol7oe51mr4n9.cloudfront.net/user_3JmZNKTZQ2jvOCOpKVIQpiy6WR9/f10a007a-7e01-48d6-8353-c8b623f2ae8e.mp3";
const ff = (a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a], { stdio: "inherit" });
const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
fs.mkdirSync(out, { recursive: true });
const bgm = path.join(out, "_bgm.mp3");
try { const r = await fetch(BGM_URL); if (r.ok) fs.writeFileSync(bgm, Buffer.from(await r.arrayBuffer())); } catch {}
const { chromium } = await import("playwright");
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto(pathToFileURL(path.join(dir, "study.html")).href, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
const report = [];
for (const L of LESSONS) {
  if (only.length && !only.includes(L.id)) continue;
  const w = path.join(out, "_work", L.id); fs.rmSync(w, { recursive: true, force: true }); fs.mkdirSync(path.join(w, "f"), { recursive: true });
  // 1) 나레이션
  const says = L.scenes.map((s) => (s.t === "end" ? END_SAY : s.say || ""));
  let voices = [];
  if (process.env.REEL_PYTHON) {
    fs.writeFileSync(path.join(w, "lines.json"), JSON.stringify(says));
    try { execFileSync(process.env.REEL_PYTHON, [path.join(dir, "..", "insta", "tts.py"), path.join(w, "lines.json"), w], { stdio: "inherit", env: { ...process.env, REEL_TTS_SPEED: "1.15" } }); } catch (e) { console.log("나레이션 실패", String(e).slice(0, 100)); }
    voices = says.map((_, i) => path.join(w, `voice-${i}.wav`)).map((f) => (fs.existsSync(f) ? f : null));
  }
  // 2) 장면 길이 = 나레이션 + 여유 (나레이션 없으면 글자 수로 추정)
  const lens = L.scenes.map((s, i) => {
    const v = voices[i] ? dur(voices[i]) : says[i].length / 7;
    return s.t === "end" ? Math.max(2.8, v + 0.5) : Math.max(2.4, v + 0.5);
  });
  // 3) 프레임
  await p.evaluate((l) => setup(l), L);
  let n = 0;
  for (const [i, s] of L.scenes.entries()) {
    const total = Math.round(lens[i] * FPS);
    let last = null;
    for (let f = 0; f < total; f++) {
      const file = path.join(w, "f", String(n++).padStart(6, "0") + ".jpg");
      if (f < ANIM) { await p.evaluate(([i, t]) => draw(i, t), [i, f / FPS]); await p.screenshot({ path: file, type: "jpeg", quality: 90 }); last = file; }
      else fs.linkSync(last, file);
    }
  }
  // 4) 소리: 나레이션 (장면 시작 + 0.25초) + BGM 0.14
  const T = lens.reduce((a, x) => a + x, 0);
  const silent = path.join(w, "v.mp4");
  ff(["-framerate", String(FPS), "-i", path.join(w, "f", "%06d.jpg"), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", silent]);
  const ain = [], af = [], mix = []; let k = 1, at = 0;
  if (fs.existsSync(bgm)) { ain.push("-stream_loop", "-1", "-i", bgm); af.push(`[${k}]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.14,atrim=0:${T.toFixed(2)},afade=t=out:st=${(T - 1.5).toFixed(2)}:d=1.5[a${k}]`); mix.push(`[a${k}]`); k++; }
  else { ain.push("-f", "lavfi", "-i", `anullsrc=r=48000:cl=stereo:d=${T.toFixed(2)}`); af.push(`[${k}]anull[a${k}]`); mix.push(`[a${k}]`); k++; }
  L.scenes.forEach((_, i) => { const v = voices[i]; if (v) { const ms = Math.round((at + 0.25) * 1000); ain.push("-i", v); af.push(`[${k}]aformat=sample_rates=48000:channel_layouts=stereo,volume=1.5,adelay=${ms}|${ms}[a${k}]`); mix.push(`[a${k}]`); k++; } at += lens[i]; });
  af.push(`${mix.join("")}amix=inputs=${mix.length}:normalize=0:duration=first,alimiter=limit=0.95[a]`);
  const final = path.join(out, `${L.id}.mp4`);
  ff(["-i", silent, ...ain, "-filter_complex", af.join(";"), "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-t", T.toFixed(2), "-movflags", "+faststart", final]);
  fs.rmSync(w, { recursive: true, force: true });
  report.push({ id: L.id, title: L.title, seconds: Number(T.toFixed(1)), narration: voices.filter(Boolean).length, caption: CAPTION(L) });
  console.log(L.id, L.title, T.toFixed(1) + "s", voices.filter(Boolean).length ? "나레이션 O" : "나레이션 X");
}
await b.close();
fs.rmSync(path.join(out, "_work"), { recursive: true, force: true }); fs.rmSync(bgm, { force: true });
fs.writeFileSync(path.join(out, `report-${only.join("_") || "all"}.json`), JSON.stringify(report, null, 1));
