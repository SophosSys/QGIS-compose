/*
 * fetch-wms-themes.js
 *
 * Build QWC2-compatible themes.json (with themes.items[]) and themesConfig.json.
 *
 * Usage:
 *   node fetch-wms-themes.js \
 *     <getCapabilitiesUrl> \
 *     <themeName> \
 *     <themesTemplate.json> \
 *     <themesConfigTemplate.json> \
 *     <outputThemes.json> \
 *     <outputThemesConfig.json>
 */

const axios = require('axios');
const xml2js = require('xml2js');
const fs = require('fs-extra');
const { URL } = require('url');

async function fetchLayers(capUrl) {
  const { data: xml } = await axios.get(capUrl);
  const parser = new xml2js.Parser({ explicitArray: false });
  const result = await parser.parseStringPromise(xml);

  // WMS 1.3.0: WMS_Capabilities > Capability > Layer > Layer[]
  const top = result?.WMS_Capabilities?.Capability?.Layer;
  if (!top) return [];
  const layers = Array.isArray(top.Layer) ? top.Layer : (top.Layer ? [top.Layer] : []);
  return layers
    .filter(l => !!l?.Name) // only actual named layers
    .map(l => ({
      name: l.Name,
      title: l.Title || l.Name
    }));
}

function normalizeThemesShape(themesData) {
  // Goal shape:
  // { themes: { items: [], subdirs: [], backgroundLayers: [] } }
  let items = [];
  let subdirs = [];
  let backgroundLayers = [];

  if (Array.isArray(themesData)) {
    items = themesData;
  } else if (themesData && Array.isArray(themesData.themes)) {
    items = themesData.themes;
  } else if (themesData && themesData.themes) {
    const t = themesData.themes;
    items = Array.isArray(t.items) ? t.items : (Array.isArray(t) ? t : []);
    subdirs = Array.isArray(t.subdirs) ? t.subdirs : [];
    backgroundLayers = Array.isArray(t.backgroundLayers) ? t.backgroundLayers : [];
  }

  return {
    themes: {
      items,
      subdirs,
      backgroundLayers
    }
  };
}

async function fetchExtentAndBbox(capUrl) {
  const { data: xml } = await axios.get(capUrl);
  const parser = new xml2js.Parser({ explicitArray: false });
  const cap = await parser.parseStringPromise(xml);
  const top = cap?.WMS_Capabilities?.Capability?.Layer;
  if (!top) return null;

  // Try WMS BoundingBox (project CRS if advertised)
  const bbs = top.BoundingBox ? (Array.isArray(top.BoundingBox) ? top.BoundingBox : [top.BoundingBox]) : [];
  for (const bb of bbs) {
    const a = bb?.$ || {};
    const crs = a.CRS || a.SRS || null;
    const minx = parseFloat(a.minx), miny = parseFloat(a.miny), maxx = parseFloat(a.maxx), maxy = parseFloat(a.maxy);
    if ([minx, miny, maxx, maxy].every(Number.isFinite)) {
      return {
        mapCrs: crs || undefined,
        extent: [minx, miny, maxx, maxy],
        bbox: crs ? { crs, bounds: [minx, miny, maxx, maxy] } : undefined
      };
    }
  }

  // Fallback: EX_GeographicBoundingBox (EPSG:4326)
  const ex = top.EX_GeographicBoundingBox;
  if (ex) {
    const west = parseFloat(ex.westBoundLongitude);
    const east = parseFloat(ex.eastBoundLongitude);
    const south = parseFloat(ex.southBoundLatitude);
    const north = parseFloat(ex.northBoundLatitude);
    if ([west, south, east, north].every(Number.isFinite)) {
      return {
        mapCrs: "EPSG:4326",
        extent: [west, south, east, north],
        bbox: { crs: "EPSG:4326", bounds: [west, south, east, north] }
      };
    }
  }
  return null;
}

