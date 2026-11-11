export function parseProducts(payload) {
  if (!Array.isArray(payload) && payload?.success === false) throw new TypeError('Supplier rejected catalogue request');
  const rows = Array.isArray(payload) ? payload : payload?.data ?? payload?.products;
  if (!Array.isArray(rows)) throw new TypeError('Supplier products must be an array');
  if (!Array.isArray(payload) && Number.isInteger(payload?.count) && payload.count !== rows.length) throw new TypeError('Supplier catalogue count did not match');
  const seen = new Set();
  return rows.map((row) => {
    if (!row || (typeof row.id !== 'string' && typeof row.id !== 'number') || !String(row.id).trim() || String(row.id).length>128 || typeof row.name !== 'string' || !row.name.trim()) throw new TypeError('Supplier product is missing identity');
    const id = String(row.id); if (seen.has(id)) throw new TypeError('Supplier returned duplicate product IDs'); seen.add(id);
    const unlimited = row.is_unlimited === true || row.is_unlimited === 1 || row.is_unlimited === 'true';
    const requiresEmail = row.requires_email === true || row.requires_email === 1 || row.requires_email === 'true';
    const costUsdt = String(row.your_cost); const cost = Number(costUsdt); const stock = Number(row.stock_quantity ?? row.stock ?? row.quantity);
    if (!/^\d{1,10}(\.\d{1,6})?$/.test(costUsdt) || !Number.isFinite(cost) || cost <= 0 || cost>1000000000 || (!unlimited && (!Number.isSafeInteger(stock) || stock < 0 || stock>10000000))) throw new TypeError(`Supplier product ${id} has invalid pricing or stock`);
    const variants = Array.isArray(row.variants) ? row.variants.map((variant) => {
      if (!variant || (typeof variant.id !== 'string' && typeof variant.id !== 'number') || !String(variant.id).trim() || typeof variant.name !== 'string' || !variant.name.trim()) throw new TypeError(`Supplier product ${id} has invalid variants`);
      const variantCost = String(variant.your_cost);
      const variantUnlimited = variant.is_unlimited === true || variant.is_unlimited === 1 || variant.is_unlimited === 'true';
      const variantStock = Number(variant.stock_quantity ?? variant.stock ?? variant.quantity);
      if (!/^\d{1,10}(\.\d{1,6})?$/.test(variantCost) || !Number.isFinite(Number(variantCost)) || Number(variantCost) <= 0 || (!variantUnlimited && (!Number.isSafeInteger(variantStock) || variantStock < 0))) throw new TypeError(`Supplier product ${id} has invalid variant pricing or stock`);
      return { id: String(variant.id).slice(0,128), name: variant.name.trim().slice(0,180), costUsdt: variantCost, stock: variantUnlimited ? null : variantStock, unlimited: variantUnlimited };
    }) : [];
    if (variants.length > 50 || new Set(variants.map((variant) => variant.id)).size !== variants.length) throw new TypeError(`Supplier product ${id} has duplicate or excessive variants`);
    const imageUrl = typeof row.image_url === 'string' ? row.image_url : typeof row.image === 'string' ? row.image : null;
    if (imageUrl) { let parsed; try { parsed = new URL(imageUrl); } catch { throw new TypeError(`Supplier product ${id} has invalid image URL`); } if (parsed.protocol !== 'https:') throw new TypeError(`Supplier product ${id} has unsafe image URL`); }
    return { id, name: row.name.trim().slice(0,180), description: typeof row.description === 'string' ? row.description.slice(0, 5000) : '', costUsdt, stock: unlimited ? null : Math.floor(stock), unlimited, duration: typeof row.duration === 'string' ? row.duration.slice(0, 120) : null, requiresEmail, type: String(row.type ?? row.category ?? 'Digital product').slice(0, 120), imageUrl, variants };
  });
}

export async function supplierRequest(path, { env, method = 'GET', body, fetchImpl = fetch, attempts = 3 } = {}) {
  if (!env.AITOOLSHOP_API_KEY) throw new Error('Supplier credentials are not configured');
  if (method !== 'GET' && !body?.idempotency_key) attempts = 1;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetchImpl(`https://aitoolshop.aitoolifystudio.io/api/reseller/v1${path}`, { method, headers: { Authorization: `Bearer ${env.AITOOLSHOP_API_KEY}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: controller.signal });
      if (!response.ok) { const error=new Error(response.status<500&&response.status!==429?`Supplier request failed (${response.status})`:`Supplier temporary failure (${response.status})`);error.retryable=response.status>=500||response.status===429;throw error; }
      return await response.json();
    } catch (error) { lastError = error; if (error?.retryable===false) break; if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 150 * (2 ** attempt))); }
    finally { clearTimeout(timeout); }
  }
  throw lastError;
}
