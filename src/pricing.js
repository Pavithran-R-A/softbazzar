export const MARKUP_BPS = 12500;
const SCALE = 1_000_000n;
function scaled(value) {
  const str = String(value);
  if (!/^\d+(\.\d{1,6})?$/.test(str)) throw new TypeError('Invalid decimal value');
  const [whole, fraction = ''] = str.split('.');
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, '0'));
}
function divideRound(numerator, denominator) { return (numerator + denominator / 2n) / denominator; }

export function priceProduct(costUsdt, fx) {
  const cost = scaled(costUsdt);
  const inr = scaled(fx?.usdtInr);
  const usd = scaled(fx?.usdtUsd);
  const updatedAt = Date.parse(fx?.updatedAt || '');
  if (cost <= 0n || inr <= 0n || usd <= 0n || !Number.isFinite(updatedAt)) throw new TypeError('Invalid product cost or FX snapshot');
  const sellMicros = divideRound(cost * BigInt(MARKUP_BPS), 10000n);
  const priceInrPaise = Number(divideRound(sellMicros * inr * 100n, SCALE * SCALE));
  const priceUsdCents = Number(divideRound(sellMicros * usd * 100n, SCALE * SCALE));
  return Object.freeze({ sellUsdt: Number(sellMicros) / Number(SCALE), priceInrPaise, priceUsd: priceUsdCents / 100, fxUpdatedAt: new Date(updatedAt).toISOString() });
}
