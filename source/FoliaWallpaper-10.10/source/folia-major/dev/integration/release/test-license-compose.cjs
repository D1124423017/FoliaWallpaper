'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const Module = require('node:module');
const path = require('node:path');
const vm = require('node:vm');
require('../../../electron/integration/backend-compat.cjs').installBackendCompatibility();
const Koa = require('koa');

// dev/integration/release/test-license-compose.cjs — verify the licensed fixed-commit composer and real Koa router contract without opening a port.
const repo = path.resolve(__dirname, '../../..');
const vendor = path.join(repo, 'dev/integration/vendor/koa-compose');
const revision = '903480c36957776f8561a33a840cdd0a06ad611f';
const digests = {
  'index.js': 'cdb00fa9273d68c23d13a7b5470a8a384fd4a1836236dd87f33a07c0c2a397ea',
  LICENSE: '44a7ca64cb59fbe6481a7260e4317ff0177127a6e50e6077a9bfa60f89f905a2',
  'package.json': 'aeecbe9d7b3ea0cdbd4062bbeb87e828a7e616247dbbab488c6bf515bcb9c6a6',
};
const requireInstalled = process.argv.includes('--require-installed');
const results = [];
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const publicPath = filename => path.relative(repo, filename).split(path.sep).join('/');
const compose = require(path.join(vendor, 'index.js'));

async function check(name, callback) {
  await callback();
  results.push({ name, passed: true });
}

/** Compile the unchanged installed router with only its composer dependency replaced; never alter global require or its cache. */
function injectedRouter(filename) {
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = instance.require.bind(instance);
  instance.require = name => name === 'koa-compose' ? compose : originalRequire(name);
  instance._compile(fs.readFileSync(filename, 'utf8'), filename);
  return instance.exports;
}

/** Create native HTTP request/response objects for the real Koa context, without a socket, listener or running HTTP service. */
async function request(app, method, url) {
  const req = new http.IncomingMessage(null);
  req.method = method;
  req.url = url;
  req.headers = {};
  const res = new http.ServerResponse(req);
  const ctx = app.createContext(req, res);
  res.statusCode = 404;
  await compose(app.middleware)(ctx);
  return ctx;
}

