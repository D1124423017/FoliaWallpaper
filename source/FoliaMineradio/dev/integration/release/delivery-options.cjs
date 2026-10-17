const path = require('node:path');

// dev/integration/release/delivery-options.cjs — validated local artifact identity shared by package and source delivery.
module.exports = function getIntegrationDelivery(repo) {
  const revision = process.env.FOLIA_INTEGRATION_DELIVERY_REVISION ?? 'license.1';
  if (revision.length > 64 || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(revision))
    throw new Error('FOLIA_INTEGRATION_DELIVERY_REVISION must be a short lowercase artifact label.');
  const outputRoot = path.resolve(repo, '../../outputs');
  const output = process.env.FOLIA_INTEGRATION_OUTPUT_DIR
    ? path.resolve(repo, process.env.FOLIA_INTEGRATION_OUTPUT_DIR)
    : path.join(outputRoot, 'FoliaMineradio');
  const relative = path.relative(outputRoot, output);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw new Error('FOLIA_INTEGRATION_OUTPUT_DIR must be a child folder of this workspace outputs directory.');
  return { revision, output };
};
