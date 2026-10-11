const P={
dt:`<div class="bar"><b>⁺EV</b><span>9:41</span></div><div class="ti">구인</div><div class="seg"><span class="on">긴급 (24시간)</span><span>상시 아르바이트</span></div><div class="nt">+EV 가입 딜러 17명 · 긴급 대타 알림 받는 딜러 17명</div><div class="g2"><div><label>직책</label><div class="ip">딜러 ▾</div></div><div><label>몇 명</label><div class="ip">1</div></div></div><label>제목</label><div class="ip">오늘 밤 딜러 급구</div><div class="g2"><div><label>시작 시간</label><div class="ip">오후 08:00</div></div><div><label>마감 시간</label><div class="ip">오전 04:00</div></div></div><label>일당 (원)</label><div class="ip">130,000</div><div class="mn">13만원</div><div class="go">긴급 공고 올리기</div>`,
pay:`<div class="bar"><b>⁺EV</b><span>9:41</span></div><div class="ti">직원·급여</div><div class="seg"><span>직원 현황</span><span class="on">급여 대장</span></div><div class="mo">◀ <b>2026년 10월</b> ▶</div><div class="li"><div><b>김딜러</b><small>딜러 · 112시간</small></div><em>₩1,568,000</em></div><div class="li"><div><b>이딜러</b><small>딜러 · 96시간 · 야간</small></div><em>₩1,440,000</em></div><div class="li"><div><b>박서버</b><small>서버 · 84시간</small></div><em>₩890,400</em></div><div class="li"><div><b>최딜러</b><small>딜러 · 72시간</small></div><em>₩1,008,000</em></div><div class="chips"><span>명세서 한 번에</span><span>대량이체 파일</span></div>`,
pl:`<div class="bar"><b>⁺EV</b><span>9:41</span></div><div class="ti">월간 손익</div><div class="tb"><div class="tr th"><span>항목</span><span>8월</span><span>9월</span><span>10월</span></div><div class="tr"><b>매출</b><span>4,210</span><span>4,580</span><span>4,960</span></div><div class="tr"><span>인건비</span><span>1,630</span><span>1,710</span><span>1,790</span></div><div class="tr"><b>남는 돈</b><i>1,120</i><i>1,290</i><i>1,410</i></div><div class="tr"><span>손익분기 날</span><span>19일</span><span>18일</span><span>17일</span></div><div class="nt" style="margin-top:12px">단위 만원 · 이번 달은 지금 속도로 계산한 월말 예상이에요.</div></div>`,
job:`<div class="bar"><b>⁺EV</b><span>9:41</span></div><div class="ti">구인</div><div class="seg"><span>긴급 (24시간)</span><span class="on">상시 아르바이트</span></div><label>제목</label><div class="ip">평일 저녁 딜러 2명</div><div class="g2"><div><label>시급</label><div class="ip">15,000</div></div><div><label>요일</label><div class="ip">월~목</div></div></div><label>지원자</label><div class="li"><div><b>정딜러</b><small>경력 2년 · 토너먼트 경험</small></div><em class="call">전화</em></div><div class="li"><div><b>한딜러</b><small>경력 1년 · 인근 거주</small></div><em class="call">전화</em></div><div class="go" style="background:#8FE3C4;color:#0B2A20">채용하기</div>`};
const T={dt:'근처 딜러 17명에게 대타 알림 발송',pay:'✓ QR 출퇴근 기록으로 급여 자동 계산',pl:'✓ 마감만 하면 매출·손익 자동 기록',job:'지원자 2명 도착 · 원탭 전화'};
const END=(tl)=>({bg:'bg3.png',hd:'옆 가게 사장님은 벌써 쓰는 앱',num:'<span class="ev"><sup>+</sup>EV</span>',tl,t:'end'});
const W=[
[1,[{bg:'bg0.png',hd:'딜러 한 명 펑크 나면',num:'-30만원',tl:'아직도 단톡방에 대타 구하세요?'},
 {bg:'bg1.png',hd:'단톡방 "대타 구해요"',num:'30분째',tl:'읽씹. 그 사이 테이블은 멈춰 있음'},
 {bg:'bg7.png',hd:'손님은 옆 가게로',t:'calc',rows:[['테이블 1개 정지','-20만'],['손님 이탈','-10만']],tot:['하룻밤','-30만원'],foot:'*테이블 1개 하룻밤 매출 기준 예시'},
 {bg:'bg8.png',pos:1,hd:'+EV 쓰면',num:'탭 3번',tl:'대타 끝. 단톡방 필요 없음',ph:'dt'},
 END('대타 · 급여 · 매출 한 번에')]],
[2,[{bg:'bg4.png',hd:'월급날 전날 밤, 엑셀',num:'3시간',tl:'딜러 급여, 아직도 손으로 계산?'},
 {bg:'g21.png',hd:'딜러 15명, 시급 다 다름',num:'1명만',tl:'틀려도 단톡방 난리 납니다'},
 {bg:'bg1.png',hd:'매달 버리는 시간',t:'calc',rows:[['출근 기록 맞추기','1시간'],['급여 계산','1.5시간'],['이체·명세서','0.5시간']],tot:['1년이면','36시간'],foot:'*딜러 15명 매장 기준 예시'},
 {bg:'bg8.png',pos:1,hd:'+EV 쓰면 급여는',num:'자동',tl:'QR 출근 찍으면 급여까지 끝',ph:'pay'},
 END('급여 · 대타 · 매출 한 번에')]],
[3,[{bg:'bg5.png',hd:'가게 내놨는데 권리금',num:'0원',tl:'매출 기록이 없어서 깎였습니다'},
 {bg:'g22.png',hd:'인수자 첫 질문',num:'월 매출?',tl:'"대충 이 정도요" 하면 협상 끝'},
 {bg:'g23.png',hd:'기록 없는 가게, 이렇게 깎인다',t:'calc',rows:[['매출 증빙 없음','권리금 ↓'],['운영 기록 없음','인수자 불안']],tot:['결국','헐값'],foot:'*가게 매도 협상 일반 사례'},
 {bg:'bg2.png',pos:1,hd:'+EV는 매일 쌓인다',num:'6개월',tl:'매출 · 인건비 · 남는 돈 자동 기록',ph:'pl'},
 END('기록이 곧 권리금')]],
[4,[{bg:'bg6.png',hd:'구인 글 20번 올렸는데',num:'0명',tl:'아직도 카톡방에서 딜러 구하세요?'},
 {bg:'g24.png',hd:'카톡방 구인 글 수명',num:'5분',tl:'금방 묻히고, 경력 확인도 안 됨'},
 {bg:'bg0.png',hd:'딜러 못 구한 3일',t:'calc',rows:[['1일차 테이블 정지','-30만'],['2일차 테이블 정지','-30만'],['3일차 테이블 정지','-30만']],tot:['3일','-90만원'],foot:'*테이블 1개 하룻밤 30만원 기준 예시'},
 {bg:'bg8.png',pos:1,hd:'+EV 구인 공고',num:'무료',tl:'근처 딜러에게 바로 알림',ph:'job'},
 END('구인 · 대타 · 급여 한 번에')]]];
