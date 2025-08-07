#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const srcDir = process.env.QGIS_PROJECTS_DIR || path.resolve(__dirname, '../../data');
const destDir = path.resolve(__dirname, '../static/qgis');


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