/** Check source provenance, Promise boundaries and actual Koa routing; strict mode also checks npm's installed resolution. */
async function main() {
  await check('verbatim official files and commit provenance', () => {
    assert.deepEqual(fs.readdirSync(vendor).sort(), ['LICENSE', 'PROVENANCE.json', 'index.js', 'package.json'].sort());
    for (const [file, digest] of Object.entries(digests)) assert.equal(sha256(fs.readFileSync(path.join(vendor, file))), digest, file);
    const provenance = JSON.parse(fs.readFileSync(path.join(vendor, 'PROVENANCE.json'), 'utf8'));
    assert.equal(provenance.revision, revision);
    assert.match(provenance.origin, /not the original npm/);
    const pkg = JSON.parse(fs.readFileSync(path.join(vendor, 'package.json'), 'utf8'));
    assert.equal(pkg.version, '4.2.0');
    assert.equal(pkg.name, 'koa-compose');
    assert.equal(pkg.license, 'MIT');
    assert.deepEqual(pkg.dependencies, {});
  });

  const routerFilename = require.resolve('koa-router');
  const routerRequire = Module.createRequire(routerFilename);
  const installedComposer = routerRequire.resolve('koa-compose');
  const installedDigest = sha256(fs.readFileSync(installedComposer));
  let Router;
  if (requireInstalled) {
    await check('actual installed router resolves the licensed composer', () => {
      assert.equal(installedDigest, digests['index.js']);
      for (const [file, digest] of Object.entries(digests)) {
        assert.equal(sha256(fs.readFileSync(path.join(path.dirname(installedComposer), file))), digest, `installed ${file}`);
      }
    });
    Router = require('koa-router');
  } else Router = injectedRouter(routerFilename);

  await check('reject invalid stacks without accepting nested arrays', () => {
    assert.throws(() => compose(null), /Middleware stack must be an array!/);
    assert.throws(() => compose('middleware'), /Middleware stack must be an array!/);
    assert.throws(() => compose([{}]), /Middleware must be composed of functions!/);
    assert.throws(() => compose([[() => {}]]), /Middleware must be composed of functions!/);
  });
  await check('native Promise return and thenable assimilation', async () => {
    const promise = compose([() => ({ then: resolve => resolve(42) })])({});
    assert.ok(promise instanceof Promise);
    assert.equal(await promise, 42);
  });
  await check('async onion ordering, context identity and returned value', async () => {
    const context = { order: [] };
    const run = compose([
      async (ctx, next) => { assert.equal(ctx, context); ctx.order.push('a+'); const value = await next(); ctx.order.push('a-'); return value + 1; },
      async (ctx, next) => { ctx.order.push('b+'); const value = await next(); ctx.order.push('b-'); return value; },
    ]);
    assert.equal(await run(context, () => { context.order.push('tail'); return 7; }), 8);
    assert.deepEqual(context.order, ['a+', 'b+', 'tail', 'b-', 'a-']);
  });
  await check('synchronous throw rejects with the original error', async () => {
    const error = new Error('sync failure');
    await assert.rejects(compose([() => { throw error; }])({}), thrown => thrown === error);
  });
  await check('async rejection rejects with the original error', async () => {
    const error = new Error('async failure');
    await assert.rejects(compose([async () => { throw error; }])({}), thrown => thrown === error);
  });
  await check('catch downstream failure in an upstream middleware', async () => {
    const context = {};
    await compose([async (ctx, next) => { try { await next(); } catch (error) { ctx.error = error.message; } }, async () => { throw new Error('downstream'); }])(context);
    assert.equal(context.error, 'downstream');
  });
  await check('double next rejects instead of executing downstream twice', async () => {
    let called = 0;
    await assert.rejects(compose([async (ctx, next) => { await next(); await next(); }, () => { called++; }])({}), /next\(\) called multiple times/);
    assert.equal(called, 1);
  });
  await check('empty stack calls the terminal next exactly once', async () => {
    let called = 0;
    assert.equal(await compose([])({}, () => { called++; return 9; }), 9);
    assert.equal(called, 1);
    assert.equal(await compose([])({}), undefined);
  });
  await check('short circuit skips subsequent middleware', async () => {
    let called = 0;
    assert.equal(await compose([() => 5, () => { called++; }])({}), 5);
    assert.equal(called, 0);
  });
  await check('one composed stack supports concurrent contexts', async () => {
    const run = compose([async ctx => { await Promise.resolve(); return ctx.id; }]);
    assert.deepEqual(await Promise.all([run({ id: 1 }), run({ id: 2 })]), [1, 2]);
  });
  await check('official implementation does not load custom any-promise', async () => {
    const sandbox = { module: { exports: {} }, Promise, require: () => { throw new Error('Unexpected dependency'); } };
    new vm.Script(fs.readFileSync(path.join(vendor, 'index.js'), 'utf8')).runInNewContext(sandbox);
    assert.equal(await sandbox.module.exports([() => 11])({}), 11);
  });

  const router = new Router();
  router.param('id', async (id, ctx, next) => { ctx.state.order.push(`param:${id}`); await next(); });
  router.use('/song/:id', async (ctx, next) => { ctx.state.order.push('use+'); await next(); ctx.state.order.push('use-'); });
  router.get('/song/:id', async (ctx, next) => { ctx.state.order.push('get'); ctx.body = `song-${ctx.params.id}`; await next(); });
  const app = new Koa();
  app.use(async (ctx, next) => { ctx.state.order = []; await next(); });
  app.use(router.routes());
  app.use(router.allowedMethods());
  app.use(ctx => { ctx.state.order.push('tail'); });
  for (const method of ['GET', 'HEAD']) {
    await check(`real Koa/router ${method} parameter and middleware order`, async () => {
      const ctx = await request(app, method, '/song/42?quality=high');
      assert.equal(ctx.status, 200);
      assert.equal(ctx.body, 'song-42');
      assert.equal(ctx.params.id, '42');
      assert.equal(ctx.query.quality, 'high');
      assert.deepEqual(ctx.state.order, ['param:42', 'use+', 'param:42', 'get', 'tail', 'use-']);
    });
  }
  await check('real Koa/router method mismatch returns 405', async () => {
    const ctx = await request(app, 'POST', '/song/42');
    assert.equal(ctx.status, 405);
    assert.equal(ctx.response.get('Allow'), 'HEAD, GET');
  });
  await check('real Koa/router OPTIONS returns allowed methods', async () => {
    const ctx = await request(app, 'OPTIONS', '/song/42');
    assert.equal(ctx.status, 200);
    assert.equal(ctx.body, '');
    assert.equal(ctx.response.get('Allow'), 'HEAD, GET');
  });
  await check('real Koa/router unmatched path reaches fallback', async () => {
    const ctx = await request(app, 'GET', '/missing');
    assert.equal(ctx.status, 404);
    assert.deepEqual(ctx.state.order, ['tail']);
  });
  await check('real Koa/router propagates route errors to the outer handler', async () => {
    const failing = new Router();
    failing.get('/fail', async () => { throw new Error('route failure'); });
    const caught = new Koa();
    caught.use(async (ctx, next) => { try { await next(); } catch (error) { ctx.status = 503; ctx.body = error.message; } });
    caught.use(failing.routes());
    const ctx = await request(caught, 'GET', '/fail');
    assert.equal(ctx.status, 503);
    assert.equal(ctx.body, 'route failure');
  });
  await check('real Koa/router nested router keeps parent and child params', async () => {
    const child = new Router();
    child.get('/song/:song', ctx => { ctx.body = `${ctx.params.artist}:${ctx.params.song}`; });
    const parent = new Router();
    parent.use('/artist/:artist', child.routes());
    const nested = new Koa();
    nested.use(parent.routes());
    const ctx = await request(nested, 'GET', '/artist/17/song/42');
    assert.equal(ctx.status, 200);
    assert.equal(ctx.body, '17:42');
  });
  return {
    passed: true,
    node: process.version,
    mode: requireInstalled ? 'actual-installed-router' : 'installed-router-source-with-local-compose-injection',
    revision,
    actualInstalledComposer: { path: publicPath(installedComposer), sha256: installedDigest },
    testedComposer: { path: publicPath(path.join(vendor, 'index.js')), sha256: digests['index.js'] },
    externalServicesStarted: false,
    caseCount: results.length,
    results,
  };
}

main().then(report => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)).catch(error => {
  process.stdout.write(`${JSON.stringify({ passed: false, caseCount: results.length, results, error: error.stack }, null, 2)}\n`);
  process.exitCode = 1;
});
