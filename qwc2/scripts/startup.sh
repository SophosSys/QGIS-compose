#!/bin/sh
set -e

: "${QGIS_SERVER_URL?Need QGIS_SERVER_URL}"

# Wait for QGIS server to be reachable
until curl -fsS "${QGIS_SERVER_URL}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities" > /dev/null; do
  echo "Waiting for QGIS server... ${QGIS_SERVER_URL}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities"
  sleep 5
done

echo "Generating QWC2 themes..."
node /app/scripts/generateThemes.js || echo "Theme generation failed"

echo "Starting nginx..."
exec nginx -g 'daemon off;'
