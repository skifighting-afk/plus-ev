# 10/15~10/21 릴스 대본 (플레이북 실사 레시피). 실행하면 insta.posts 업데이트 SQL을 출력.
import json
BASE=("Cinematic vertical commercial, moody premium look, shallow depth of field, teal and warm amber, film grain, "
      "no text, no logos, no subtitles. ")
PUB="Location: a stylish Korean hold'em poker pub at night, green felt tables, clay chips. "
OWNER="The owner is a Korean man in his 30s wearing a black jacket. "
DEALER="The dealer is a Korean in their 20s wearing a white shirt, black vest and red bow tie. "
START="Start on the first frame with a person's face or hands already in action, never a dark empty frame. "
END_O={"type":"end","dur":3.0,"line":"흩어진 홀덤펍 관리,<br>[+EV 한곳에서.]","sub":"매출 · 스케줄 · 급여 · 구인<br>사장님 첫 달 무료"}
END_D={"type":"end","dur":3.0,"line":"딜러는 일을,<br>[사장은 딜러를.]","sub":"딜러 지원 무료 · plusevapp.kr"}
BRAND="이기는 펍의 선택, 플러스 이브이."
FOOT_O="📌 프로필 링크에서 +EV 살펴보기 (사장님 첫 달 무료)"
FOOT_D="📌 프로필 링크에서 +EV 살펴보기 (딜러 지원 무료)"
FOOT_A="📌 프로필 링크에서 +EV 살펴보기 (사장님 첫 달 무료 / 딜러 지원 무료)"
def S(seed, caps, narr, scenes, caption):
    d=[300,4300,8600,12650] if len(narr)==4 else [300,4300,8300]
    return {"format":"live","seedance_prompt":seed,"captions":caps,"narration_lines":narr,"narration_delays_ms":d,
            "thumb_ms":1500,"scenes":scenes,"pipeline":"github-v1"}, caption
P={}
P["o06"]=S(BASE+PUB+START+"Shot 1 (0-4s): extreme close-up of a player's hands slowly lifting the corners of two face-down playing cards to reveal two aces, a tall stack of clay chips beside them, tense breathing. "
  "Shot 2 (4-8s): across the table an opponent pushes his entire chip stack into the middle with both hands, the dealer freezes, everyone at the table turns to look at the player, hold still.",
  ["포켓 [AA]인데|상대가 [올인]","콜? 폴드?|[정답은 토요일]"],
  ["포켓 에이스 들고, 올인 받았다.","콜? 폴드? 정답은 토요일.","댓글로, 콜 아니면 폴드."],
  [{"type":"end","dur":3.0,"line":"콜? 폴드?<br>[댓글로 한 표.]","sub":"정답은 토요일 밤 10시<br>홀덤펍 운영은 +EV"}],
  "AA 들고 올인 받았습니다.\n상대는 칩을 전부 밀었고, 테이블이 멈췄어요.\n콜? 폴드? 댓글로 남겨주세요. 정답은 토요일 밤 10시 👇\n"+FOOT_A+"\n#홀덤펍 #플러스이브이 #홀덤 #포커퀴즈 #콜폴드 #홀덤펍사장 #홀덤딜러")
P["d05"]=S(BASE+PUB+DEALER+START+"Shot 1 (0-4s): the dealer shuffles cards smoothly at the table with a bright professional smile, customers chatting around. "
  "Shot 2 (4-8s): close-up of the dealer's face keeping a polite smile while a customer loudly rakes in a big pot, the dealer's eyes glance away for a split second, a tiny suppressed sigh.",
  ["딜러가 손님한테|[절대 못 하는 말]","\"그 패로|[왜 콜하셨어요…]\""],
  ["딜러가 손님한테 절대 못 하는 말.","그 패로, 왜 콜하셨어요.","쉬는 날엔, 근처 일자리 알림.",BRAND],
  [{"type":"app","dur":4.6,"tab":"구인","title":"쉬는 날엔<br>[근처 일자리] 알림","toast":"근처 펍 2곳에서 딜러 급구",
    "screen":{"header":"근처 일자리","blocks":[{"k":"alert","t":"오늘 밤 딜러 급구 2곳","tone":"ok"},
      {"k":"list","rows":[["강남 A펍","20:00–04:00 · 일당 13만원(예시)","지원"],["역삼 B펍","21:00–03:00 · 시급 15,000원(예시)","지원"]]},
      {"k":"btn","t":"지원하기","done":"지원 완료"}]}},END_D],
  "딜러가 손님한테 절대 못 하는 말, 하나쯤 있죠?\n웃으면서 셔플하지만 속마음은 따로 있어요.\n딜러님들, 공감되면 1 남겨주세요 👇\n"+FOOT_D+"\n#홀덤딜러 #딜러알바 #홀덤펍 #플러스이브이 #딜러썰 #홀덤")
