const path = require('node:path');
const metadata = require('../../../package.json');

// dev/integration/release/electron-builder.cjs — independent local Windows package; no upstream publishing.
const repo = path.resolve(__dirname, '../../..');
module.exports = {
  extends: null,
  appId: 'local.folia.mineradio',
  productName: 'Folia Mineradio',
  copyright: 'Copyright © Folia and Mineradio contributors',
  electronVersion: require('../../../node_modules/electron/package.json').version,
  electronDist: process.env.FOLIA_INTEGRATION_ELECTRON_DIST || undefined,
  npmRebuild: false,
  extraMetadata: {
    name: 'folia-mineradio',
    productName: 'Folia Mineradio',
    version: `${metadata.version}-integration.4`,
    description: 'Folia 與 Mineradio 整合播放器（本機預覽版）',
    main: 'electron/integration/main.cjs',
    foliaReleaseChannel: 'internal',
    foliaDeliveryRevision: 'license.1',
  },
  directories: {
    output: path.resolve(repo, '../../outputs/FoliaMineradio'),
    buildResources: 'build',
  },
  publish: null,
  toolsets: { nsis: '1.2.1' },
  forceCodeSigning: false,
  generateUpdatesFilesForAllChannels: false,
  beforePack: 'dev/integration/release/beforePack.cjs',
  afterPack: 'dev/integration/release/afterPack.cjs',
  electronLanguages: ['en-US', 'zh-CN', 'zh-TW'],
  files: [
    { from: '.integration-build/dist', to: 'dist', filter: ['**/*', '!integration/mineradio/vendor/sonic-workshop{,/**/*}',
      '!integration/mineradio/vendor/sonic-topography{,/**/*}'] },
    'electron/**/*', 'shared/**/*', 'package.json', 'LICENSE',
    'build/miao.png', 'build/thumbar/*.png',
    // This independent player disables the upstream updater before loading it.
    // Keep its manifest declarations in source, but do not distribute unused updater code.
    '!node_modules/electron-updater{,/**/*}', '!node_modules/lazy-val{,/**/*}',
    '!.integration-build/dist/**/sonic-workshop{,/**/*}', '!.integration-build/dist/**/sonic-topography{,/**/*}',
  ],
  asarUnpack: [
    'electron/analysis/htdemucs_runner.py',
    'node_modules/@koromix/koffi-*/**/*.node',
  ],
  extraResources: [
    { from: 'build/ffmpeg/win-x64', to: 'ffmpeg-audio' },
    { from: 'build/icon.png', to: 'icon.png' },
    { from: 'build/trayTemplate.png', to: 'trayTemplate.png' },
    { from: 'build/trayTemplate@2x.png', to: 'trayTemplate@2x.png' },
    { from: '.integration-build/licenses', to: 'licenses' },
    { from: 'docs/integration', to: 'docs', filter: ['**/*'] },
    { from: 'docs/integration/USER-GUIDE.md', to: '使用說明.md' },
    { from: 'docs/integration/KNOWN-LIMITATIONS.md', to: '已知限制.md' },
  ],
  win: {
    executableName: 'Folia Mineradio',
    icon: 'build/icon.png',
    signAndEditExecutable: false,
    target: [{ target: 'nsis', arch: ['x64'] }],
    artifactName: 'Folia-Mineradio-Setup-${version}-license.1-${arch}.${ext}',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Folia Mineradio',
    uninstallDisplayName: 'Folia Mineradio',
    installerLanguages: ['zh_TW', 'en_US', 'zh_CN'],
    language: '1028',
    include: 'dev/integration/release/installer.nsh',
    license: 'docs/integration/INSTALLER-LICENSE.txt',
  },
};
