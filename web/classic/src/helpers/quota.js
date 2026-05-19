import { getCurrencyConfig } from './render';

export const getQuotaPerUnit = () => {
  const raw = parseFloat(localStorage.getItem('quota_per_unit') || '1');
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
};

export const quotaToDisplayAmount = (quota) => {
  const q = Number(quota || 0);
  if (!Number.isFinite(q) || q === 0) return 0;
  const sign = Math.sign(q);
  const abs = Math.abs(q);
  const { type, rate } = getCurrencyConfig();
  if (type === 'TOKENS') return q;
  const usd = abs / getQuotaPerUnit();
  if (type === 'USD') return sign * usd;
  return sign * usd * (rate || 1);
};

export const displayAmountToQuota = (amount) => {
  const val = Number(amount || 0);
  if (!Number.isFinite(val) || val === 0) return 0;
  const sign = Math.sign(val);
  const abs = Math.abs(val);
  const { type, rate } = getCurrencyConfig();
  if (type === 'TOKENS') return Math.round(val);
  const usd = type === 'USD' ? abs : abs / (rate || 1);
  return sign * Math.round(usd * getQuotaPerUnit());
};
