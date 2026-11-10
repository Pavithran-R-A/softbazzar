import { priceProduct } from './pricing.js';
import { verifyYoupiWebhook } from './payment.js';
import { parseProducts, supplierRequest } from './supplier.js';
import { reconcileCatalogue } from './catalogue-sync.js';

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
function secure(response, env) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options','nosniff'); headers.set('X-Frame-Options','DENY'); headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()'); headers.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://api.fontshare.com https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com https://cdn.fontshare.com; img-src 'self' data: https://t3.gstatic.com; media-src 'self' https://d8j0ntlcm91z4.cloudfront.net; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
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
  if(!env.AITOOLSHOP_API_KEY)return {skipped:true,reason:'supplier_not_configured'};
  const started = new Date().toISOString(); let runId;
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
    const existingRows = await env.DB.prepare('SELECT supplier_id,name,description,cost_usdt,stock,is_unlimited,duration,requires_email,type,active FROM products').all();
    const plan = reconcileCatalogue(existingRows.results, products);
    const stmts = products.map((p) => env.DB.prepare(`INSERT INTO products(supplier_id,name,description,cost_usdt,stock,is_unlimited,duration,requires_email,type,active,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?) ON CONFLICT(supplier_id) DO UPDATE SET name=excluded.name,description=excluded.description,cost_usdt=excluded.cost_usdt,stock=excluded.stock,is_unlimited=excluded.is_unlimited,duration=excluded.duration,requires_email=excluded.requires_email,type=excluded.type,active=1,updated_at=excluded.updated_at`).bind(p.id,p.name,p.description,String(p.costUsdt),p.stock,p.unlimited?1:0,p.duration,p.requiresEmail?1:0,p.type,started));
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
  const [rows, fx, latest] = await Promise.all([
    env.DB.prepare('SELECT p.supplier_id,p.name,p.description,p.cost_usdt,p.stock,p.is_unlimited,p.duration,p.requires_email,p.type,pp.category,pp.image_url FROM products p LEFT JOIN product_presentation pp ON pp.supplier_id=p.supplier_id WHERE p.active=1 ORDER BY p.name').all(),
    env.DB.prepare('SELECT usdt_inr,usdt_usd,updated_at FROM fx_rates WHERE id=1').first(),
    env.DB.prepare("SELECT finished_at FROM sync_runs WHERE status='success' ORDER BY id DESC LIMIT 1").first(),
  ]);
  const staleMs = Number(env.STALE_CATALOGUE_MINUTES||10)*60000; const syncAt = Date.parse(latest?.finished_at||''); const stale = !Number.isFinite(syncAt)||Date.now()-syncAt>staleMs;
  const fxAt = Date.parse(fx?.updated_at||''); const fxStale = !Number.isFinite(fxAt)||Date.now()-fxAt>86400000;
  const products = fx ? rows.results.map((row) => {
    const priced=priceProduct(row.cost_usdt,{usdtInr:fx.usdt_inr,usdtUsd:fx.usdt_usd,updatedAt:fx.updated_at});
    return {id:row.supplier_id,name:row.name,desc:row.description,cat:row.category||row.type,type:row.type,duration:row.duration,requiresEmail:Boolean(row.requires_email),inStock:Boolean(row.is_unlimited)||row.stock>0,stock:row.is_unlimited?null:row.stock,unlimited:Boolean(row.is_unlimited),supplierCostUsdt:row.cost_usdt,sellingUsdt:priced.sellUsdt,priceNum:priced.priceInrPaise/100,priceInrPaise:priced.priceInrPaise,priceUsd:priced.priceUsd,image:row.image_url,quoteFxUpdatedAt:priced.fxUpdatedAt};
  }) : [];
  return {products,count:products.length,lastSyncAt:latest?.finished_at||null,fxUpdatedAt:fx?.updated_at||null,stale:stale||fxStale,purchasable:!stale&&!fxStale&&Boolean(fx)};
}

