// +EV 릴스 제작 연결 고리 (insta-bot과 별개, insta-bot은 건드리지 않음)
// GET  ?queue=1        -> 앞으로 4일 안의 draft 중 대본(script.seedance_prompt)이 있는 행 (공개 정보만)
// POST {action:"sync"} -> GitHub insta-media 브랜치의 manifest.json을 읽어 영상 주소를 넣고 status='ready'
//   manifest는 저장소에 쓸 수 있는 사람만 바꿀 수 있고, 주소는 이 저장소 raw 주소만 받는다.
import postgres from "npm:postgres@3.4.4";
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false });
const REPO = "skifighting-afk/plus-ev";
const MANIFEST = `https://raw.githubusercontent.com/${REPO}/insta-media/manifest.json`;
const OK_PREFIX = `https://raw.githubusercontent.com/${REPO}/`;
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });

async function queue(days: number) {
  return await sql`
    select slug, scheduled_for::text, to_char(post_time,'HH24:MI') post_time, audience, topic, script
    from insta.posts
    where status='draft' and video_url is null and script ? 'seedance_prompt'
      and scheduled_for between (now() at time zone 'Asia/Seoul')::date
                            and (now() at time zone 'Asia/Seoul')::date + ${days}::int
    order by scheduled_for, post_time`;
}

async function sync() {
  const r = await fetch(MANIFEST + "?t=" + Date.now(), { headers: { "Cache-Control": "no-cache" } });
  if (!r.ok) return { skipped: "no manifest", status: r.status };
  const m = await r.json() as Record<string, { video_url: string; video_job?: string; seconds?: number; at?: string }>;
  const done: string[] = [];
  for (const [slug, e] of Object.entries(m)) {
    if ((e as { error?: string })?.error) {
      await sql`update insta.posts set error=${String((e as { error: string }).error).slice(0, 500)} where slug=${slug} and status='draft' and video_url is null`;
      continue;
    }
    if (!e?.video_url?.startsWith(OK_PREFIX)) continue;
    const u = await sql`
      update insta.posts set video_url=${e.video_url}, status='ready', error=null,
        script = coalesce(script,'{}'::jsonb) || ${sql.json({ video_job: e.video_job ?? null, rendered_at: e.at ?? null, rendered_by: "github" })}
      where slug=${slug} and status='draft' and video_url is null returning slug`;
    if (u.length) done.push(slug);
  }
  return { synced: done };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  try {
    if (req.method === "GET" && url.searchParams.get("queue")) {
      const days = Math.min(7, Math.max(0, Number(url.searchParams.get("days") ?? 4)));
      return json({ queue: await queue(days) });
    }
    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      if (b.action === "sync") return json(await sync());
      return json({ error: "unknown action" }, 400);
    }
    return json({ error: "not found" }, 404);
  } catch (e) { return json({ error: String(e) }, 500); }
});
