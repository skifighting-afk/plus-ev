// +EV 홀덤 애니메이션 릴스 (픽사풍 3D 캐릭터 단편 + 정확한 카드·숫자 그래픽)
// clip 장면 = Higgsfield Seedance 2.5 (9:16, 1080p, 소리 없음) 위에 자막·보드 그래픽을 얹는다.
// 수치 검증(정확 계산): 9♠9♦ vs A♥5♥, 보드 9♥8♥2♣ → 셋 73.5% / 드로우 26.5% · 턴 3♥ 후 셋 22.7%
const STYLE = "3D animated cartoon short film in Pixar style, vibrant soft cinematic lighting, smooth expressive character animation, cozy Korean hold'em poker pub at night with a green felt table and colorful clay chips, vertical framing, no text, no letters, no subtitles, no logos, no readable card faces. ";
const CAST = "Characters: KIM is a small round mint-green blob character with huge shiny eyes and tiny arms; RIVAL is a round purple blob character with sleepy half-closed smug eyes; PRO is a round black blob character wearing green-rimmed sunglasses and a tiny gold crown. ";
// 레인지 표기("55+, A2s+, KTs+, AJo+, T9s") → 169 핸드 목록
const RK = "AKQJT98765432";
export function expand(str) {
  const out = new Set();
  for (const tok of str.split(",").map((x) => x.trim()).filter(Boolean)) {
    const plus = tok.endsWith("+"), b = plus ? tok.slice(0, -1) : tok;
    if (b[0] === b[1]) { const r = RK.indexOf(b[0]); for (let k = plus ? 0 : r; k <= r; k++) out.add(RK[k] + RK[k]); continue; }
    const hi = RK.indexOf(b[0]), lo = RK.indexOf(b[1]), sfx = b[2];
    for (let k = plus ? hi + 1 : lo; k <= lo; k++) out.add(b[0] + RK[k] + sfx);
  }
  return [...out];
}
export const pct = (hands) => (hands.reduce((a, h) => a + (h.length === 2 ? 6 : h[2] === "s" ? 4 : 12), 0) / 1326) * 100;
const RANGE = {
  UTG: expand("55+, A2s+, KTs+, QTs+, JTs, T9s, AJo+, KQo"),
  HJ: expand("44+, A2s+, K9s+, Q9s+, J9s+, T9s, 98s, ATo+, KJo+, QJo"),
  CO: expand("22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, A8o+, KTo+, QTo+, JTo"),
  BTN: expand("22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 96s+, 85s+, 75s+, 64s+, 54s, A2o+, K8o+, Q9o+, J9o+, T9o, 98o"),
};
const P = Object.fromEntries(Object.entries(RANGE).map(([k, v]) => [k, Math.round(pct(v) * 10) / 10]));
export const LESSONS = [
{ id: "a01", title: "셋 슬로우플레이의 최후", tag: "ANIMATION",
  scenes: [
    { t: "clip", dur: 8, prompt: STYLE + CAST + "Shot 1 (0-4s): close-up of KIM sitting at the poker table, lifting the corner of two cards lying on the felt, his big eyes light up with joy and a wide happy grin appears. Shot 2 (4-8s): KIM quickly puts on a calm poker face, looks away innocently and gently taps the table twice with his tiny hand, a little nervous and excited.",
      cap: ["셋 잡았다…", "[조용히 체크]"], hand: "9s 9d", board: "9h 8h 2c",
      say: "플랍에서 나인 셋을 잡은 킴. 들킬까 봐 조용히 체크합니다." },
    { t: "clip", dur: 8, prompt: STYLE + CAST + "Shot 1 (0-4s): across the table RIVAL leans back lazily, one eyebrow raised, and taps the table to check with a sly little smile. Shot 2 (4-8s): close-up of RIVAL's smug face, eyes narrowing, a tiny knowing smirk, the camera slowly pushes in.",
      cap: ["상대도 체크", "[공짜 카드 감사]"], board: "9h 8h 2c",
      say: "상대도 체크. 공짜로 턴 카드를 보여준 셈이죠." },
    { t: "clip", dur: 8, prompt: STYLE + CAST + "Shot 1 (0-4s): a dealer's hand flips one card onto the felt in slow motion, dramatic light. Shot 2 (4-8s): RIVAL dramatically pushes a huge tower of clay chips into the middle with both arms, chips cascading; KIM's eyes go wide in shock, jaw drops, a sweat drop flies off.",
      cap: ["턴 하트…", "상대 [올인]"], board: "9h 8h 2c 3h",
      say: "턴에 하트가 떨어지자마자, 상대가 칩을 전부 밉니다." },
    { t: "clip", dur: 8, prompt: STYLE + CAST + "Shot 1 (0-4s): RIVAL slowly flips two cards face up with a triumphant grin and sparkles. Shot 2 (4-8s): KIM melts into a sad puddle with cartoon tears streaming, his chips slide away across the felt toward RIVAL, comedic sad trombone mood.",
      cap: ["상대 패는", "[넛 플러시]"], board: "9h 8h 2c 3h", villain: "Ah 5h",
      say: "상대 패는 하트 에이스 파이브, 넛 플러시. 킴은 녹아내립니다." },
    { t: "clip", dur: 8, prompt: STYLE + CAST + "Shot 1 (0-4s): PRO walks in coolly, stops beside the table, lowers his sunglasses and lets out a long sigh while shaking his head. Shot 2 (4-8s): PRO confidently slides a neat stack of chips forward into the pot with one hand and gives a calm nod toward the camera.",
      cap: ["탑 프로라면?", "플랍에서 [바로 베팅]"], board: "9h 8h 2c",
      say: "탑 프로라면 플랍에서 바로 베팅합니다. 드로우에게 공짜 카드는 없어요." },
    { t: "bars", title: "같은 패, 시점별 승률", items: [["플랍: 셋", 73.5], ["플랍: 플러시 드로우", 26.5], ["턴 이후: 셋", 22.7]], unit: "%",
      say: "플랍에서 칠십삼 퍼센트였던 셋이, 공짜 카드 한 장에 이십삼 퍼센트로 뒤집혔습니다." },
    { t: "rule", title: "오늘의 한 줄", lines: ["젖은 보드에서 강한 패 = [지금 베팅]", "슬로우플레이는 마른 보드에서만"],
      say: "젖은 보드에서 강한 패는 지금 베팅. 슬로우플레이는 마른 보드에서만." },
    { t: "quiz", q: "K♦7♣2♥ 보드에서 K♠K♣ 셋. 당신이라면?", opts: ["바로 베팅", "체크 (슬로우플레이)"],
      say: "그럼 마른 보드에서 킹 셋이라면? 댓글로 골라주세요." },
    { t: "end" } ] },
{ id: "a02", title: "GTO: 팟 벳 맞으면 몇 번 콜?", tag: "GTO", speed: 1.3, fast: true,
  scenes: [
    { t: "clip", dur: 5, prompt: STYLE + CAST + "Shot 1 (0-2.5s): RIVAL confidently shoves a tall tower of clay chips into the middle of the table with both arms, smirking. Shot 2 (2.5-5s): close-up of KIM gulping nervously, eyes wide, a big sweat drop sliding down, then KIM quickly pushes his two cards away to fold.",
      fb: { file: "a01-2-67d221f0.mp4", ss: 4 },
      cap: ["리버, 상대 팟 벳", "킴은 [또 폴드]"], board: "Ks 9h 5d 2c 7s", hand: "Kh Jc",
      say: "리버에 상대가 팟만큼 베팅. 탑 페어 킴은 또 폴드." },
    { t: "clip", dur: 5, prompt: STYLE + CAST + "Shot 1 (0-2.5s): RIVAL flips two cards face up and bursts out laughing, rolling back in his chair. Shot 2 (2.5-5s): KIM stares at the revealed cards, his jaw drops and his face turns red with frustration, steam puffing from his head.",
      fb: { file: "a01-3-33b47ea0.mp4", ss: 0 },
      cap: ["상대 패는", "[완전 블러프]"], board: "Ks 9h 5d 2c 7s", villain: "Qd Td",
      say: "상대 패는 퀸 텐, 완전 블러프." },
    { t: "clip", dur: 5, prompt: STYLE + CAST + "Shot 1 (0-2.5s): PRO slowly lowers his green sunglasses and raises an eyebrow, unimpressed. Shot 2 (2.5-5s): PRO calmly slides a neat stack of chips forward to call and gives a confident nod to the camera.",
      fb: { file: "a01-4-dd00e1f1.mp4", ss: 4 },
      cap: ["GTO라면?", "최소 [절반은 콜]"], board: "Ks 9h 5d 2c 7s",
      say: "지티오는 다릅니다. 팟 벳엔 최소 절반은 콜." },
    { t: "math", title: "최소 방어 빈도 (MDF)", lines: ["팟 ÷ (팟 + 베팅)", "100 ÷ (100 + 100)", "= [50%] 이상 콜"],
      say: "팟 나누기 팟 더하기 베팅. 오십 퍼센트 이상 지켜야 합니다." },
    { t: "bars", title: "베팅 크기별 최소 콜 빈도", items: [["1/3 팟", 75], ["1/2 팟", 66.7], ["팟", 50], ["2배 오버벳", 33.3]], unit: "%",
      say: "작게 걸수록 더 많이 콜. 삼분의 일 팟이면 칠십오 퍼센트." },
    { t: "rule", title: "오늘의 한 줄", lines: ["매번 폴드 = [블러프가 공짜로 이김]", "팟 벳의 GTO 블러프 비율은 33%"],
      say: "매번 폴드하면 블러프가 공짜로 이깁니다." },
    { t: "quiz", q: "상대 1/2 팟 베팅. 최소 몇 % 콜?", opts: ["50%", "67%"],
      say: "하프 팟 베팅이면? 댓글로." },
    { t: "end" } ] },
{ id: "a03", title: "GTO 오픈 표: 같은 K9o, 자리만 바꾸면", tag: "GTO · POSITION", speed: 1.3, fast: true,
  scenes: [
    { t: "clip", dur: 5, prompt: STYLE + CAST + "Shot 1 (0-2.5s): KIM sits in the first seat of a crowded poker table with five other blob players waiting behind him, he proudly slaps a stack of chips forward to raise, chest puffed out. Shot 2 (2.5-5s): the five other blob players all turn their heads toward KIM at the same time and stare at him silently, KIM's smile slowly freezes.",
      fb: { file: "a01-0-d859aeff.mp4", ss: 0 },
      cap: ["첫 자리(UTG)에서", "K9o [자신있게 오픈]"], hand: "Kc 9d",
      say: "첫 자리에서 킹 나인 오프로 자신있게 오픈한 킴." },
    { t: "clip", dur: 5, prompt: STYLE + CAST + "Shot 1 (0-2.5s): RIVAL on the button smirks and pushes a much bigger stack of chips forward to re-raise. Shot 2 (2.5-5s): KIM looks down at his cards, sweats nervously and sadly slides his cards away to fold, shoulders drooping.",
      fb: { file: "a01-2-67d221f0.mp4", ss: 4 },
      cap: ["뒤에서 [3벳]", "결국 폴드"], hand: "Kc 9d",
      say: "뒤에서 쓰리벳이 날아오고, 결국 폴드." },
    { t: "clip", dur: 5, prompt: STYLE + CAST + "Shot 1 (0-2.5s): PRO walks up beside KIM and unrolls a big glowing colorful square chart made of small green and dark tiles, with no letters on it. Shot 2 (2.5-5s): PRO taps the chart with a tiny hand and lowers his sunglasses, KIM leans in with huge curious eyes.",
      fb: { file: "a01-4-dd00e1f1.mp4", ss: 0 },
      cap: ["GTO 오픈 표를", "[펼쳐보면]"],
      say: "지티오 오픈 표를 펼쳐보면, 답이 바로 나옵니다." },
    { t: "grid", pos: "UTG", sub: "첫 자리 · 뒤에 5명", hands: RANGE.UTG, pct: P.UTG, mark: "K9o", verdict: "K9o → [폴드]",
      say: "첫 자리는 상위 십사 퍼센트만. 킹 나인 오프는 폴드." },
    { t: "grid", pos: "BTN", sub: "버튼 · 뒤에 2명", hands: RANGE.BTN, pct: P.BTN, mark: "K9o", verdict: "K9o → [오픈]",
      say: "버튼은 사십 퍼센트 넘게 오픈. 같은 킹 나인 오프가 여기선 오픈." },
    { t: "bars", title: "포지션별 오픈 비율 (6맥스 100BB 근사)", items: [["UTG", P.UTG], ["HJ", P.HJ], ["CO", P.CO], ["BTN", P.BTN]], unit: "%",
      say: "뒤로 갈수록 오픈 범위가 넓어집니다." },
    { t: "rule", title: "오늘의 한 줄", lines: ["뒤에 남은 사람이 많을수록 [좁게]", "버튼에 가까울수록 [넓게]"],
      say: "뒤에 남은 사람이 많을수록 좁게, 버튼에 가까울수록 넓게." },
    { t: "quiz", q: "HJ(뒤에 4명)에서 K9o. 오픈? 폴드?", opts: ["오픈", "폴드"],
      say: "그럼 하이잭에서 킹 나인 오프는? 댓글로." },
    { t: "end" } ] },
];
export const CAPTION = (L) => L.id === "a03" ? `같은 K9o인데 UTG에선 폴드, 버튼에선 오픈 🃏\nGTO 오픈 표는 "뒤에 몇 명 남았나"로 읽으면 끝.\nUTG ${P.UTG}% · HJ ${P.HJ}% · CO ${P.CO}% · BTN ${P.BTN}% (6맥스 100BB 근사)\nHJ에서 K9o는? 댓글로 👇 저장 📌\n📌 프로필 링크 plusev.co.kr · 홀덤펍 운영은 +EV\n#홀덤 #GTO #홀덤공부 #포커 #프리플랍 #오픈레인지 #홀덤펍 #플러스이브이` : L.id === "a02" ? `탑 페어 들고 또 폴드한 킴, 상대는 퀸 텐 블러프 🫠\nGTO 기준 팟 벳엔 최소 50%는 콜해야 합니다.\n1/3팟 75% · 1/2팟 67% · 팟 50% · 2배 33%\n하프 팟이면 몇 %? 댓글로 👇 저장 📌\n📌 프로필 링크 plusev.co.kr · 홀덤펍 운영은 +EV\n#홀덤 #GTO #홀덤공부 #포커 #MDF #홀덤펍 #플러스이브이` : `셋 잡고 진 킴, 탑 프로가 한숨 쉰 이유 😮‍💨\n플랍 승률 73.5% → 공짜 카드 한 장에 22.7%.\n젖은 보드에서 슬로우플레이는 이제 그만.\n마른 보드 K셋이면 베팅? 체크? 댓글로 👇 저장 📌\n📌 프로필 링크 plusev.co.kr · 홀덤펍 운영은 +EV\n#홀덤 #홀덤공부 #포커 #홀덤썰 #슬로우플레이 #홀덤펍 #플러스이브이`;
