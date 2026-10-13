// +EV 홀덤 스토리 릴스 (캐릭터 애니메이션 · 재밌는데 유익하게) — 1편 시범
// 등장: 초보 '킴'(rookie) · 상대 '빌런'(villain) · '탑 프로'(pro, 가상 캐릭터)
// 수치 검증(정확 계산): 9♠9♦ vs A♥5♥, 보드 9♥8♥2♣ → 셋 73.5% / 드로우 26.5%
//                      턴 3♥(플러시 완성) 후 셋 22.7% (보드 페어 10아웃 / 44)
export const LESSONS = [
{ id: "x01", title: "셋 슬로우플레이의 최후", tag: "STORY · SLOWPLAY",
  scenes: [
    { t: "hook", big: ["셋 잡고", "졌다고?"], sub: "탑 프로가 한숨 쉰 장면",
      chars: [{ who: "rookie", mood: "happy" }, { who: "pro", mood: "sigh", bubble: "하…" }],
      say: "탑 셋을 잡고도 칩을 다 잃은 초보. 탑 프로가 한숨을 쉰 이유, 같이 보시죠." },
    { t: "table", street: "FLOP", board: "9h 8h 2c", hero: "9s 9d", pot: "6BB",
      chars: [{ who: "rookie", mood: "happy", bubble: "탑 셋이다… 조용히 체크해야지" }],
      say: "플랍 나인 에이트 투, 하트 두 장. 초보 킴은 나인 셋. 신나서 조용히 체크합니다." },
    { t: "table", street: "FLOP", board: "9h 8h 2c", hero: "9s 9d", pot: "6BB",
      chars: [{ who: "villain", mood: "smug", bubble: "체크. (공짜 카드 감사)" }],
      say: "상대도 체크. 공짜로 턴 카드를 보게 됐죠." },
    { t: "table", street: "TURN", board: "9h 8h 2c 3h", newCard: 3, hero: "9s 9d", pot: "6BB",
      chars: [{ who: "rookie", mood: "shock", bubble: "어…? 하트가 세 장?" }, { who: "villain", mood: "smug", bubble: "올인." }],
      say: "턴에 하트 쓰리. 하트가 세 장이 되자마자, 상대가 올인합니다." },
    { t: "reveal", board: "9h 8h 2c 3h", villain: "Ah 5h", label: "넛 플러시",
      chars: [{ who: "rookie", mood: "cry" }],
      say: "콜 했더니 상대 손엔 하트 에이스 파이브. 넛 플러시입니다." },
    { t: "bars", title: "같은 패, 시점별 승률", items: [["플랍: 셋", 73.5], ["플랍: 플러시 드로우", 26.5], ["턴 이후: 셋", 22.7]], unit: "%",
      say: "플랍에서는 셋이 칠십삼 퍼센트로 압도적이었어요. 공짜 카드 한 장에 이십삼 퍼센트로 뒤집힌 겁니다." },
    { t: "pro", lines: ["젖은 보드 + 강한 패", "= [지금 바로 베팅]", "드로우에게 공짜 카드 ✕"],
      chars: [{ who: "pro", mood: "cool", bubble: "플랍에서 2/3 팟. 드로우한테 돈 내고 보게 해." }],
      say: "탑 프로라면 플랍에서 바로 팟의 삼분의 이. 드로우에게는 돈을 내고 카드를 보게 합니다." },
    { t: "rule", title: "슬로우플레이 기준", lines: ["마른 보드 (K♦7♣2♥) → 가끔 OK", "젖은 보드 (9♥8♥2♣) → [절대 금지]"],
      say: "슬로우플레이는 바뀔 카드가 적은 마른 보드에서만. 하트 두 장, 연결된 보드에선 절대 금지." },
    { t: "quiz", q: "K♦7♣2♥ 보드에서 K♠K♣ 셋. 당신의 선택은?", opts: ["바로 베팅", "체크 (슬로우플레이)"],
      chars: [{ who: "rookie", mood: "think" }],
      say: "그럼 마른 보드에서 킹 셋이라면? 댓글로 골라주세요." },
    { t: "end", sub: "홀덤펍 운영 · 딜러 구인 · 급여 관리" } ] },
];

export const CAPTION = (L) => `셋 잡고 진 초보, 탑 프로가 한숨 쉰 이유 😮‍💨\n플랍 승률 73.5% → 공짜 카드 한 장에 22.7%.\n젖은 보드에서 슬로우플레이, 이제 그만.\n마른 보드 K셋이면 베팅? 체크? 댓글로 👇 저장해두고 다시 보기 📌\n📌 프로필 링크 plusev.co.kr · 홀덤펍 운영은 +EV\n#홀덤 #홀덤공부 #포커 #슬로우플레이 #홀덤펍 #플러스이브이 #홀덤썰`;
