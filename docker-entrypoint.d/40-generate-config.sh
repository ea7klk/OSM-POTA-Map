#!/bin/sh
set -eu

envsubst '${MATOMO_ENABLED} ${MATOMO_URL} ${MATOMO_SITE_ID} ${OVERPASS_URL} ${POTA_CATALOGUE_URL} ${POTA_NAMES_URL} ${POTA_SPOTS_URL}' \
  < /etc/nginx/pota-config.js.template \
  > /usr/share/nginx/html/config.js
