export const MARKUP_BPS = 12500;
export const LOW_COST_MARKUP_BPS = 20000;
export const TWO_DIGIT_COST_MIN_INR = 10;
export const TWO_DIGIT_COST_MAX_INR = 100;
export const DEFAULT_USD_INR = '105';
const SCALE = 1_000_000n;

function scaled(value) {
  const text=String(value);
  if(!/^\d{1,10}(\.\d{1,6})?$/.test(text))throw new TypeError('Invalid decimal value');
  const [whole,fraction='']=text.split('.');
  return BigInt(whole)*SCALE+BigInt(fraction.padEnd(6,'0'));
}

function divideRound(numerator,denominator){return(numerator+denominator/2n)/denominator;}

export function priceProduct(costUsdt,usdInr=DEFAULT_USD_INR){
  const cost=scaled(costUsdt);
  const rate=scaled(usdInr);
  if(cost<=0n||rate<=0n)throw new TypeError('Invalid product cost or merchant rate');
  const costInrNumerator=cost*rate;
  const isTwoDigitInrCost=costInrNumerator>=BigInt(TWO_DIGIT_COST_MIN_INR)*SCALE*SCALE
    && costInrNumerator<BigInt(TWO_DIGIT_COST_MAX_INR)*SCALE*SCALE;
  const markupBps=isTwoDigitInrCost?LOW_COST_MARKUP_BPS:MARKUP_BPS;
  const usdNumerator=cost*BigInt(markupBps);
  const priceInrPaiseExact=divideRound(usdNumerator*rate*100n,10000n*SCALE*SCALE);
  const approximateUsdCentsExact=divideRound(priceInrPaiseExact*SCALE,rate);
  const priceInrPaise=Number(priceInrPaiseExact);
  const approximateUsdCents=Number(approximateUsdCentsExact);
  const sellingUsd=Number(usdNumerator)/Number(10000n*SCALE);
  if(!Number.isSafeInteger(priceInrPaise)||!Number.isSafeInteger(approximateUsdCents))throw new RangeError('price_out_of_range');
  return Object.freeze({
    sellUsdt:sellingUsd,
    sellingUsd,
    priceUsd:approximateUsdCents/100,
    priceInrPaise,
    usdInr:String(usdInr),
    markupBps,
  });
}
