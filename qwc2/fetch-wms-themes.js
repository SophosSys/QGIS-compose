/*
 * fetch-wms-themes.js
 *
 * Automates fetching WMS GetCapabilities, parsing layer definitions,
 * and merging them into QWC2 themes.json and themesConfig.json templates.
 *
 * Usage:
 *   node fetch-wms-themes.js \
 *     <getCapabilitiesUrl> \
 *     <themeName> \
 *     <themesTemplate.json> \
 *     <themesConfigTemplate.json> \
 *     <outputThemes.json> \
 *     <outputThemesConfig.json>
 *
 * Dependencies:
 *   npm install axios xml2js fs-extra
 */

const axios = require('axios');
const xml2js = require('xml2js');
const fs = require('fs-extra');

async function fetchLayers(url) {
  const { data: xml } = await axios.get(url);
  const parser = new xml2js.Parser({ explicitArray: false });
  const result = await parser.parseStringPromise(xml);
  const top = result.WMS_Capabilities.Capability.Layer;
  const layers = Array.isArray(top.Layer) ? top.Layer : [top.Layer];
  return layers.map(l => ({
    name: l.Name,
    title: l.Title || l.Name,
    crs: Array.isArray(l.CRS) ? l.CRS : [l.CRS]
  }));
}

async function main() {
  const [,, capUrl, themeKey, themesTplPath, themesCfgTplPath, outThemes, outCfg] = process.argv;
  if (!capUrl || !themeKey || !themesTplPath || !themesCfgTplPath || !outThemes || !outCfg) {
    console.error('Usage: node fetch-wms-themes.js <capUrl> <themeName> <themesTpl> <themesCfgTpl> <outThemes> <outCfg>');
    process.exit(1);
  }

  try {
    console.log(`Fetching GetCapabilities from ${capUrl}`);
    const layers = await fetchLayers(capUrl);
    console.log(`Found ${layers.length} layers.`);

    // Load themes.json (could be array or object with 'themes')
    const themesData = await fs.readJson(themesTplPath);
    let themesArray;
    let themesIsArray = false;
    if (Array.isArray(themesData)) {
      themesArray = themesData;
      themesIsArray = true;
    } else {
      themesData.themes = Array.isArray(themesData.themes) ? themesData.themes : [];
      themesArray = themesData.themes;
    }

    // Load themesConfig.json
    const cfgData = await fs.readJson(themesCfgTplPath);
    cfgData.themes = Array.isArray(cfgData.themes) ? cfgData.themes : [];
    const cfgArray = cfgData.themes;

    // Build theme entry
    const themeEntry = {
      name: themeKey,
      title: themeKey,
      abstract: `Layers from ${themeKey}`,
      layers: layers.map(l => ({
        type: 'WMS',
        baseUrl: capUrl.replace(/\?.*$/, ''),
        layers: l.name,
        title: l.title,
        version: '1.3.0',
        format: 'image/png',
        transparent: true,
        styles: '',
        crs: l.crs
      }))
    };

    // Remove any existing entry
    themesArray = themesArray.filter(t => t.name !== themeKey);
    themesArray.push(themeEntry);

    // Update themesData structure
    const newThemesOutput = themesIsArray ? themesArray : { ...themesData, themes: themesArray };

    // Merge into themesConfig.json: enable the new theme
    const cfgFiltered = cfgArray.filter(t => (t.name || t.id) !== themeKey);
    cfgFiltered.push({ name: themeKey, default: false });
    cfgData.themes = cfgFiltered;

    // Write outputs
    await fs.writeJson(outThemes, newThemesOutput, { spaces: 2 });
    console.log(`Wrote themes to ${outThemes}`);
    await fs.writeJson(outCfg, cfgData, { spaces: 2 });
    console.log(`Wrote themesConfig to ${outCfg}`);

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
