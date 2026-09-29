// 전자 서류: 근로계약서 · 급여명세서 — 본문 만들기 + 손서명 패드
// 본문은 서명 시점 그대로 서버에 스냅샷 저장(sha256)되고, 이후엔 바뀌지 않아요.
const W = n => Number(n || 0).toLocaleString('ko-KR');

export function laborBody(t) {
  return [
    `${t.company_name}(이하 "사업주")과 ${t.employee_name}(이하 "근로자")은 다음과 같이 근로계약을 체결한다.`,
    '',
    `1. 근로계약기간: ${t.start} 부터 ${t.end ? t.end + ' 까지' : '기간의 정함이 없음'}`,
    `2. 근무장소: ${t.place}`,
    `3. 업무내용: ${t.duty}`,
    `4. 근로일 및 근로시간: ${t.days} / ${t.time_from} ~ ${t.time_to} (휴게시간 ${t.break_min}분)`,
    `5. 임금`,
    `   - 시간급: ${W(t.hourly)}원`,
    `   - 야간근로(22:00~06:00) 가산: ${t.night ? '통상임금의 50% 가산 지급' : '해당 없음'}`,
    `   - 연장·휴일근로 가산 및 주휴수당: ${t.law ? '근로기준법에 따라 지급' : '해당 없음'}`,
    `   - 임금지급일: 매월 ${t.payday}일 (휴일인 경우 전일 지급)`,
    `   - 지급방법: 근로자 명의 예금통장에 입금${t.bank ? ` (${t.bank})` : ''}`,
    `6. 소득 신고·공제: ${t.contract === '4대' ? '4대 사회보험(국민연금·건강보험·고용보험·산재보험) 적용' : '사업소득 3.3% 원천징수'}`,
    `7. 연차유급휴가: 근로기준법에서 정하는 바에 따라 부여함`,
    `8. 근로계약서 교부: 사업주는 계약 체결과 동시에 본 계약서를 전자문서로 근로자에게 교부하며, 근로자는 언제든 +EV 앱에서 열람·출력할 수 있다.`,
    `9. 기타: 이 계약에 정함이 없는 사항은 근로기준법령에 의한다.`,
    t.extra ? `10. 특약: ${t.extra}` : null,
  ].filter(x => x != null).join('\n');
}

export function payslipBody(t) {
  const L = t.lines.map(([n, v]) => `   ${n.padEnd(8, ' ')} ${W(v).padStart(12, ' ')}원`).join('\n');
  return [
    `${t.company_name} · ${t.store_name}`,
    `성명: ${t.employee_name}   직책: ${t.role}   ${t.contract === '4대' ? '4대보험' : '3.3% 사업소득'}`,
    `귀속: ${t.period}   지급일: ${t.pay_date}`,
    `근무: ${t.days}일 · ${t.hours}시간 (시급 ${W(t.hourly)}원)`,
    '',
    '[지급 내역]',
    L,
    `   ${'지급총액'.padEnd(8, ' ')} ${W(t.gross).padStart(12, ' ')}원`,
    '',
    '[공제 내역]',
    `   ${(t.contract === '4대' ? '4대보험 근로자분' : '소득세 3.3%').padEnd(8, ' ')} ${('-' + W(t.ded)).padStart(12, ' ')}원`,
    '',
    `실지급액: ${W(t.net)}원`,
    t.bank ? `입금 계좌: ${t.bank}` : null,
    '',
    '계산 방법: 근무시간 = 스케줄 − 휴게, 야간 = 22~06시 × 시급 × 0.5, 연장 = 하루 8시간 초과 × 0.5, 주휴 = 주 15시간 이상인 주.',
  ].filter(x => x != null).join('\n');
}

// 손서명 패드 — canvas 하나에 붙이면 끝. isEmpty()/png()/clear()
export function sigPad(cv) {
  const r = window.devicePixelRatio || 1, box = cv.getBoundingClientRect();
  cv.width = Math.round(box.width * r); cv.height = Math.round(box.height * r);
  const g = cv.getContext('2d'); g.scale(r, r); g.lineWidth = 2.4; g.lineCap = g.lineJoin = 'round'; g.strokeStyle = '#111';
  let on = false, len = 0, last = null;
  const pt = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', e => { on = true; last = pt(e); cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (!on) return; const p = pt(e); g.beginPath(); g.moveTo(...last); g.lineTo(...p); g.stroke(); len += Math.hypot(p[0] - last[0], p[1] - last[1]); last = p; });
  const up = () => { on = false; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  return { isEmpty: () => len < 40, png: () => cv.toDataURL('image/png'), clear: () => { g.clearRect(0, 0, cv.width, cv.height); len = 0; } };
}
