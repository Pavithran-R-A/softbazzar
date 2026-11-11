export const MARKUP_BPS = 12500;
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
  const usdNumerator=cost*BigInt(MARKUP_BPS);
  const priceInrPaise=Number(divideRound(usdNumerator*rate*100n,10000n*SCALE*SCALE));
  const sellingUsd=Number(usdNumerator)/Number(10000n*SCALE);
  if(!Number.isSafeInteger(priceInrPaise))throw new RangeError('price_out_of_range');
  return Object.freeze({
    sellUsdt:sellingUsd,
    sellingUsd,
    priceUsd:Math.round(sellingUsd*100)/100,
    priceInrPaise,
    usdInr:String(usdInr),
  });
}
