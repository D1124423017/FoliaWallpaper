'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const http = require('node:http');
const { installBackendCompatibility } = require('../../../electron/integration/backend-compat.cjs');

// Exercise the real official release, scoped entry adapter and Koa HTTP behavior; no stand-in content type implementation.
const consumer = createRequire(require.resolve('koa/package.json'));
const resolved = consumer.resolve('cache-content-type');
const contentRequire = createRequire(consumer.resolve('cache-content-type/package.json'));
const mime = contentRequire('mime-types');

function freshCache() {
  delete consumer.cache[resolved];
  const original = mime.contentType, calls = new Map();
  mime.contentType = function (type) { calls.set(type, (calls.get(type) || 0) + 1); return original(type); };
  installBackendCompatibility();
  return { getType: consumer('cache-content-type'), calls, restore: () => { mime.contentType = original; } };
}

test('official package remains unchanged and the entry adapter is idempotent', () => {
  const first = installBackendCompatibility(), callable = consumer('cache-content-type');
  assert.equal(first.version, '2.1.0');
  assert.equal(installBackendCompatibility().resolved, first.resolved);
  assert.equal(consumer('cache-content-type'), callable);
  assert.equal(callable.getType, callable); assert.equal(callable.default, callable);
});
test('callable official getType preserves charset and binary MIME results', () => {
  const cache = freshCache(); try {
    for (const value of ['html','txt','json','css','mp3','png','bin','text/plain; charset=iso-8859-1','folia-unknown-extension'])
      assert.equal(cache.getType(value), mime.contentType(value));
  } finally { cache.restore(); }
});
test('recognized types are cached', () => {
  const cache = freshCache(); try {
    for (let i=0;i<20;i++) assert.equal(cache.getType('html'),'text/html; charset=utf-8');
    assert.equal(cache.calls.get('html'),1);
  } finally { cache.restore(); }
});
test('false unknown-type results remain cached', () => {
  const cache = freshCache(); try {
    for (let i=0;i<20;i++) assert.equal(cache.getType('folia-unknown-extension'),false);
    assert.equal(cache.calls.get('folia-unknown-extension'),1);
  } finally { cache.restore(); }
});
test('cache churn safely evicts and recomputes old entries', () => {
  const cache = freshCache(); try {
    cache.getType('html');
    for (let i=0;i<400;i++) cache.getType('application/x-folia-cache-'+i);
    assert.equal(cache.getType('html'),'text/html; charset=utf-8');
    assert.equal(cache.calls.get('html'),2);
  } finally { cache.restore(); }
});
test('actual Koa HTTP serves JSON/text/audio/image and removes unknown type', async () => {
  installBackendCompatibility();
  const Koa = require('koa'), app = new Koa();
  app.use(ctx => {
    if(ctx.path==='/text'){ctx.body='繁體中文';ctx.type='txt';}
    else if(ctx.path==='/json')ctx.body={ok:true,message:'繁體中文'};
    else if(ctx.path==='/audio'){ctx.body=Buffer.from([1,2,3]);ctx.type='mp3';}
    else if(ctx.path==='/image'){ctx.body=Buffer.from([137,80,78,71]);ctx.type='png';}
    else if(ctx.path==='/unknown'){ctx.body=Buffer.from([1]);ctx.type='html';ctx.type='folia-unknown-extension';}
    else ctx.status=404;
  });
  const server=http.createServer(app.callback());
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  try {
    const origin='http://127.0.0.1:'+server.address().port;
    const json=await fetch(origin+'/json');assert.equal(json.status,200);assert.equal(json.headers.get('content-type'),'application/json; charset=utf-8');assert.deepEqual(await json.json(),{ok:true,message:'繁體中文'});
    const txt=await fetch(origin+'/text');assert.equal(txt.headers.get('content-type'),'text/plain; charset=utf-8');assert.equal(await txt.text(),'繁體中文');
    const audio=await fetch(origin+'/audio');assert.equal(audio.headers.get('content-type'),'audio/mpeg');assert.deepEqual([...new Uint8Array(await audio.arrayBuffer())],[1,2,3]);
    const image=await fetch(origin+'/image');assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual([...new Uint8Array(await image.arrayBuffer())],[137,80,78,71]);
    const unknown=await fetch(origin+'/unknown');assert.equal(unknown.headers.get('content-type'),null);
  } finally { await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});
