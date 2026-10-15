const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Integration-only post-pack evidence is written before NSIS includes the resources directory.
module.exports = async context => {
  await require('../../../build/afterPack.cjs').default(context);
  const { verifyShippingScope } = await import(pathToFileURL(path.join(__dirname, 'shipping-scope.mjs')).href);
  await verifyShippingScope({ repo: path.resolve(__dirname, '../../..'), appOutDir: context.appOutDir });
};