P["03_payroll"]=S(BASE+PUB+START+"Shot 1 (0-4s): close-up of a player decisively pushing his chips forward to call, both players flip their hole cards face up on the green felt. "
  "Shot 2 (4-8s): the dealer's hand turns the final river card face up in slow motion, the players lean in, one exhales and leans back.",
  ["AA 올인,|[정답 공개]","프리플랍 AA는|무조건 [콜]"],
  ["에이스 올인, 정답 공개.","프리플랍 에이스는, 무조건 콜.","맞힌 사람? 다음 퀴즈는 목요일."],
  [{"type":"end","dur":3.0,"line":"맞힌 사람?<br>[다음 퀴즈는 목요일.]","sub":"홀덤펍 운영은 +EV<br>사장님 첫 달 무료"}],
  "목요일 퀴즈 정답 공개합니다.\n프리플랍에서 AA로 올인을 받았다면, 고민할 것 없이 콜.\n맞히신 분들 댓글로 손 👇 다음 퀴즈는 목요일 밤 10시.\n"+FOOT_A+"\n#홀덤펍 #플러스이브이 #홀덤 #포커퀴즈 #콜폴드 #홀덤공부")
P["04_order"]=S(BASE+"Location: a stylish Korean hold'em poker pub, green felt tables, clay chips. "+OWNER+START+"Shot 1 (0-4s): late afternoon, the owner arranges chip racks and wipes the green felt of an empty table, warm sunlight through the window. "
  "Shot 2 (4-8s): 4 a.m., the same owner sits alone at the bar under a single lamp, counting cash and sorting receipts, tired eyes.",
  ["홀덤펍 사장의 하루,|[15초]","오픈 준비부터|[새벽 마감]까지"],
  ["홀덤펍 사장의 하루, 15초.","오픈 준비부터, 새벽 마감까지.","마감은, 사진 한 장으로.",BRAND],
  [{"type":"app","dur":4.6,"tab":"매출","title":"마감은<br>[사진 한 장]","toast":"마감 완료 · 금고 차액 0원",
    "screen":{"header":"오늘 마감","blocks":[{"k":"card","t":"영수증 사진 [3장] 인식","s":"카드 · 현금 · 칩 판매 자동 입력"},
      {"k":"kpi","items":[["오늘 매출","182만원(예시)"],["금고 차액","0원"]]},
      {"k":"btn","t":"마감하기","done":"마감 완료"}]}},END_O],
  "오픈 준비로 시작해서 새벽 마감으로 끝나는 하루.\n제일 지치는 건 결국 마지막 정산이죠.\n영수증 사진 한 장이면 마감이 끝나요.\n사장님 마감은 몇 시에 끝나요? 댓글로 👇\n"+FOOT_O+"\n#홀덤펍 #플러스이브이 #홀덤펍사장 #사장님일상 #마감정산 #자영업")
P["07_profit"]=S(BASE+PUB+OWNER+START+"Shot 1 (0-4s): close-up of the owner's finger tracing a notebook page full of handwritten clock-in and clock-out times at the bar. "
  "Shot 2 (4-8s): the owner taps a calculator, stops mid-way, rubs his forehead and stares at the numbers.",
  ["이번 달 [야간수당],|직접 계산하세요?","출퇴근 메모 보다|[계산기가 멈췄다]"],
  ["이번 달 야간수당, 직접 계산하세요?","출퇴근 메모 보다가, 계산기가 멈췄다.","급여 대장이, 자동으로.",BRAND],
  [{"type":"app","dur":4.6,"tab":"직원","title":"[급여 대장]이<br>자동으로","toast":"직원 12명 명세서 발송 완료",
    "screen":{"header":"10월 급여 대장","blocks":[{"k":"alert","t":"출퇴근 기록 · 야간 시간 자동 반영","tone":"ok"},
      {"k":"kpi","items":[["총 인건비","1,284만원(예시)"],["야간 근무","96시간(예시)"]]},
      {"k":"list","rows":[["김딜러","112시간 · 야간 38시간",""],["이딜러","96시간 · 야간 30시간",""]]},
      {"k":"btn","t":"명세서 한 번에 보내기","done":"발송 완료"}]}},END_O],
  "출퇴근 메모 보면서 야간 시간 하나하나 세고 계세요?\n한 명만 틀려도 급여일 카톡이 쏟아지죠.\nQR 출퇴근 기록이 쌓이면 급여 대장이 자동으로 채워져요.\n급여 계산, 한 달에 몇 시간 쓰세요? 댓글로 👇\n"+FOOT_O+"\n#홀덤펍 #플러스이브이 #홀덤펍사장 #급여관리 #야간수당 #자영업")
