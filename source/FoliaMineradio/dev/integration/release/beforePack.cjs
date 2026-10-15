const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Integration-only pre-pack guard preserves the upstream native-runtime hook.
module.exports = async context => {
  const { verifyLicensedBackend } = await import(pathToFileURL(path.join(__dirname, 'licensed-backend.mjs')).href);
  await verifyLicensedBackend(path.resolve(__dirname, '../../..'));
  await require('../../../build/beforePack.cjs').default(context);
};
