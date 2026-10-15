const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// electron/integration/main.cjs — isolate the combined player's storage before Folia initializes.
process.env.FOLIA_INTEGRATION_BUILD = 'true';
app.setName('Folia Mineradio');
const dataDirectory = process.env.FOLIA_INTEGRATION_DATA_DIR
  ? path.resolve(process.env.FOLIA_INTEGRATION_DATA_DIR)
  : path.join(app.getPath('appData'), 'Folia Mineradio');
fs.mkdirSync(dataDirectory, { recursive: true });
app.setPath('userData', dataDirectory);
app.setPath('sessionData', dataDirectory);
require('./backend-compat.cjs').installBackendCompatibility();
require('../main.cjs');