export default {
  async scheduled(_event,env,ctx){ctx.waitUntil(synchronize(env));},
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/api/health'&&request.method==='GET')return json({ok:true,supplierConfigured:Boolean(env.AITOOLSHOP_API_KEY),youpiConfigured:Boolean(env.YOUPI_GATEWAY_URL&&env.YOUPI_MERCHANT_ID&&env.YOUPI_MERCHANT_API_KEY),livePaymentsEnabled:false,supplierPurchasesEnabled:false});
    if(env.STAGING_ENV==='true'&&url.pathname==='/robots.txt'&&request.method==='GET')return secure(new Response('User-agent: *\nDisallow: /\n',{headers:{'Content-Type':'text/plain; charset=utf-8'}}),env);
    if(env.STAGING_ENV==='true'&&url.pathname==='/sitemap.xml'&&request.method==='GET')return secure(new Response('',{status:404,headers:{'Content-Type':'application/xml; charset=utf-8'}}),env);
    if(url.pathname==='/api/catalogue'&&request.method==='GET'){try{return json(await publicCatalogue(env));}catch{return json({error:'catalogue_unavailable'},503);}}
    if(url.pathname==='/api/orders'&&request.method==='POST'){
      if(request.headers.get('Origin')!==url.origin)return json({error:'origin_rejected'},403);
      if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return json({error:'json_required'},415);
      const idempotencyKey=request.headers.get('Idempotency-Key')||'';if(!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey))return json({error:'idempotency_key_required'},400);
      let input;try{input=await readJsonLimited(request);}catch(error){return json({error:error instanceof RangeError?'payload_too_large':'invalid_json'},error instanceof RangeError?413:400);}
      if(!input||typeof input!=='object'||Array.isArray(input))return json({error:'invalid_items'},400);
      if(!Array.isArray(input.items)||input.items.length<1||input.items.length>20)return json({error:'invalid_items'},400);
      const quantities=new Map();for(const item of input.items){if(!item||typeof item.productId!=='string'||!item.productId.trim()||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>99)return json({error:'invalid_items'},400);quantities.set(item.productId,(quantities.get(item.productId)||0)+item.quantity);}
      if([...quantities.values()].some((quantity)=>quantity>99))return json({error:'invalid_quantity'},400);
      const email=input.customerEmail?String(input.customerEmail).trim():'';if(email&&!validEmail(email))return json({error:'invalid_email'},400);
      const requestHash=await sha256Hex(new TextEncoder().encode(JSON.stringify({email,items:[...quantities.entries()].sort(([left],[right])=>left.localeCompare(right))})));
      const existing=await env.DB.prepare('SELECT id,status,total_paise,quote_expires_at,request_hash FROM orders WHERE idempotency_key=?').bind(idempotencyKey).first();
      if(existing){if(existing.request_hash!==requestHash)return json({error:'idempotency_conflict'},409);if(existing.status==='quoted'&&Date.parse(existing.quote_expires_at)<=Date.now()){await env.DB.prepare("UPDATE orders SET status='cancelled',updated_at=? WHERE id=? AND status='quoted'").bind(new Date().toISOString(),existing.id).run();return json({error:'quote_expired'},410);}return json({orderId:existing.id,status:existing.status,totalPaise:existing.total_paise,expiresAt:existing.quote_expires_at});}
      const catalogue=await publicCatalogue(env);if(!catalogue.purchasable)return json({error:'catalogue_stale'},503);
      const ids=[...quantities.keys()];const sqlIds=ids.map(()=>'?').join(',');
      const rows=await env.DB.prepare(`SELECT p.supplier_id,p.name,p.cost_usdt,p.stock,p.is_unlimited,p.requires_email,f.usdt_inr,f.usdt_usd,f.updated_at AS fx_updated_at FROM products p JOIN fx_rates f ON f.id=1 WHERE p.active=1 AND p.supplier_id IN (${sqlIds})`).bind(...ids).all();
      if(rows.results.length!==ids.length)return json({error:'product_unavailable'},409);
      if(rows.results.some((row)=>!row.is_unlimited&&row.stock<quantities.get(row.supplier_id)))return json({error:'insufficient_stock'},409);
      if(rows.results.some((row)=>row.requires_email)&&!email)return json({error:'customer_email_required'},400);
      const orderId=crypto.randomUUID();const now=new Date().toISOString();const expiresAt=new Date(Date.now()+5*60000).toISOString();let totalPaise=0;
      const lines=rows.results.map((row)=>{const quantity=quantities.get(row.supplier_id);const price=priceProduct(row.cost_usdt,{usdtInr:row.usdt_inr,usdtUsd:row.usdt_usd,updatedAt:row.fx_updated_at});const lineTotal=price.priceInrPaise*quantity;if(!Number.isSafeInteger(lineTotal))throw new RangeError('quote_total_invalid');totalPaise+=lineTotal;return{row,quantity,price,lineId:crypto.randomUUID()};});
      if(!Number.isSafeInteger(totalPaise)||totalPaise<=0)return json({error:'quote_total_invalid'},400);
      const stmts=[env.DB.prepare("INSERT INTO orders(id,idempotency_key,request_hash,status,customer_email,currency,total_paise,fx_usdt_inr,fx_usdt_usd,quote_expires_at,created_at,updated_at) VALUES(?,?,?,'quoted',?,'INR',?,?,?,?,?,?)").bind(orderId,idempotencyKey,requestHash,email||null,totalPaise,rows.results[0].usdt_inr,rows.results[0].usdt_usd,expiresAt,now,now)];
      for(const line of lines){stmts.push(env.DB.prepare('INSERT INTO order_lines(id,order_id,supplier_product_id,name_snapshot,quantity,unit_price_paise,supplier_cost_usdt,supplier_idempotency_key) VALUES(?,?,?,?,?,?,?,?)').bind(line.lineId,orderId,line.row.supplier_id,line.row.name,line.quantity,line.price.priceInrPaise,String(line.row.cost_usdt),`softbazzar-${line.lineId}`));stmts.push(env.DB.prepare('INSERT INTO pricing_snapshots(order_line_id,selling_usdt,fx_usdt_inr,fx_usdt_usd,quote_fx_updated_at,unit_price_paise,approx_usd_cents,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(line.lineId,String(line.price.sellUsdt),line.row.usdt_inr,line.row.usdt_usd,line.price.fxUpdatedAt,line.price.priceInrPaise,Math.round(line.price.priceUsd*100),now));}
      try{await env.DB.batch(stmts);}catch(error){const duplicate=await env.DB.prepare('SELECT id,status,total_paise,quote_expires_at FROM orders WHERE idempotency_key=?').bind(idempotencyKey).first();if(duplicate)return json({orderId:duplicate.id,status:duplicate.status,totalPaise:duplicate.total_paise,expiresAt:duplicate.quote_expires_at});throw error;}
      return json({orderId,status:'quoted',currency:'INR',totalPaise,expiresAt},201);
    }
    if(/^\/api\/orders\/[^/]+\/payments$/.test(url.pathname)&&request.method==='POST')return json({error:'payments_disabled'},503);
    if(url.pathname==='/api/webhooks/youpi'&&request.method==='POST'){
      if(!env.YOUPI_WEBHOOK_SECRET)return json({error:'webhook_unavailable'},503);
      const length=Number(request.headers.get('Content-Length')||0);if(length>65536)return json({error:'payload_too_large'},413);
      let rawBytes;try{rawBytes=await readLimitedBytes(request,65536);}catch(error){return json({error:error instanceof RangeError?'payload_too_large':'invalid_webhook_body'},error instanceof RangeError?413:400);}
      const timestamp=request.headers.get('X-Gateway-Timestamp')||'';const delivery=request.headers.get('X-Gateway-Delivery-Id')||'';const headerEvent=request.headers.get('X-Gateway-Event')||'';
      if(!/^[0-9]{13}$/.test(timestamp)||!/^[A-Za-z0-9-]{8,80}$/.test(delivery))return json({error:'invalid_webhook_headers'},400);
      let rawBody;try{rawBody=new TextDecoder('utf-8',{fatal:true}).decode(rawBytes);}catch{return json({error:'invalid_webhook_body'},400);}
      let event;try{event=await verifyYoupiWebhook({rawBody,signature:request.headers.get('X-Gateway-Signature-V2')||'',timestamp,secret:env.YOUPI_WEBHOOK_SECRET});}catch{return json({error:'invalid_webhook_signature'},401);}
      if(event.deliveryId!==delivery||String(event.timestamp)!==timestamp||event.event!==headerEvent||event.method!=='UPI'||typeof event.orderId!=='string'||typeof event.paymentId!=='string'||!Number.isSafeInteger(event.amountPaise))return json({error:'invalid_webhook_payload'},400);
      const order=await env.DB.prepare('SELECT id,total_paise,status FROM orders WHERE id=?').bind(event.orderId).first();
      const attempt=await env.DB.prepare("SELECT id FROM payment_attempts WHERE order_id=? AND gateway='youpi' AND gateway_payment_id=?").bind(event.orderId,event.paymentId).first();
      if(!order||!attempt)return json({error:'payment_not_found'},404);
      if(!['awaiting_payment','verification_pending','manual_review'].includes(order.status))return json({error:'order_not_payable'},409);
      const amountMatches=event.amountPaise===order.total_paise;const nextOrderState=!amountMatches||event.event==='MANUAL_REVIEW'?'manual_review':event.event==='OBSERVED_SUCCESS'||event.event==='RECONCILED'?'verification_pending':order.status;
      const bodyHash=await sha256Hex(rawBytes);const now=new Date().toISOString();
      try{await env.DB.batch([
        env.DB.prepare('UPDATE payment_attempts SET state=?,updated_at=? WHERE id=?').bind(event.event,now,attempt.id),
        env.DB.prepare('INSERT INTO payment_evidence(id,payment_attempt_id,delivery_id,event_type,verification_source,evidence_hash,received_at) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),attempt.id,delivery,event.event,'youpi_signed_webhook',bodyHash,now),
        ...(nextOrderState!==order.status?[env.DB.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=? AND status=?').bind(nextOrderState,now,order.id,order.status)]:[]),
      ]);}catch(error){if(String(error?.message||'').includes('UNIQUE'))return json({received:true,duplicate:true});throw error;}
      return json({received:true,verificationPending:true});
    }
    if(url.pathname.startsWith('/api/admin/')){
      const auth=request.headers.get('Authorization')?.replace(/^Bearer\s+/i,'')||'';
      if(!env.ADMIN_TOKEN||!safeEqual(auth,env.ADMIN_TOKEN))return json({error:'unauthorized'},401);
      if(url.pathname==='/api/admin/sync'&&request.method==='POST')return json(await synchronize(env));
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
      if(url.pathname==='/api/admin/fx'&&request.method==='PUT'){
        if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return json({error:'json_required'},415);
        let input;try{input=await readJsonLimited(request,4096);}catch(error){return json({error:error instanceof RangeError?'payload_too_large':'invalid_json'},error instanceof RangeError?413:400);}
        if(!input||typeof input!=='object'||Array.isArray(input))return json({error:'invalid_fx_rate'},400);
        const inr=Number(input.usdtInr),usd=Number(input.usdtUsd),updatedAt=Date.parse(input.updatedAt||'');
        if(!/^\d{1,5}(\.\d{1,6})?$/.test(String(input.usdtInr))||!/^\d{1,3}(\.\d{1,6})?$/.test(String(input.usdtUsd))||!Number.isFinite(inr)||inr<0.01||inr>10000||!Number.isFinite(usd)||usd<0.01||usd>100||!Number.isFinite(updatedAt)||updatedAt>Date.now()||Date.now()-updatedAt>86400000)return json({error:'invalid_fx_rate'},400);
        await env.DB.prepare('INSERT INTO fx_rates(id,usdt_inr,usdt_usd,updated_at,updated_by) VALUES(1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET usdt_inr=excluded.usdt_inr,usdt_usd=excluded.usdt_usd,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(String(inr),String(usd),new Date(updatedAt).toISOString(),'admin').run();
        return json({updatedAt:new Date(updatedAt).toISOString()});
      }
    }
    if (url.pathname.startsWith('/api/')) return json({error:'not_found'},404);
    const productMatch=url.pathname.match(/^\/product\/([^/]+)\/?$/);
    if(productMatch&&request.method==='GET'){
      let supplierId;try{supplierId=decodeURIComponent(productMatch[1]);}catch{return json({error:'not_found'},404);}
      const row=await env.DB.prepare('SELECT p.supplier_id,p.name,p.description,p.cost_usdt,p.type,p.stock,p.is_unlimited,f.usdt_inr,f.usdt_usd,f.updated_at AS fx_updated_at FROM products p LEFT JOIN fx_rates f ON f.id=1 WHERE p.supplier_id=? AND p.active=1').bind(supplierId).first();
      if(!row)return secure(new Response('<!doctype html><title>Not found | SoftBazzar</title><main><h1>Product not found</h1><a href="/">Return to catalogue</a></main>',{status:404,headers:{'Content-Type':'text/html; charset=utf-8'}}),env);
      const asset=await env.ASSETS.fetch(new Request(new URL('/',url),request));const html=await asset.text();
      const esc=(v)=>String(v??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const price=row.usdt_inr&&row.usdt_usd?priceProduct(row.cost_usdt,{usdtInr:row.usdt_inr,usdtUsd:row.usdt_usd,updatedAt:row.fx_updated_at}):null;
      const title=esc(`${row.name} | SoftBazzar`);const desc=esc(row.description||`View current ${row.name} supplier listing.`);const canonical=`${url.origin}/product/${encodeURIComponent(row.supplier_id)}`;
      const structured=price?JSON.stringify({'@context':'https://schema.org','@type':'Product',name:row.name,description:row.description,category:row.type,url:canonical,offers:{'@type':'Offer',priceCurrency:'INR',price:(price.priceInrPaise/100).toFixed(2),availability:row.is_unlimited||row.stock>0?'https://schema.org/InStock':'https://schema.org/OutOfStock'}}).replace(/</g,'\\u003c'):'';
      const page=html.replace(/<title>[\s\S]*?<\/title>/,`<title>${title}</title>`).replace(/<meta name="description"[^>]*>/,`<meta name="description" content="${desc}" />`).replace(/<link rel="canonical"[^>]*>/,`<link rel="canonical" href="${canonical}" data-canonical />`).replace('</head>',`${structured?`<script type="application/ld+json">${structured}</script>`:''}</head>`);
      return secure(new Response(page,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=60'}}),env);
    }
    return secure(await env.ASSETS.fetch(request),env);
  },
};
