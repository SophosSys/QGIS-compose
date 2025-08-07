#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const dataDir = process.env.QGIS_PROJECTS_DIR || '/io/data';
const outputDir = process.env.QWC2_PROD_DIR || '/usr/share/nginx/html';
const qgisUrl = process.env.QGIS_SERVER_URL || 'http://qgis-server:8080/qgisserver';

const themesTpl = path.resolve(__dirname, '../themes.json');
const themesCfgTpl = path.resolve(__dirname, '../themesConfig.json');
const outThemes = path.join(outputDir, 'themes.json');
const outCfg = path.join(outputDir, 'themesConfig.json');

function buildThemes(files) {
  for (const file of files) {
    const name = path.basename(file, '.qgz');
    const mapPath = `/io/data/${file}`;
    const capUrl = `${qgisUrl}?MAP=${encodeURIComponent(mapPath)}&SERVICE=WMS&REQUEST=GetCapabilities`;
    try {
      execFileSync('node', [path.resolve(__dirname, '../fetch-wms-themes.js'), capUrl, name, outThemes, outCfg, outThemes, outCfg], { stdio: 'inherit' });
    } catch (err) {
      console.error(`Failed to build theme for ${name}: ${err.message}`);
    }
  }
}

function main() {
  if (!fs.existsSync(dataDir)) {
    console.error(`Projects directory not found: ${dataDir}`);
    return;
  }
  fs.mkdirSync(outputDir, { recursive: true });
  fs.copyFileSync(themesTpl, outThemes);
  fs.copyFileSync(themesCfgTpl, outCfg);
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.qgz'));
  buildThemes(files);
}

main();
