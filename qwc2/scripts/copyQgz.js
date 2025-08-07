#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const srcDir = process.env.QGIS_PROJECTS_DIR || path.resolve(__dirname, '../../data');
const destDir = path.resolve(__dirname, '../static/qgis');
const qgisUrl = process.env.QGIS_SERVER_URL || 'http://localhost:8080/qgisserver';
const themesPath = path.resolve(__dirname, '../themes.json');
const themesCfgPath = path.resolve(__dirname, '../themesConfig.json');

function buildThemes(projectFiles) {
  for (const file of projectFiles) {
    const projectName = path.basename(file, '.qgz');
    const mapPath = `/io/data/${file}`;
    const capUrl = `${qgisUrl}?MAP=${encodeURIComponent(mapPath)}&SERVICE=WMS&REQUEST=GetCapabilities`;
    try {
      execFileSync('node', [path.resolve(__dirname, '../fetch-wms-themes.js'), capUrl, projectName, themesPath, themesCfgPath, themesPath, themesCfgPath], { stdio: 'inherit' });
    } catch (err) {
      console.error(`Failed to build theme for ${projectName}: ${err.message}`);
    }
  }
}

async function main() {
  try {
    if (!fs.existsSync(srcDir)) {
      console.error(`Source directory not found: ${srcDir}`);
      return;
    }
    fs.mkdirSync(destDir, { recursive: true });
    const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.qgz'));
    files.forEach(file => {
      fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
    });
    console.log(`Copied ${files.length} QGIS project(s) to ${destDir}`);
    buildThemes(files);
  } catch (err) {
    console.error('Failed to process QGIS projects:', err.message);
  }
}

main();
