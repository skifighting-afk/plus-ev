// study-out 의 sNN.mp4 를 insta-media 매니페스트에 등록 (게시 날짜 = 10/17부터 하루씩, 22:00)
import fs from "node:fs"; import path from "node:path";
const [src, media] = process.argv.slice(2).map((p) => path.resolve(p));
const RAW = "https://raw.githubusercontent.com/skifighting-afk/plus-ev/insta-media/";
const START = Date.UTC(2026, 9, 17);
const mf = path.join(media, "manifest.json");
const m = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, "utf8")) : {};
for (const f of fs.readdirSync(src).filter((f) => /^s\d\d\.mp4$/.test(f))) {
  const id = f.slice(0, 3), n = Number(id.slice(1));
  const name = `${id}-${Date.now().toString(36)}.mp4`;
  fs.copyFileSync(path.join(src, f), path.join(media, name));
  if (m[id]?.file && fs.existsSync(path.join(media, m[id].file))) fs.rmSync(path.join(media, m[id].file));
  m[id] = { video_url: RAW + name, file: name, date: new Date(START + (n - 1) * 864e5).toISOString().slice(0, 10), at: new Date().toISOString(), video_job: "study" };
  console.log("등록", id, m[id].date);
}
fs.writeFileSync(mf, JSON.stringify(m, null, 2));
