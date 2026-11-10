const encoder = new TextEncoder();

function toHex(bytes) { return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join(''); }
function fixedEqual(left, right) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

export async function verifyYoupiWebhook({ rawBody, signature, timestamp, secret, now = Date.now() }) {
  const sentAt = Number(timestamp);
  if (!secret || !Number.isFinite(sentAt) || Math.abs(now - sentAt) > 300000) throw new Error('stale_or_missing_signature');
  if (typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/i.test(signature)) throw new Error('invalid_signature');
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = `sha256=${toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`)))}`;
  if (!fixedEqual(signature.toLowerCase(), expected)) throw new Error('invalid_signature');
  let event;
  try { event = JSON.parse(rawBody); } catch { throw new Error('invalid_payload'); }
  if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('invalid_payload');
  return event;
}