P["d08"]=S(BASE+"Location: a small Korean apartment living room in the evening, warm lamp light. The person is a Korean dealer in their 20s in casual clothes. "+START+"Shot 1 (0-4s): the dealer lies on a sofa scrolling a phone, bored, face lit by the screen. "
  "Shot 2 (4-8s): the phone lights up with a notification, the dealer sits up quickly, smiles, grabs a black vest and red bow tie from the chair.",
  ["쉬는 날인데,|[폰만] 보고 있다면","알림 하나에|[벌떡 일어났다]"],
  ["쉬는 날인데, 폰만 보고 있다면.","알림 하나에, 벌떡 일어났다.","근처 일자리, 바로 지원.",BRAND],
  [{"type":"app","dur":4.6,"tab":"구인","title":"근처 일자리<br>바로 [지원하기]","toast":"역삼 B펍에서 지원 확인",
    "screen":{"header":"근처 일자리","blocks":[{"k":"alert","t":"오늘 21시 · 1.2km · 딜러 급구","tone":"ok"},
      {"k":"card","t":"[역삼 B펍] 딜러 1명","s":"21:00–03:00 · 일당 12만원(예시)"},
      {"k":"btn","t":"지원하기","done":"지원 완료"}]}},END_D],
  "쉬는 날인데 폰만 보고 계세요?\n근처 펍에서 딜러 급구 알림이 오면, 탭 한 번에 지원 끝.\n딜러님들, 대타 자리 보통 어디서 구하세요? 댓글로 👇\n"+FOOT_D+"\n#홀덤딜러 #딜러알바 #대타 #홀덤펍 #플러스이브이 #홀덤")
P["o09"]=S(BASE+PUB+OWNER+START+"Shot 1 (0-4s): after closing, chairs stacked on the tables, the owner sits at the bar with a calculator and a pile of receipts, pressing keys. "
  "Shot 2 (4-8s): close-up of a wall clock showing exactly 3 o'clock, then rack focus to the owner's tired face as he leans back.",
  ["마감 정산,|또 [새벽 3시]","영수증은 쌓이고|[금고는 안 맞고]"],
  ["마감 정산, 또 새벽 3시.","영수증은 쌓이고, 금고는 안 맞고.","차액은, 자동으로.",BRAND],
  [{"type":"app","dur":4.6,"tab":"매출","title":"금고 차액은<br>[자동으로]","toast":"마감 정산 1분 만에 완료",
    "screen":{"header":"오늘 마감","blocks":[{"k":"card","t":"영수증 사진 입력","s":"매출 항목 자동 분류"},
      {"k":"kpi","items":[["장부 매출","214만원(예시)"],["금고 현금","213.5만원(예시)"]]},
      {"k":"alert","t":"차액 -5,000원 · 확인할 항목 1건","tone":"warn"},
      {"k":"btn","t":"마감 확정","done":"마감 완료"}]}},END_O],
  "영업 끝나고 영수증이랑 금고 맞추다 보면 또 새벽 3시.\n1~2만 원 안 맞으면 처음부터 다시 세야 하죠.\n장부와 금고 차액, 이제 자동으로 확인해요.\n사장님은 정산 몇 분 걸려요? 댓글로 👇\n"+FOOT_O+"\n#홀덤펍 #플러스이브이 #홀덤펍사장 #마감정산 #매출관리 #자영업")
out=[]
for slug,(sc,cap) in P.items():
    for c in sc["captions"]:
        for l in c.split("|"):
            assert len(l.replace("[","").replace("]",""))<=12, (slug,l)
    j=json.dumps(sc,ensure_ascii=False).replace("'","''"); cp=cap.replace("'","''")
    out.append(f"update insta.posts set script='{j}'::jsonb, caption='{cp}' where slug='{slug}' and status='draft' and video_url is null;")
print("\n".join(out))
