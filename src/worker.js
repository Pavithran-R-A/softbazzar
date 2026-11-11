import { priceProduct, DEFAULT_USD_INR } from './pricing.js';
import { verifyYoupiWebhook } from './payment.js';
import { parseProducts, supplierRequest } from './supplier.js';
import { reconcileCatalogue } from './catalogue-sync.js';

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options':'DENY', 'X-Robots-Tag':'noindex, nofollow', 'Referrer-Policy':'strict-origin-when-cross-origin', 'Permissions-Policy':'camera=(), microphone=(), geolocation=()', 'Strict-Transport-Security':'max-age=31536000; includeSubDomains' } });
function secure(response, env) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options','nosniff'); headers.set('X-Frame-Options','DENY'); headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()'); headers.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://api.fontshare.com https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com https://cdn.fontshare.com; img-src 'self' data: https:; media-src 'self' https://d8j0ntlcm91z4.cloudfront.net; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  if(env?.STAGING_ENV==='true')headers.set('X-Robots-Tag','noindex, nofollow');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
async function readLimitedBytes(request, maxBytes=16384) {
  const length=Number(request.headers.get('Content-Length')||0);if(length>maxBytes)throw new RangeError('payload_too_large');
  const reader=request.body?.getReader();if(!reader)throw new SyntaxError('empty_body');const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new RangeError('payload_too_large');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return bytes;
}
async function readJsonLimited(request, maxBytes=16384) {
  const bytes=await readLimitedBytes(request,maxBytes);
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
function validEmail(value) { return typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
async function sha256Hex(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',value))].map((byte)=>byte.toString(16).padStart(2,'0')).join('');}
const safeEqual = (a, b) => { if (!a || !b || a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; };

export async function synchronize(env, fetchImpl = fetch) {
  const started = new Date().toISOString(); let runId;
  if(!env.AITOOLSHOP_API_KEY){
    try { await env.DB.prepare("INSERT INTO sync_runs(started_at,finished_at,status,error_code) VALUES(?,?, 'skipped','supplier_not_configured')").bind(started,started).run(); } catch (error) { console.error(JSON.stringify({event:'sync_skip_log_failed',code:String(error?.message||'db_error').slice(0,80)})); }
    console.info(JSON.stringify({event:'catalogue_sync_skipped',reason:'supplier_not_configured'}));
    return {skipped:true,reason:'supplier_not_configured'};
  }
  try { runId = (await env.DB.prepare("INSERT INTO sync_runs(started_at,status) VALUES (?, 'running') RETURNING id").bind(started).first()).id; }
  catch {
    const staleLock = await env.DB.prepare("SELECT id FROM sync_runs WHERE status='running' AND started_at < ? LIMIT 1").bind(new Date(Date.now()-10*60000).toISOString()).first();
    if (!staleLock) return { skipped: true, reason: 'sync_already_running' };
    await env.DB.prepare("UPDATE sync_runs SET status='failed',finished_at=?,error_code='stale_lock' WHERE id=? AND status='running'").bind(started,staleLock.id).run();
    try { runId = (await env.DB.prepare("INSERT INTO sync_runs(started_at,status) VALUES (?, 'running') RETURNING id").bind(started).first()).id; }
    catch { return { skipped: true, reason: 'sync_already_running' }; }
  }
  try {
    const products = parseProducts(await supplierRequest('/products', { env, fetchImpl }));
    if (!products.length) throw new Error('empty_supplier_catalogue');
    const existingRows = await env.DB.prepare('SELECT p.supplier_id,p.name,p.description,p.cost_usdt,p.stock,p.is_unlimited,p.duration,p.requires_email,p.type,p.active,p.variants_json,pp.image_url FROM products p LEFT JOIN product_presentation pp ON pp.supplier_id=p.supplier_id').all();
    const plan = reconcileCatalogue(existingRows.results, products);
    const stmts = products.flatMap((p) => [
      env.DB.prepare(`INSERT INTO products(supplier_id,name,description,cost_usdt,stock,is_unlimited,duration,requires_email,type,active,updated_at,variants_json) VALUES(?,?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(supplier_id) DO UPDATE SET name=excluded.name,description=excluded.description,cost_usdt=excluded.cost_usdt,stock=excluded.stock,is_unlimited=excluded.is_unlimited,duration=excluded.duration,requires_email=excluded.requires_email,type=excluded.type,active=1,updated_at=excluded.updated_at,variants_json=excluded.variants_json`).bind(p.id,p.name,p.description,String(p.costUsdt),p.stock,p.unlimited?1:0,p.duration,p.requiresEmail?1:0,p.type,started,JSON.stringify(p.variants)),
      env.DB.prepare('INSERT INTO product_presentation(supplier_id,category,image_url) VALUES(?,?,?) ON CONFLICT(supplier_id) DO UPDATE SET category=excluded.category,image_url=excluded.image_url').bind(p.id,p.type,p.imageUrl),
    ]);
    for (const p of plan.changed) stmts.push(env.DB.prepare('INSERT INTO stock_snapshots(supplier_id,stock,is_unlimited,observed_at) VALUES(?,?,?,?)').bind(p.id,p.stock,p.unlimited?1:0,started));
    for (const id of plan.removed) stmts.push(env.DB.prepare('UPDATE products SET active=0,updated_at=? WHERE supplier_id=?').bind(started,id));
    stmts.push(env.DB.prepare("UPDATE sync_runs SET finished_at=?,status='success',imported=?,updated=? WHERE id=?").bind(new Date().toISOString(),plan.imported,plan.updated,runId));
    await env.DB.batch(stmts);
    return { imported: plan.imported, updated: plan.updated, removed: plan.removed.length };
  } catch (error) {
    await env.DB.prepare("UPDATE sync_runs SET finished_at=?,status='failed',error_code=? WHERE id=?").bind(new Date().toISOString(),String(error?.message||'sync_failed').slice(0,80),runId).run();
    console.error(JSON.stringify({ event:'catalogue_sync_failed', code:String(error?.message||'sync_failed').slice(0,80) })); return { error:'sync_failed' };
  }
}

async function publicCatalogue(env) {
  const [rows, pricing, latest] = await Promise.all([
    env.DB.prepare('SELECT p.supplier_id,p.name,p.description,p.cost_usdt,p.stock,p.is_unlimited,p.duration,p.requires_email,p.type,p.variants_json,pp.category,pp.image_url FROM products p LEFT JOIN product_presentation pp ON pp.supplier_id=p.supplier_id WHERE p.active=1 ORDER BY p.name').all(),
    env.DB.prepare('SELECT usd_inr,updated_at FROM merchant_pricing_settings WHERE id=1').first(),
    env.DB.prepare("SELECT finished_at FROM sync_runs WHERE status='success' ORDER BY id DESC LIMIT 1").first(),
  ]);
  const staleMs = Number(env.STALE_CATALOGUE_MINUTES||10)*60000; const syncAt = Date.parse(latest?.finished_at||''); const stale = !Number.isFinite(syncAt)||Date.now()-syncAt>staleMs;
  const usdInr=pricing?.usd_inr||DEFAULT_USD_INR;
  const products = rows.results.map((row) => {
    const priced=priceProduct(row.cost_usdt,usdInr);
    const variants = JSON.parse(row.variants_json||'[]').map((variant)=>{const variantPrice=priceProduct(variant.costUsdt,usdInr);return{id:variant.id,name:variant.name,inStock:Boolean(variant.unlimited)||variant.stock>0,stock:variant.unlimited?null:variant.stock,unlimited:variant.unlimited,priceInrPaise:variantPrice.priceInrPaise,priceUsd:variantPrice.priceUsd};});
    const hasVariantInventory=variants.length>0;
    return {id:row.supplier_id,name:row.name,desc:row.description,cat:row.category||row.type,type:row.type,duration:row.duration,requiresEmail:Boolean(row.requires_email),inStock:hasVariantInventory?variants.some((variant)=>variant.inStock):Boolean(row.is_unlimited)||row.stock>0,stock:row.is_unlimited?null:row.stock,unlimited:Boolean(row.is_unlimited),sellingUsdt:priced.sellUsdt,sellingUsd:priced.sellingUsd,priceNum:priced.priceInrPaise/100,priceInrPaise:priced.priceInrPaise,priceUsd:priced.priceUsd,usdInr,image:row.image_url,variants};
  });
  return {products,count:products.length,lastSyncAt:latest?.finished_at||null,pricing:{usdInr,updatedAt:pricing?.updated_at||null},stale,purchasable:!stale};
}

export default {
  async scheduled(_event,env,ctx){ctx.waitUntil(synchronize(env));},
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/api/health'&&request.method==='GET')return json({ok:true,supplierConfigured:Boolean(env.AITOOLSHOP_API_KEY),youpiConfigured:Boolean(env.YOUPI_GATEWAY_URL&&env.YOUPI_MERCHANT_ID&&env.YOUPI_MERCHANT_API_KEY),livePaymentsEnabled:false,supplierPurchasesEnabled:false});
    if(env.STAGING_ENV==='true'&&url.pathname==='/robots.txt'&&request.method==='GET')return secure(new Response('User-agent: *\nDisallow: /\n',{headers:{'Content-Type':'text/plain; charset=utf-8'}}),env);
    if(env.STAGING_ENV==='true'&&url.pathname==='/sitemap.xml'&&request.method==='GET')return secure(new Response('',{status:404,headers:{'Content-Type':'application/xml; charset=utf-8'}}),env);
    if(url.pathname==='/api/catalogue'&&request.method==='GET'){try{return json(await publicCatalogue(env));}catch{return json({error:'catalogue_unavailable'},503);}}
    const orderStatusMatch=url.pathname.match(/^\/api\/orders\/([0-9a-f-]{36})$/i);
    if(orderStatusMatch&&request.method==='GET'){
      const order=await env.DB.prepare('SELECT id,status,currency,total_paise,merchant_usd_inr,created_at,updated_at FROM orders WHERE id=?').bind(orderStatusMatch[1]).first();
      if(!order)return json({error:'order_not_found'},404);
      const lines=await env.DB.prepare('SELECT ol.name_snapshot,ol.quantity,ol.unit_price_paise,ps.approx_usd_cents FROM order_lines ol LEFT JOIN pricing_snapshots ps ON ps.order_line_id=ol.id WHERE ol.order_id=?').bind(order.id).all();
      const approxUsdTotalCents=lines.results.reduce((sum,line)=>sum+(line.approx_usd_cents||0)*line.quantity,0);
      return json({order:{id:order.id,status:order.status,currency:order.currency,totalPaise:order.total_paise,approxUsdTotalCents,merchantUsdInr:order.merchant_usd_inr||DEFAULT_USD_INR,createdAt:order.created_at,updatedAt:order.updated_at,items:lines.results.map((line)=>({name:line.name_snapshot,quantity:line.quantity,unitPricePaise:line.unit_price_paise,approxUsdCents:line.approx_usd_cents}))}});
    }
    if(url.pathname==='/api/orders'&&request.method==='POST'){
      if(request.headers.get('Origin')!==url.origin)return json({error:'origin_rejected'},403);
      if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return json({error:'json_required'},415);
      const idempotencyKey=request.headers.get('Idempotency-Key')||'';if(!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey))return json({error:'idempotency_key_required'},400);
      let input;try{input=await readJsonLimited(request);}catch(error){return json({error:error instanceof RangeError?'payload_too_large':'invalid_json'},error instanceof RangeError?413:400);}
      if(!input||typeof input!=='object'||Array.isArray(input))return json({error:'invalid_items'},400);
      if(!Array.isArray(input.items)||input.items.length<1||input.items.length>20)return json({error:'invalid_items'},400);
      const requested=new Map();for(const item of input.items){if(!item||typeof item.productId!=='string'||!item.productId.trim()||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>99||(item.variantId!==undefined&&(typeof item.variantId!=='string'||item.variantId.length>128)))return json({error:'invalid_items'},400);const variantId=item.variantId||'';const key=`${item.productId}\u0000${variantId}`;requested.set(key,{productId:item.productId,variantId,quantity:(requested.get(key)?.quantity||0)+item.quantity});}
      if([...requested.values()].some((item)=>item.quantity>99))return json({error:'invalid_quantity'},400);
      const email=input.customerEmail?String(input.customerEmail).trim():'';if(email&&!validEmail(email))return json({error:'invalid_email'},400);
      const normalizedItems=[...requested.values()].map((item)=>item.variantId?[item.productId,item.variantId,item.quantity]:[item.productId,item.quantity]).sort((left,right)=>JSON.stringify(left).localeCompare(JSON.stringify(right)));
      const requestHash=await sha256Hex(new TextEncoder().encode(JSON.stringify({email,items:normalizedItems})));
      const existing=await env.DB.prepare("SELECT o.id,o.status,o.total_paise,o.quote_expires_at,o.request_hash,o.merchant_usd_inr,COALESCE((SELECT SUM(ps.approx_usd_cents*ol.quantity) FROM order_lines ol JOIN pricing_snapshots ps ON ps.order_line_id=ol.id WHERE ol.order_id=o.id),0) AS approx_usd_total_cents FROM orders o WHERE o.idempotency_key=?").bind(idempotencyKey).first();
      if(existing){if(existing.request_hash!==requestHash)return json({error:'idempotency_conflict'},409);if(existing.status==='quoted'&&Date.parse(existing.quote_expires_at)<=Date.now()){await env.DB.prepare("UPDATE orders SET status='cancelled',updated_at=? WHERE id=? AND status='quoted'").bind(new Date().toISOString(),existing.id).run();return json({error:'quote_expired'},410);}return json({orderId:existing.id,status:existing.status,totalPaise:existing.total_paise,approxUsdTotalCents:existing.approx_usd_total_cents||null,merchantUsdInr:existing.merchant_usd_inr||DEFAULT_USD_INR,expiresAt:existing.quote_expires_at});}
      const catalogue=await publicCatalogue(env);if(!catalogue.purchasable)return json({error:'catalogue_stale'},503);
      const pricing=await env.DB.prepare('SELECT usd_inr,updated_at FROM merchant_pricing_settings WHERE id=1').first();if(!pricing)return json({error:'pricing_unavailable'},503);
      const ids=[...new Set([...requested.values()].map((item)=>item.productId))];const sqlIds=ids.map(()=>'?').join(',');
      const rows=await env.DB.prepare(`SELECT p.supplier_id,p.name,p.cost_usdt,p.stock,p.is_unlimited,p.requires_email,p.variants_json FROM products p WHERE p.active=1 AND p.supplier_id IN (${sqlIds})`).bind(...ids).all();
      if(rows.results.length!==ids.length)return json({error:'product_unavailable'},409);
      const rowMap=new Map(rows.results.map((row)=>[row.supplier_id,row]));
      for(const item of requested.values()){const row=rowMap.get(item.productId);const variants=JSON.parse(row.variants_json||'[]');if(variants.length&&!item.variantId)return json({error:'variant_required'},400);if(item.variantId){const variant=variants.find((entry)=>entry.id===item.variantId);if(!variant)return json({error:'variant_unavailable'},409);if(!variant.unlimited&&variant.stock<item.quantity)return json({error:'insufficient_stock'},409);if(!/^\d{1,5}(\.\d{1,6})?$/.test(String(variant.costUsdt))||Number(variant.costUsdt)<=0)return json({error:'variant_price_unavailable'},409);}else if(!row.is_unlimited&&row.stock<item.quantity)return json({error:'insufficient_stock'},409);}
      if(rows.results.some((row)=>row.requires_email)&&!email)return json({error:'customer_email_required'},400);
      const orderId=crypto.randomUUID();const now=new Date().toISOString();const expiresAt=new Date(Date.now()+5*60000).toISOString();let totalPaise=0;let approxUsdTotalCents=0;
      const lines=[...requested.values()].map((item)=>{const row=rowMap.get(item.productId);const variant=item.variantId?JSON.parse(row.variants_json||'[]').find((entry)=>entry.id===item.variantId):null;const cost=variant?.costUsdt||row.cost_usdt;const price=priceProduct(cost,pricing.usd_inr);const lineTotal=price.priceInrPaise*item.quantity;const lineUsdCents=Math.round(price.priceUsd*100)*item.quantity;if(!Number.isSafeInteger(lineTotal)||!Number.isSafeInteger(lineUsdCents))throw new RangeError('quote_total_invalid');totalPaise+=lineTotal;approxUsdTotalCents+=lineUsdCents;return{row,variant,quantity:item.quantity,price,cost,lineId:crypto.randomUUID()};});
      if(!Number.isSafeInteger(totalPaise)||totalPaise<=0)return json({error:'quote_total_invalid'},400);
      const stmts=[env.DB.prepare('DELETE FROM quote_stock_reservations WHERE expires_at<=?').bind(now),env.DB.prepare("INSERT INTO orders(id,idempotency_key,request_hash,status,customer_email,currency,total_paise,fx_usdt_inr,fx_usdt_usd,quote_expires_at,created_at,updated_at,merchant_usd_inr) VALUES(?,?,?,'quoted',?,'INR',?,?,?,?,?,?,?)").bind(orderId,idempotencyKey,requestHash,email||null,totalPaise,pricing.usd_inr,'1',expiresAt,now,now,pricing.usd_inr)];
      for(const line of lines){stmts.push(env.DB.prepare('INSERT INTO order_lines(id,order_id,supplier_product_id,name_snapshot,quantity,unit_price_paise,supplier_cost_usdt,supplier_idempotency_key,supplier_variant_id) VALUES(?,?,?,?,?,?,?,?,?)').bind(line.lineId,orderId,line.row.supplier_id,line.variant?`${line.row.name} — ${line.variant.name}`:line.row.name,line.quantity,line.price.priceInrPaise,String(line.cost),`softbazzar-${line.lineId}`,line.variant?.id||null));stmts.push(env.DB.prepare('INSERT INTO pricing_snapshots(order_line_id,selling_usdt,fx_usdt_inr,fx_usdt_usd,quote_fx_updated_at,unit_price_paise,approx_usd_cents,created_at,merchant_usd_inr) VALUES(?,?,?,?,?,?,?,?,?)').bind(line.lineId,String(line.price.sellUsdt),pricing.usd_inr,'1',pricing.updated_at,line.price.priceInrPaise,Math.round(line.price.priceUsd*100),now,pricing.usd_inr));stmts.push(env.DB.prepare('INSERT INTO quote_stock_reservations(order_line_id,order_id,supplier_id,variant_id,quantity,expires_at) VALUES(?,?,?,?,?,?)').bind(line.lineId,orderId,line.row.supplier_id,line.variant?.id||'',line.quantity,expiresAt));}
      try{await env.DB.batch(stmts);}catch(error){if(String(error?.message||'').includes('quote_stock_unavailable'))return json({error:'insufficient_stock'},409);const duplicate=await env.DB.prepare("SELECT o.id,o.status,o.total_paise,o.quote_expires_at,o.merchant_usd_inr,COALESCE((SELECT SUM(ps.approx_usd_cents*ol.quantity) FROM order_lines ol JOIN pricing_snapshots ps ON ps.order_line_id=ol.id WHERE ol.order_id=o.id),0) AS approx_usd_total_cents FROM orders o WHERE o.idempotency_key=?").bind(idempotencyKey).first();if(duplicate)return json({orderId:duplicate.id,status:duplicate.status,totalPaise:duplicate.total_paise,approxUsdTotalCents:duplicate.approx_usd_total_cents||null,merchantUsdInr:duplicate.merchant_usd_inr||DEFAULT_USD_INR,expiresAt:duplicate.quote_expires_at});throw error;}
      return json({orderId,status:'quoted',currency:'INR',totalPaise,approxUsdTotalCents,merchantUsdInr:pricing.usd_inr,expiresAt},201);
    }
    if(/^\/api\/orders\/[^/]+\/payments$/.test(url.pathname)&&request.method==='POST')return json({error:'payments_disabled'},503);
    if(url.pathname==='/api/webhooks/youpi'&&request.method==='POST'){
      if(!env.YOUPI_WEBHOOK_SECRET)return json({error:'webhook_unavailable'},503);
      const length=Number(request.headers.get('Content-Length')||0);if(length>65536)return json({error:'payload_too_large'},413);
      let rawBytes;try{rawBytes=await readLimitedBytes(request,65536);}catch(error){return json({error:error instanceof RangeError?'payload_too_large':'invalid_webhook_body'},error instanceof RangeError?413:400);}
      const timestamp=request.headers.get('X-Gateway-Timestamp')||'';const delivery=request.headers.get('X-Gateway-Delivery-Id')||'';const headerEvent=request.headers.get('X-Gateway-Event')||'';
      if(!/^[0-9]{13}$/.test(timestamp)||!/^[A-Za-z0-9-]{8,80}$/.test(delivery))return json({error:'invalid_webhook_headers'},400);
      let rawBody;try{rawBody=new TextDecoder('utf-8',{fatal:true}).decode(rawBytes);}catch{return json({error:'invalid_webhook_body'},400);}
      let event;try{event=await verifyYoupiWebhook({rawBody,signatureV1:request.headers.get('X-Gateway-Signature')||'',signatureV2:request.headers.get('X-Gateway-Signature-V2')||'',timestamp,secret:env.YOUPI_WEBHOOK_SECRET});}catch{return json({error:'invalid_webhook_signature'},401);}
      if(event.deliveryId!==delivery||(event.timestamp!==undefined&&String(event.timestamp)!==timestamp)||event.event!==headerEvent||event.method!=='UPI'||typeof event.orderId!=='string'||typeof event.paymentId!=='string'||!Number.isSafeInteger(event.amountPaise))return json({error:'invalid_webhook_payload'},400);
      const bodyHash=await sha256Hex(rawBytes);
      const priorDelivery=await env.DB.prepare('SELECT evidence_hash FROM payment_evidence WHERE delivery_id=?').bind(delivery).first();
      if(priorDelivery)return priorDelivery.evidence_hash===bodyHash?json({received:true,duplicate:true}):json({error:'delivery_id_conflict'},409);
      const order=await env.DB.prepare('SELECT id,total_paise,status FROM orders WHERE id=?').bind(event.orderId).first();
      const attempt=await env.DB.prepare("SELECT id FROM payment_attempts WHERE order_id=? AND gateway='youpi' AND gateway_payment_id=?").bind(event.orderId,event.paymentId).first();
      if(!order||!attempt)return json({error:'payment_not_found'},404);
      if(!['awaiting_payment','verification_pending','manual_review'].includes(order.status))return json({error:'order_not_payable'},409);
      const amountMatches=event.amountPaise===order.total_paise;const nextOrderState=!amountMatches||event.event==='MANUAL_REVIEW'?'manual_review':event.event==='OBSERVED_SUCCESS'||event.event==='RECONCILED'?'verification_pending':order.status;
      const now=new Date().toISOString();
      try{await env.DB.batch([
        env.DB.prepare('UPDATE payment_attempts SET state=?,updated_at=? WHERE id=?').bind(event.event,now,attempt.id),
        env.DB.prepare('INSERT INTO payment_evidence(id,payment_attempt_id,delivery_id,event_type,verification_source,evidence_hash,received_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),attempt.id,delivery,event.event,'youpi_signed_webhook',bodyHash,now),
        ...(nextOrderState!==order.status?[env.DB.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=? AND status=?').bind(nextOrderState,now,order.id,order.status)]:[]),
      ]);}catch(error){if(String(error?.message||'').includes('UNIQUE')){const duplicate=await env.DB.prepare('SELECT evidence_hash FROM payment_evidence WHERE delivery_id=?').bind(delivery).first();return duplicate?.evidence_hash===bodyHash?json({received:true,duplicate:true}):json({error:'delivery_id_conflict'},409);}throw error;}
      return json({received:true,verificationPending:true});
    }
    if(url.pathname.startsWith('/api/admin/')){
      const auth=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||'';
      if(!env.ADMIN_TOKEN||!safeEqual(auth,env.ADMIN_TOKEN))return json({error:'unauthorized'},401);
      if(url.pathname==='/api/admin/sync'&&request.method==='POST')return json(await synchronize(env));
      if(url.pathname==='/api/admin/overview'&&request.method==='GET'){
        const [catalogue,pricing,runs,orders]=await Promise.all([
          env.DB.prepare('SELECT COUNT(*) AS count,SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS active,SUM(CASE WHEN active=1 AND is_unlimited=0 AND stock=0 THEN 1 ELSE 0 END) AS depleted FROM products').first(),
          env.DB.prepare('SELECT usd_inr AS usdInr,updated_at AS updatedAt,updated_by AS updatedBy FROM merchant_pricing_settings WHERE id=1').first(),
          env.DB.prepare('SELECT id,started_at,finished_at,status,imported,updated,error_code FROM sync_runs ORDER BY id DESC LIMIT 20').all(),
          env.DB.prepare('SELECT status,COUNT(*) AS count FROM orders GROUP BY status').all(),
        ]);
        return json({supplierConfigured:Boolean(env.AITOOLSHOP_API_KEY),livePaymentsEnabled:false,supplierPurchasesEnabled:false,catalogue,pricing,syncRuns:runs.results,orders:orders.results});
      }
      if(url.pathname==='/api/admin/orders'&&request.method==='GET'){
        const orders=await env.DB.prepare('SELECT id,status,currency,total_paise,customer_email,created_at,updated_at FROM orders ORDER BY created_at DESC LIMIT 100').all();
        return json({orders:orders.results});
      }
      if(url.pathname==='/api/admin/sync-runs'&&request.method==='GET'){
        const runs=await env.DB.prepare('SELECT id,started_at,finished_at,status,imported,updated,error_code FROM sync_runs ORDER BY id DESC LIMIT 100').all();
        return json({syncRuns:runs.results});
      }
      if(url.pathname==='/api/admin/pricing'&&request.method==='GET')return json({pricing:await env.DB.prepare('SELECT usd_inr AS usdInr,updated_at AS updatedAt,updated_by AS updatedBy FROM merchant_pricing_settings WHERE id=1').first(),history:(await env.DB.prepare('SELECT previous_usd_inr AS previousUsdInr,usd_inr AS usdInr,reason,changed_by AS changedBy,changed_at AS changedAt FROM merchant_pricing_audit ORDER BY id DESC LIMIT 50').all()).results});
      const verifyMatch=url.pathname.match(/^\/api\/admin\/orders\/([^/]+)\/verify-payment$/);
      if(verifyMatch&&request.method==='POST'){
      if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return json({error:'json_required'},415);
        let input;try{input=await readJsonLimited(request,4096);}catch(error){return json({error:error instanceof RangeError?'payload_too_large':'invalid_json'},error instanceof RangeError?413:400);}
        if(!input||typeof input!=='object'||Array.isArray(input))return json({error:'invalid_bank_evidence'},400);
        let orderId;try{orderId=decodeURIComponent(verifyMatch[1]);}catch{return json({error:'invalid_order_id'},400);}
        const bankReference=String(input.bankRecordReference||'').trim();const amountPaise=Number(input.amountPaise);const bankDate=Date.parse(input.bankRecordDate||'');
        if(!/^[A-Za-z0-9-]{8,64}$/.test(bankReference)||!Number.isSafeInteger(amountPaise))return json({error:'invalid_bank_evidence'},400);
        if(!Number.isFinite(bankDate)||bankDate>Date.now())return json({error:'invalid_bank_record_date'},400);
        const order=await env.DB.prepare("SELECT id,total_paise,status FROM orders WHERE id=? AND status IN ('verification_pending','manual_review')").bind(orderId).first();
        const attempt=await env.DB.prepare("SELECT id FROM payment_attempts WHERE order_id=? AND gateway='youpi' ORDER BY created_at DESC LIMIT 1").bind(orderId).first();
        if(!order||!attempt||order.total_paise!==amountPaise)return json({error:'payment_does_not_match'},409);
        const decisionId=crypto.randomUUID();const now=new Date().toISOString();
        const referenceHash=await sha256Hex(new TextEncoder().encode(bankReference.toUpperCase()));
        const evidenceHash=await sha256Hex(new TextEncoder().encode(`${orderId}:${amountPaise}:${referenceHash}:${new Date(bankDate).toISOString()}`));
        try{const decision=await env.DB.batch([
          env.DB.prepare("UPDATE orders SET verification_decision_id=?,updated_at=? WHERE id=? AND total_paise=? AND status IN ('verification_pending','manual_review')").bind(decisionId,now,orderId,amountPaise),
          env.DB.prepare("UPDATE payment_attempts SET state='admin_bank_verified',updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND verification_decision_id=?)").bind(now,attempt.id,orderId,decisionId),
          env.DB.prepare("INSERT INTO payment_evidence(id,payment_attempt_id,delivery_id,event_type,verification_source,evidence_hash,bank_reference_hash,received_at) SELECT ?,?,?,?,'official_bank_record_admin_decision',?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND verification_decision_id=?)").bind(crypto.randomUUID(),attempt.id,`admin:${decisionId}`,'ADMIN_BANK_VERIFIED',evidenceHash,referenceHash,now,orderId,decisionId),
          env.DB.prepare('INSERT INTO admin_actions(id,actor,action,target_id,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND verification_decision_id=?)').bind(crypto.randomUUID(),'admin','verify_bank_payment',orderId,now,orderId,decisionId),
          env.DB.prepare('INSERT INTO audit_events(id,event_type,subject_id,details_json,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND verification_decision_id=?)').bind(crypto.randomUUID(),'payment_verified',orderId,JSON.stringify({amountPaise,bankReferenceHash:referenceHash}),now,orderId,decisionId),
          env.DB.prepare("UPDATE orders SET status='payment_verified',updated_at=? WHERE id=? AND total_paise=? AND status IN ('verification_pending','manual_review') AND verification_decision_id=?").bind(now,orderId,amountPaise,decisionId),
        ]);if(decision.at(-1)?.meta?.changes!==1)return json({error:'payment_decision_conflict'},409);}catch(error){if(String(error?.message||'').includes('UNIQUE'))return json({error:'bank_reference_already_used'},409);throw error;}
        return json({verified:true,status:'payment_verified'});
      }
      if(url.pathname==='/api/admin/pricing'&&request.method==='PUT'){
        if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return json({error:'json_required'},415);
        let input;try{input=await readJsonLimited(request,4096);}catch(error){return json({error:error instanceof RangeError?'payload_too_large':'invalid_json'},error instanceof RangeError?413:400);}
        if(!input||typeof input!=='object'||Array.isArray(input))return json({error:'invalid_pricing_setting'},400);
        const usdInr=String(input.usdInr??'');const reason=typeof input.reason==='string'?input.reason.trim():'';
        if(!/^\d{1,4}(\.\d{1,4})?$/.test(usdInr)||Number(usdInr)<0.01||Number(usdInr)>10000)return json({error:'invalid_pricing_setting'},400);
        if(reason.length<5||reason.length>300)return json({error:'change_reason_required'},400);
        const current=await env.DB.prepare('SELECT usd_inr FROM merchant_pricing_settings WHERE id=1').first();if(!current)return json({error:'pricing_unavailable'},503);
        if(current.usd_inr===usdInr)return json({updated:false,usdInr});
        const now=new Date().toISOString();
        await env.DB.batch([
          env.DB.prepare('INSERT INTO merchant_pricing_audit(previous_usd_inr,usd_inr,reason,changed_by,changed_at) SELECT usd_inr,?,?,\'admin\',? FROM merchant_pricing_settings WHERE id=1 AND usd_inr<>?').bind(usdInr,reason,now,usdInr),
          env.DB.prepare('UPDATE merchant_pricing_settings SET usd_inr=?,updated_at=?,updated_by=\'admin\' WHERE id=1 AND usd_inr<>?').bind(usdInr,now,usdInr),
        ]);
        return json({updated:true,usdInr,updatedAt:now});
      }
    }
    if (url.pathname.startsWith('/api/')) return json({error:'not_found'},404);
    const productMatch=url.pathname.match(/^\/product\/([^/]+)\/?$/);
    if(productMatch&&request.method==='GET'){
      let supplierId;try{supplierId=decodeURIComponent(productMatch[1]);}catch{return json({error:'not_found'},404);}
      const row=await env.DB.prepare('SELECT p.supplier_id,p.name,p.description,p.cost_usdt,p.type,p.stock,p.is_unlimited,s.usd_inr FROM products p JOIN merchant_pricing_settings s ON s.id=1 WHERE p.supplier_id=? AND p.active=1').bind(supplierId).first();
      if(!row)return secure(new Response('<!doctype html><title>Not found | SoftBazzar</title><main><h1>Product not found</h1><a href="/">Return to catalogue</a></main>',{status:404,headers:{'Content-Type':'text/html; charset=utf-8'}}),env);
      const asset=await env.ASSETS.fetch(new Request(new URL('/',url),request));const html=await asset.text();
      const esc=(v)=>String(v??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const price=priceProduct(row.cost_usdt,row.usd_inr);
      const title=esc(`${row.name} | SoftBazzar`);const desc=esc(row.description||`View current ${row.name} supplier listing.`);const canonical=`${url.origin}/product/${encodeURIComponent(row.supplier_id)}`;
      const structured=price?JSON.stringify({'@context':'https://schema.org','@type':'Product',name:row.name,description:row.description,category:row.type,url:canonical,offers:{'@type':'Offer',priceCurrency:'INR',price:(price.priceInrPaise/100).toFixed(2),availability:row.is_unlimited||row.stock>0?'https://schema.org/InStock':'https://schema.org/OutOfStock'}}).replace(/</g,'\\u003c'):'';
      const page=html.replace(/<title>[\s\S]*?<\/title>/,`<title>${title}</title>`).replace(/<meta name="description"[^>]*>/,`<meta name="description" content="${desc}" />`).replace(/<link rel="canonical"[^>]*>/,`<link rel="canonical" href="${canonical}" data-canonical />`).replace('</head>',`${structured?`<script type="application/ld+json">${structured}</script>`:''}</head>`);
      return secure(new Response(page,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=60'}}),env);
    }
    return secure(await env.ASSETS.fetch(request),env);
  },
};
