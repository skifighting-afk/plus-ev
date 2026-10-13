export const hasCompanyPro = (company, now = Date.now()) => company?.plan === 'pro' && Date.parse(company.paid_until) > now;
export const nextAttendance = last => last?.kind === 'in' ? 'out' : 'in';
