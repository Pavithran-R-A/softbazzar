import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { refreshFx } from '../src/fx.js';
import { priceProduct } from '../src/pricing.js';
import worker from '../src/worker.js';

class Statement {
  constructor(db, sql, values = []) { this.db=db; this.sql=sql; this.values=values; }
  bind(...values) { return new Statement(this.db,this.sql,values); }
  run() { const result=this.db.prepare(this.sql).run(...this.values); return {meta:{changes:Number(result.changes)}}; }
  first() { return this.db.prepare(this.sql).get(...this.values) ?? null; }
}
class TestDb {
  constructor() {
    this.sqlite=new DatabaseSync(':memory:');
    for (const file of ['0001_init.sql','0005_fx_provenance.sql','0006_fx_rate_history.sql']) this.sqlite.exec(readFileSync(new URL(`../migrations/${file}`,import.meta.url),'utf8'));
  }
  prepare(sql) { return new Statement(this.sqlite,sql); }
  batch(statements) { this.sqlite.exec('BEGIN'); try { const result=statements.map((statement)=>statement.run()); this.sqlite.exec('COMMIT'); return result; } catch(error) { this.sqlite.exec('ROLLBACK'); throw error; } }
}
const epoch = 1_794_300_000_000;
const envWith = () => ({DB:new TestDb(),FX_API_KEY:'mock-provider-key'});
const fakeFetch = (payload,status=200) => async (url,options) => {
  assert.equal(new URL(url).hostname,'api.coingecko.com');
  assert.equal(options.headers['x-cg-pro-api-key'],'mock-provider-key');
  return new Response(JSON.stringify(payload),{status});
};
const response = (inr=90.125,usd=0.999,last=epoch) => ({tether:{inr,usd,last_updated_at:Math.floor(last/1000)}});

test('scheduled FX refresh updates both pairs and audits source rates',async()=>{
  const env=envWith();
  const result=await refreshFx(env,fakeFetch(response()),epoch);
  assert.equal(result.updated,true);
  assert.equal(result.source,'coingecko');
  assert.deepEqual({...env.DB.prepare('SELECT usdt_inr,usdt_usd,updated_by FROM fx_rates WHERE id=1').first()},{usdt_inr:'90.125',usdt_usd:'0.999',updated_by:'coingecko'});
  assert.equal(env.DB.prepare("SELECT COUNT(*) AS count FROM fx_rate_history WHERE status='success'").first().count,1);
  env.DB.sqlite.close();
});

test('Worker Cron invokes FX refresh automatically',async()=>{
  const env=envWith();
  const originalFetch=globalThis.fetch;
  globalThis.fetch=fakeFetch(response(90.125,0.999,Date.now()));
  let scheduled;
  try {
    worker.scheduled({},env,{waitUntil(promise){scheduled=promise;}});
    await scheduled;
  } finally { globalThis.fetch=originalFetch; }
  assert.equal(env.DB.prepare('SELECT updated_by FROM fx_rates WHERE id=1').first().updated_by,'coingecko');
  env.DB.sqlite.close();
});

test('FX outage preserves last known rate and records failure',async()=>{
  const env=envWith();
  await refreshFx(env,fakeFetch(response()),epoch);
  const outage=await refreshFx(env,async()=>{throw new Error('offline');},epoch+6*60*1000);
  assert.equal(outage.error,'provider_unavailable');
  assert.equal(env.DB.prepare('SELECT usdt_inr FROM fx_rates WHERE id=1').first().usdt_inr,'90.125');
  assert.equal(env.DB.prepare("SELECT COUNT(*) AS count FROM fx_rate_history WHERE status='failed'").first().count,1);
  env.DB.sqlite.close();
});

test('rates reject stale, implausible, malformed, or failed responses',async()=>{
  const env=envWith();
  const stale=await refreshFx(env,fakeFetch(response(90,1,epoch-16*60*1000)),epoch);
  assert.equal(stale.error,'invalid_or_stale_rates');
  const malformed=await refreshFx(env,fakeFetch(response('NaN',1)),epoch);
  assert.equal(malformed.error,'invalid_or_stale_rates');
  const outage=await refreshFx(env,fakeFetch({},503),epoch);
  assert.equal(outage.error,'provider_http_error');
  assert.equal(env.DB.prepare('SELECT COUNT(*) AS count FROM fx_rates').first().count,0);
  assert.equal(env.DB.prepare("SELECT COUNT(*) AS count FROM fx_rate_history WHERE status='failed'").first().count,3);
  env.DB.sqlite.close();
});

test('price calculations preserve 25 percent markup and round paise',()=>{
  const price=priceProduct('0.01',{usdtInr:'90',usdtUsd:'1',updatedAt:new Date(epoch).toISOString()});
  assert.equal(price.sellUsdt,0.0125);
  assert.equal(price.priceInrPaise,113);
  assert.equal(price.priceUsd,0.01);
});

test('unconfigured provider fails closed and records the missing setup',async()=>{
  const env={DB:new TestDb()};
  const result=await refreshFx(env,async()=>{throw new Error('should not call');},epoch);
  assert.equal(result.error,'provider_not_configured');
  assert.equal(env.DB.prepare("SELECT error_code FROM fx_rate_history").first().error_code,'provider_not_configured');
  env.DB.sqlite.close();
});
