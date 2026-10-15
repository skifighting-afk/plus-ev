// +EV 홀덤 애니메이션 릴스 렌더러: clip(Seedance 애니메이션 + 그래픽 오버레이) + 그래픽 장면 → 한 편
// 사용: node tools/insta-study/make-anim.mjs out a01   (HF_API_KEY 필요, REEL_PYTHON 있으면 나레이션)
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
import { execFileSync } from "node:child_process"; import { pathToFileURL } from "node:url";
const dir = path.dirname(new URL(import.meta.url).pathname);
const out = path.resolve(process.argv[2] || "anim-out"), only = (process.argv[3] || "").split(",").filter(Boolean);
const { LESSONS, CAPTION } = await import(pathToFileURL(path.join(dir, "anim.mjs")).href);
const KEY = (process.env.HF_API_KEY || "").trim();
const FPS = 30, ANIM = 27, W = 1080, H = 1920, END_SAY = "이기는 펍의 선택, 플러스 이브이.";
const BGM_URL = "https://d2ol7oe51mr4n9.cloudfront.net/user_3JmZNKTZQ2jvOCOpKVIQpiy6WR9/f10a007a-7e01-48d6-8353-c8b623f2ae8e.mp3";
const ff = (a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a], { stdio: "inherit" });
const dur = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function seedance(prompt, file, seconds, attempt = 0) {
  if (!KEY) { ff(["-f", "lavfi", "-i", `color=c=0x1d3a2a:s=${W}x${H}:d=${seconds}:r=${FPS}`, "-pix_fmt", "yuv420p", file]); return "dry"; }
  const Hd = { Authorization: `Key ${KEY}`, "Content-Type": "application/json" };
  const idem = "anim-" + crypto.createHash("sha1").update(prompt + attempt + (process.env.CLIP_RES || "")).digest("hex").slice(0, 16);
  const r = await fetch("https://api.higgsfield.ai/bytedance/seedance-2.5/text-to-video", { method: "POST", headers: { ...Hd, "Idempotency-Key": idem }, body: JSON.stringify({ prompt, duration: seconds, resolution: process.env.CLIP_RES || "1080p", aspect_ratio: "9:16", generate_audio: false }) });
  const sub = await r.json(); if (!r.ok) throw new Error("seedance " + r.status + " " + JSON.stringify(sub).slice(0, 200));
  for (let i = 0; i < 150; i++) {
    await sleep(8000);
    const st = await (await fetch(sub.status_url || `https://api.higgsfield.ai/requests/${sub.request_id}/status`, { headers: Hd })).json();
    if (st.status === "completed") { fs.writeFileSync(file, Buffer.from(await (await fetch(st.video.url)).arrayBuffer())); return sub.request_id; }
    if (["failed", "nsfw", "canceled"].includes(st.status)) throw new Error("seedance " + st.status + " " + JSON.stringify(st).slice(0, 300));
  }
  throw new Error("seedance 시간 초과");
}
fs.mkdirSync(out, { recursive: true });
const bgm = path.join(out, "_bgm.mp3");
try { const r = await fetch(BGM_URL); if (r.ok) fs.writeFileSync(bgm, Buffer.from(await r.arrayBuffer())); } catch {}
const { chromium } = await import("playwright");
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: W, height: H } });
await p.goto(pathToFileURL(path.join(dir, "study.html")).href, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
for (const L of LESSONS) {
  if (only.length && !only.includes(L.id)) continue;
  const w = path.join(out, "_w", L.id); fs.rmSync(w, { recursive: true, force: true }); fs.mkdirSync(w, { recursive: true });
  // 1) 애니메이션 클립 먼저 (병렬)
  // 만든 클립은 out/clips 에 보관해 재실행 때 크레딧을 다시 쓰지 않는다
  const cd = path.join(out, "clips"); fs.mkdirSync(cd, { recursive: true });
  const CMAP = L.clipMap && fs.existsSync(path.join(dir, L.clipMap)) ? JSON.parse(fs.readFileSync(path.join(dir, L.clipMap), "utf8")) : {};
  const jobs = await Promise.all(L.scenes.map(async (s, i) => {
    if (s.t !== "clip" || s.reuse) return null;
    if (s.cid && CMAP[s.cid]) { const dst = path.join(w, `clip${i}.mp4`); const r = await fetch(CMAP[s.cid]); if (!r.ok) throw new Error("clip 다운로드 실패 " + s.cid + " " + r.status); fs.writeFileSync(dst, Buffer.from(await r.arrayBuffer())); return "web:" + s.cid; }
    const keep = path.join(cd, `${L.id}-${i}-${crypto.createHash("sha1").update(s.prompt).digest("hex").slice(0, 8)}.mp4`), dst = path.join(w, `clip${i}.mp4`);
    if (fs.existsSync(keep)) { fs.copyFileSync(keep, dst); return "cached"; }
    let err;
    if (s.fb && process.env.FB_ONLY) { const f = path.join(cd, s.fb.file); ff(["-ss", String(s.fb.ss || 0), "-i", f, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", dst]); return "fallback"; }
    for (let t = 0; t < 2; t++) { try { const id = await seedance(s.prompt, dst, s.dur, t); if (KEY) fs.copyFileSync(dst, keep); return id; } catch (e) { err = e; console.log("클립", i, "실패", String(e).slice(0, 300)); } }
    if (s.fb && fs.existsSync(path.join(cd, s.fb.file))) { console.log("클립", i, "기존 클립으로 대체"); ff(["-ss", String(s.fb.ss || 0), "-i", path.join(cd, s.fb.file), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", dst]); return "fallback"; }
    throw err;
  }));
  L.scenes.forEach((s, i) => { if (s.t === "clip" && s.reuse) { const j = L.scenes.findIndex((x) => x.cid === s.reuse); ff(["-i", path.join(w, `clip${j}.mp4`), "-vf", `setpts=PTS/${s.speed || 1}`, "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", path.join(w, `clip${i}.mp4`)]); } });
  console.log(L.id, "클립", jobs.filter(Boolean).length);
  // 2) 나레이션
  const says = L.scenes.map((s) => (s.t === "end" ? END_SAY : s.say || ""));
  let voices = [];
  if (process.env.REEL_PYTHON && !L.mute) {
    fs.writeFileSync(path.join(w, "lines.json"), JSON.stringify(says));
    try { execFileSync(process.env.REEL_PYTHON, [path.join(dir, "..", "insta", "tts.py"), path.join(w, "lines.json"), w], { stdio: "inherit", env: { ...process.env, REEL_TTS_SPEED: String(L.speed || 1.1) } }); } catch (e) { console.log("나레이션 실패"); }
    voices = says.map((_, i) => path.join(w, `voice-${i}.wav`)).map((f) => (fs.existsSync(f) ? f : null));
  }
  const lens = L.scenes.map((s, i) => { if (L.mute) return s.len || s.dur || 2.5; const v = voices[i] ? dur(voices[i]) : says[i].length / 7; if (L.fast) return s.t === "clip" ? Math.max(3.2, v + 0.35) : s.t === "end" ? Math.max(2.2, v + 0.3) : Math.max(1.8, v + 0.3);
    return s.t === "clip" ? Math.max(s.dur, v + 0.6) : s.t === "end" ? Math.max(2.8, v + 0.5) : Math.max(2.4, v + 0.5); });
  await p.evaluate((l) => setup(l), L);
  // 3) 장면별 조각 영상
  const segs = [];
  for (const [i, s] of L.scenes.entries()) {
    const total = Math.round(lens[i] * FPS), fd = path.join(w, `f${i}`); fs.mkdirSync(fd);
    const isClip = s.t === "clip";
    await p.evaluate((on) => overlay(on), isClip);
    let last = null;
    for (let f = 0; f < total; f++) {
      const file = path.join(fd, String(f).padStart(5, "0") + ".png");
      if (f < ANIM) { await p.evaluate(([i, t]) => draw(i, t), [i, f / FPS]); await p.screenshot({ path: file, type: "png", omitBackground: isClip }); last = file; }
      else fs.linkSync(last, file);
    }
    const seg = path.join(w, `seg${i}.mp4`);
    if (isClip) {
      const T = lens[i].toFixed(2);
      ff(["-i", path.join(w, `clip${i}.mp4`), "-framerate", String(FPS), "-i", path.join(fd, "%05d.png"), "-filter_complex",
        `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setsar=1,tpad=stop_mode=clone:stop_duration=10,trim=0:${T},setpts=PTS-STARTPTS[bg];[bg][1:v]overlay=0:0:shortest=1,format=yuv420p[v]`,
        "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-t", T, seg]);
    } else ff(["-framerate", String(FPS), "-i", path.join(fd, "%05d.png"), "-c:v", "libx264", "-preset", "veryfast", "-crf", "19", "-pix_fmt", "yuv420p", seg]);
    segs.push(seg); fs.rmSync(fd, { recursive: true });
  }
  await p.evaluate(() => overlay(false));
  const list = path.join(w, "list.txt"); fs.writeFileSync(list, segs.map((x) => `file '${x}'`).join("\n"));
  const silent = path.join(w, "v.mp4"); ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", silent]);
  // 4) 소리
  const T = lens.reduce((a, x) => a + x, 0); const ain = [], af = [], mix = []; let k = 1, at = 0;
  // 장면별 음악 볼륨 (s.music: 0 = 정적, 1.6 = 폭발)
  let acc = 0; const env = L.scenes.map((sc, i) => { const a = acc; acc += lens[i]; return `between(t,${a.toFixed(2)},${acc.toFixed(2)})*${sc.music ?? 1}`; }).join("+");
  const base = L.mute ? 0.55 : 0.16;
  if (fs.existsSync(bgm)) { ain.push("-stream_loop", "-1", "-i", bgm); af.push(`[${k}]aformat=sample_rates=48000:channel_layouts=stereo,volume=${base},volume='${env}':eval=frame,atrim=0:${T.toFixed(2)},afade=t=out:st=${(T - 1.5).toFixed(2)}:d=1.5[a${k}]`); }
  else { ain.push("-f", "lavfi", "-i", `anullsrc=r=48000:cl=stereo:d=${T.toFixed(2)}`); af.push(`[${k}]anull[a${k}]`); }
  mix.push(`[a${k}]`); k++;
  // 효과음 (ffmpeg 합성): tick 딱 · whoosh 휙 · wobble 부웅부웅 · shuffle 촤르륵 · howl 하울링 · pop 뾰롱
  const SFX = { tick: "sine=f=1800:d=0.06,afade=t=out:d=0.06,volume=2.5", whoosh: "anoisesrc=d=0.35:c=pink,bandpass=f=1200:w=900,afade=t=in:d=0.12,afade=t=out:st=0.15:d=0.2,volume=3", wobble: "sine=f=95:d=0.9,tremolo=f=7:d=0.9,volume=4", shuffle: "anoisesrc=d=0.5:c=white,highpass=f=2500,tremolo=f=28:d=1,afade=t=out:st=0.2:d=0.3,volume=1.6", howl: "aevalsrc='0.6*sin(2*PI*(420*t+120*t*t+6*sin(2*PI*5*t)))':d=1.6,afade=t=in:d=0.2,afade=t=out:st=1.1:d=0.5", pop: "sine=f=880:d=0.12,afade=t=out:d=0.12,volume=1.5" };
  { let at2 = 0; L.scenes.forEach((sc, i) => { for (const [ty, off] of (sc.sfx || [])) { const f = path.join(w, `sfx-${ty}.wav`); if (!fs.existsSync(f)) ff(["-f", "lavfi", "-i", SFX[ty], "-ar", "48000", "-ac", "2", f]); const ms = Math.round((at2 + off) * 1000); ain.push("-i", f); af.push(`[${k}]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${ms}|${ms}[a${k}]`); mix.push(`[a${k}]`); k++; } at2 += lens[i]; }); }
  L.scenes.forEach((_, i) => { const v = voices[i]; if (v) { const ms = Math.round((at + (L.fast ? 0.1 : 0.3)) * 1000); ain.push("-i", v); af.push(`[${k}]aformat=sample_rates=48000:channel_layouts=stereo,volume=1.5,adelay=${ms}|${ms}[a${k}]`); mix.push(`[a${k}]`); k++; } at += lens[i]; });
  af.push(`${mix.join("")}amix=inputs=${mix.length}:normalize=0:duration=first,alimiter=limit=0.95[a]`);
  ff(["-i", silent, ...ain, "-filter_complex", af.join(";"), "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-t", T.toFixed(2), "-movflags", "+faststart", path.join(out, `${L.id}.mp4`)]);
  fs.writeFileSync(path.join(out, `${L.id}.json`), JSON.stringify({ id: L.id, seconds: Number(T.toFixed(1)), jobs: jobs.filter(Boolean), caption: CAPTION(L) }, null, 1));
  fs.rmSync(w, { recursive: true, force: true });
  console.log(L.id, T.toFixed(1) + "s");
}
await b.close(); fs.rmSync(bgm, { force: true }); fs.rmSync(path.join(out, "_w"), { recursive: true, force: true });
