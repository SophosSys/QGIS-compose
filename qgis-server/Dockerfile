ARG BASE_IMAGE
FROM ${BASE_IMAGE}

USER root

# Patch start-xvfb-nginx.sh to use $! instead of pidof, avoiding the Rosetta mismatch
RUN sed -i \
  -e 's@/usr/bin/Xvfb :99 .*&@& \\'$'\n''XVFB_PID=$!@' \
  -e 's@XVFB_PID=$(waitfor /usr/bin/Xvfb)@XVFB_PID=$!@' \
  /usr/local/bin/start-xvfb-nginx.sh




RUN chmod +x /usr/local/bin/start-xvfb-nginx.sh

USER www-data
