// Higgsfield SOUL V2로 배경 사진 생성 (bg/<이름>.jpg 가 없을 때만). 키: HF_API_KEY
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process";
const dir = path.dirname(new URL(import.meta.url).pathname), bgDir = path.join(dir, "bg");
fs.mkdirSync(bgDir, { recursive: true });
const KEY = (process.env.HF_API_KEY || "").trim();
if (!KEY) { console.log("HF_API_KEY 없음 → 배경 생성 건너뜀"); process.exit(0); }
const P = JSON.parse(fs.readFileSync(path.join(dir, "backgrounds.json"), "utf8"));
const H = { Authorization: `Key ${KEY}`, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function one(name, prompt) {
  const dst = path.join(bgDir, name + ".jpg");
  if (fs.existsSync(dst)) return;
  const r = await fetch("https://api.higgsfield.ai/higgsfield-ai/soul/v2/standard", { method: "POST", headers: { ...H, "Idempotency-Key": "plusev-bg-" + name }, body: JSON.stringify({ prompt: prompt + P._suffix, aspect_ratio: "3:4", resolution: "1080p", batch_size: 1 }) });
  const sub = await r.json(); if (!r.ok) throw new Error(name + " " + r.status + " " + JSON.stringify(sub));
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const st = await (await fetch(sub.status_url || `https://api.higgsfield.ai/requests/${sub.request_id}/status`, { headers: H })).json();
    if (st.status === "completed") {
      const u = st.images?.[0]?.url; const img = Buffer.from(await (await fetch(u)).arrayBuffer());
      const tmp = dst + ".src"; fs.writeFileSync(tmp, img);
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", tmp, "-vf", "scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350", "-q:v", "3", dst]); fs.rmSync(tmp);
      console.log("배경", name); return;
    }
    if (["failed", "nsfw", "canceled"].includes(st.status)) throw new Error(name + " " + st.status);
  }
  throw new Error(name + " 시간 초과");
}
const names = Object.keys(P).filter((k) => !k.startsWith("_"));
const res = await Promise.allSettled(names.map((n) => one(n, P[n])));
res.forEach((r, i) => r.status === "rejected" && console.log("실패", names[i], String(r.reason).slice(0, 200)));