function buildThemeEntry({ themeKey, wmsUrl, sublayers, extentInfo }) {
  const theme = {
    id: themeKey,
    name: themeKey,
    title: themeKey,
    abstract: `Layers from ${themeKey}`,
    url: process.env.QGIS_SERVER_PUBLIC_URL || wmsUrl,
    version: '1.3.0',
    format: 'image/png',
    transparent: true,
    tiled: false,
    sublayers: sublayers.map((l, idx) => ({
      name: l.name,
      title: l.title,
      visibility: idx === 0
    }))
  };

  if (extentInfo?.extent?.length === 4) {
    theme.extent = extentInfo.extent;                // <- REQUIRED by computeZoom
    if (extentInfo.mapCrs) theme.mapCrs = extentInfo.mapCrs;
    const [minx, miny, maxx, maxy] = extentInfo.extent;
    theme.center = [(minx + maxx) / 2, (miny + maxy) / 2];  // <- avoid 'center' undefined
    if (extentInfo.bbox) theme.initialBbox = extentInfo.bbox;      // <- QWC2-style bbox object
  }

  return theme;
}




function deriveWmsUrlFromCapabilities(capUrlStr) {
  // Keep the endpoint and the MAP parameter only
  const u = new URL(capUrlStr);
  const base = `${u.origin}${u.pathname}`;
  const map = u.searchParams.get('MAP');
  if (map) {
    const out = new URL(base);
    out.searchParams.set('MAP', map);
    return out.toString();
  }
  // If no MAP given, return bare endpoint; QWC2 will add WMS params as needed
  return base;
}

async function main() {
  const [,, capUrl, themeKey, themesTplPath, themesCfgTplPath, outThemes, outCfg] = process.argv;
  if (!capUrl || !themeKey || !themesTplPath || !themesCfgTplPath || !outThemes || !outCfg) {
    console.error('Usage: node fetch-wms-themes.js <capUrl> <themeName> <themesTpl> <themesCfgTpl> <outThemes> <outCfg>');
    process.exit(1);
  }

  try {
    console.log(`Fetching GetCapabilities from ${capUrl}`);
    const sublayers = await fetchLayers(capUrl);
    console.log(`Found ${sublayers.length} named layers.`);

    // Load templates/outputs and normalize to QWC2 shape
    const themesSrc = (await fs.pathExists(outThemes)) ? outThemes : themesTplPath;
    const cfgSrc = (await fs.pathExists(outCfg)) ? outCfg : themesCfgTplPath;

    const themesDataRaw = await fs.readJson(themesSrc);
    const cfgDataRaw = await fs.readJson(cfgSrc);

    const themesNorm = normalizeThemesShape(themesDataRaw);
    const backgroundLayers = themesNorm.themes.backgroundLayers || [];
    const subdirs = themesNorm.themes.subdirs || [];
    let items = themesNorm.themes.items || [];
 
    const extentInfo = await fetchExtentAndBbox(capUrl);
    const wmsUrl = deriveWmsUrlFromCapabilities(capUrl);
    const themeEntry = buildThemeEntry({ themeKey, wmsUrl, sublayers, extentInfo });
    
    // Mark as default in themes.json as well
    themeEntry.default = true; 

    // Replace or append by id/name
    items = items.filter(t => (t.id || t.name) !== themeKey);
    items.push(themeEntry);

    // Save themes.json
    const themesOut = {
      themes: {
        items,
        subdirs,
        backgroundLayers
      }
    };
    await fs.writeJson(outThemes, themesOut, { spaces: 2 });
    console.log(`Wrote themes to ${outThemes}`);

    // Merge into themesConfig.json
    const cfg = { ...cfgDataRaw };
    const cfgThemes = Array.isArray(cfg.themes) ? cfg.themes : [];
    const cfgFiltered = cfgThemes.filter(t => (t.id || t.name) !== themeKey);
    cfgFiltered.push({ id: themeKey, name: themeKey, default: true });
    cfg.themes = cfgFiltered;

    await fs.writeJson(outCfg, cfg, { spaces: 2 });
    console.log(`Wrote themesConfig to ${outCfg}`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
