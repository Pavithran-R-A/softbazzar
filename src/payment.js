const encoder = new TextEncoder();

function toHex(bytes) { return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join(''); }
function fixedEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export async function verifyYoupiWebhook({ rawBody, signatureV1, signatureV2, signature, timestamp, secret, now = Date.now() }) {
  const sentAt = Number(timestamp);
  if (!secret || !Number.isSafeInteger(sentAt) || Math.abs(now - sentAt) > 3600000) throw new Error('stale_or_missing_signature');
  const v1 = signatureV1 ?? signature;
  const v2 = signatureV2;
  if (![v1, v2].some((candidate) => typeof candidate === 'string' && /^sha256=[a-f0-9]{64}$/i.test(candidate))) throw new Error('invalid_signature');
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expectedV1 = `sha256=${toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody)))}`;
  const expectedV2 = `sha256=${toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`)))}`;
  const validV1 = typeof v1 === 'string' && fixedEqual(v1.toLowerCase(), expectedV1);
  const validV2 = typeof v2 === 'string' && fixedEqual(v2.toLowerCase(), expectedV2);
  if (!validV1 && !validV2) throw new Error('invalid_signature');
  let event;
  try { event = JSON.parse(rawBody); } catch { throw new Error('invalid_payload'); }
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('invalid_payload');
  return event;
}

