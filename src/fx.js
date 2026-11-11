const SOURCE_URL = 'https://api.coingecko.com/api/v3/simple/price';
const MAX_AGE_MS = 15 * 60 * 1000;

function validRate(value, maximum) {
  return (typeof value === 'number' || typeof value === 'string') &&
    /^\d{1,5}(\.\d{1,6})?$/.test(String(value)) &&
    Number.isFinite(Number(value)) && Number(value) >= 0.01 && Number(value) <= maximum;
}

async function recordFailure(env, code, now) {
  await env.DB.prepare("INSERT INTO fx_rate_history(usdt_inr,usdt_usd,source_url,observed_at,status,error_code) VALUES(NULL,NULL,?,?, 'failed',?)")
    .bind(SOURCE_URL, now, code).run();
  return { error: code };
}

export async function refreshFx(env, fetchImpl = fetch, nowMs = Date.now()) {
  const now = new Date(nowMs).toISOString();
  const recent = await env.DB.prepare('SELECT observed_at,status FROM fx_rate_history ORDER BY id DESC LIMIT 1').first();
  const recentAt = Date.parse(recent?.observed_at || '');
  if (env.FX_API_KEY && recent?.status === 'success' && Number.isFinite(recentAt) && nowMs - recentAt < 5 * 60 * 1000) return { skipped:true,reason:'rate_recent' };
  if (!env.FX_API_KEY) {
    if (recent?.status === 'failed' && Number.isFinite(recentAt) && nowMs - recentAt < 10 * 60 * 1000) return { skipped:true,reason:'provider_not_configured' };
    return recordFailure(env, 'provider_not_configured', now);
  }
  let response;
  try {
    const url = new URL(SOURCE_URL);
    url.search = new URLSearchParams({ ids: 'tether', vs_currencies: 'inr,usd', include_last_updated_at: 'true' }).toString();
    response = await fetchImpl(url, { headers: { 'x-cg-pro-api-key': env.FX_API_KEY }, signal: AbortSignal.timeout(8000) });
  } catch { return recordFailure(env, 'provider_unavailable', now); }
  if (!response.ok) return recordFailure(env, 'provider_http_error', now);
  let payload;
  try { payload = await response.json(); } catch { return recordFailure(env, 'invalid_provider_payload', now); }
  const quote = payload?.tether;
  const updatedAtMs = Number(quote?.last_updated_at) * 1000;
  if (!validRate(quote?.inr, 10000) || !validRate(quote?.usd, 100) ||
      Number(quote?.usd) < 0.8 || Number(quote?.usd) > 1.2 ||
      !Number.isFinite(updatedAtMs) || updatedAtMs > nowMs + 120000 || nowMs - updatedAtMs > MAX_AGE_MS) {
    return recordFailure(env, 'invalid_or_stale_rates', now);
  }
  const updatedAt = new Date(updatedAtMs).toISOString();
  const statements = [
    env.DB.prepare('INSERT INTO fx_rates(id,usdt_inr,usdt_usd,updated_at,updated_by,source_url) VALUES(1,?,?,?,\'coingecko\',?) ON CONFLICT(id) DO UPDATE SET usdt_inr=excluded.usdt_inr,usdt_usd=excluded.usdt_usd,updated_at=excluded.updated_at,updated_by=excluded.updated_by,source_url=excluded.source_url')
      .bind(String(quote.inr), String(quote.usd), updatedAt, SOURCE_URL),
    env.DB.prepare("INSERT INTO fx_rate_history(usdt_inr,usdt_usd,source_url,observed_at,status,error_code) VALUES(?,?,?,?,'success',NULL)")
      .bind(String(quote.inr), String(quote.usd), SOURCE_URL, now),
  ];
  await env.DB.batch(statements);
  return { updated: true, updatedAt, source: 'coingecko' };
}

export const FX_MAX_AGE_MS = MAX_AGE_MS;
