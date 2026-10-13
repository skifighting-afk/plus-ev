import assert from 'node:assert/strict';
const qr = await import('./qr-attendance.js').catch(() => ({}));
assert.equal(typeof qr.attendanceCode, 'function', 'QR attendance parser exists');
assert.equal(qr.attendanceCode('https://plusevapp.kr/?att=012345','https://plusevapp.kr'),'012345');
for (const text of ['012345','https://evil.test/?att=012345','https://plusevapp.kr/?att=12345','https://plusevapp.kr/?att=1234567','https://plusevapp.kr/?att=<script>','javascript:alert(1)']) assert.equal(qr.attendanceCode(text,'https://plusevapp.kr'),null);
assert.equal(qr.attendanceCode('http://localhost:8766/?att=123456','http://localhost:8766'),'123456');
console.log('QR attendance: own-origin six-digit QR only; malformed and external codes rejected');
