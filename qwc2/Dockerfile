FROM nginx:stable

RUN apt-get update && apt-get install -y nodejs npm curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY fetch-wms-themes.js ./fetch-wms-themes.js
COPY themes.json ./themes.json
COPY themesConfig.json ./themesConfig.json
COPY scripts/generateThemes.js ./scripts/generateThemes.js
COPY scripts/startup.sh /startup.sh

RUN npm init -y >/dev/null 2>&1 && npm install axios xml2js fs-extra >/dev/null 2>&1 \
    && chmod +x /startup.sh

CMD ["/startup.sh"]
