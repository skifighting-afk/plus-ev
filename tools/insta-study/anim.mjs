// +EV 홀덤 애니메이션 릴스 (픽사풍 3D 캐릭터 단편 + 정확한 카드·숫자 그래픽)
// clip 장면 = Higgsfield Seedance 2.5 (9:16, 1080p, 소리 없음) 위에 자막·보드 그래픽을 얹는다.
// 수치 검증(정확 계산): 9♠9♦ vs A♥5♥, 보드 9♥8♥2♣ → 셋 73.5% / 드로우 26.5% · 턴 3♥ 후 셋 22.7%
const STYLE = "3D animated cartoon short film in Pixar style, vibrant soft cinematic lighting, smooth expressive character animation, cozy Korean hold'em poker pub at night with a green felt table and colorful clay chips, vertical framing, no text, no letters, no subtitles, no logos, no readable card faces. ";
const CAST = "Characters: KIM is a small round mint-green blob character with huge shiny eyes and tiny arms; RIVAL is a round purple blob character with sleepy half-closed smug eyes; PRO is a round black blob character wearing green-rimmed sunglasses and a tiny gold crown. ";
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
];
export const CAPTION = () => `셋 잡고 진 킴, 탑 프로가 한숨 쉰 이유 😮‍💨\n플랍 승률 73.5% → 공짜 카드 한 장에 22.7%.\n젖은 보드에서 슬로우플레이는 이제 그만.\n마른 보드 K셋이면 베팅? 체크? 댓글로 👇 저장 📌\n📌 프로필 링크 plusev.co.kr · 홀덤펍 운영은 +EV\n#홀덤 #홀덤공부 #포커 #홀덤썰 #슬로우플레이 #홀덤펍 #플러스이브이`;