let h='';
W.forEach(([n,ss])=>ss.forEach((s,i)=>{
 const id=`W${n}_${i+1}`;
 const body=s.t=='calc'?`<div class="hd">${s.hd}</div><div class="rows">${s.rows.map(r=>`<div><span>${r[0]}</span><b>${r[1]}</b></div>`).join('')}</div><div class="tot"><span>${s.tot[0]}</span><b>${s.tot[1]}</b></div><div class="ac">${s.foot}</div>`
  :`<div class="hd">${s.hd}</div><div class="num">${s.num}</div><div class="tl">${s.tl}</div>${s.t=='end'?`<div class="cta">첫 달 무료 · plusevapp.kr  →</div>`:''}`;
 h+=`<div class="c${s.pos?' pos':''}${s.t=='end'?' end':''}" id="${id}" style="background-image:url(${s.bg})">${s.ph?`<div class="ph"><div class="sc">${P[s.ph]}</div><div class="toast">${T[s.ph]}</div></div>`:''}<div class="in"><div class="top"><span class="pill">홀덤펍 사장님 썰 · ${n}</span><span class="pg">${i+1}/5</span></div>${body}</div><div class="dots">${[0,1,2,3,4].map(j=>`<i class="${j==i?'on':''}"></i>`).join('')}</div></div>`;
}));
document.body.innerHTML=h;
