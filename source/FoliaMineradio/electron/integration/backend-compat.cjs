'use strict';

const { createRequire } = require('node:module');

// electron/integration/backend-compat.cjs — adapt the licensed cache-content-type 2.1 export for the unchanged Koa 2 consumer.
function installBackendCompatibility() {
  const consumer = createRequire(require.resolve('koa/package.json'));
  const resolved = consumer.resolve('cache-content-type');
  const metadata = consumer('cache-content-type/package.json');
  if (metadata.version !== '2.1.0') throw new Error('Expected licensed cache-content-type 2.1.0.');
  const exported = consumer('cache-content-type');
  const callable = typeof exported === 'function' ? exported : exported.getType;
  if (typeof callable !== 'function') throw new Error('Content type compatibility export is missing.');
  callable.getType = callable;
  callable.default = callable;
  consumer.cache[resolved].exports = callable;
  return { version: metadata.version, resolved };
}

module.exports = { installBackendCompatibility };
