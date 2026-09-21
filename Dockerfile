# Build a compact, precompressed static site with Node.js.
FROM node:22-alpine AS static-build

WORKDIR /build
COPY . /build/source
RUN node /build/source/scripts/build_static.js /build/source /build/dist

# The production runtime contains only Nginx and the generated static site.
FROM nginx:1.27-alpine

COPY --from=static-build /build/dist/ /usr/share/nginx/html/
COPY nginx.conf.template /etc/nginx/conf.d/default.conf
COPY config.js.template /etc/nginx/pota-config.js.template
COPY docker-entrypoint.d/40-generate-config.sh /docker-entrypoint.d/40-generate-config.sh

ENV MATOMO_ENABLED=false
ENV MATOMO_URL=
ENV MATOMO_SITE_ID=
ENV OVERPASS_URL=https://api.spainip.es/v1/overpass/interpreter
ENV POTA_CATALOGUE_URL=https://api.spainip.es/v1/pota/unmapped
ENV POTA_NAMES_URL=https://api.spainip.es/v1/pota/names
ENV POTA_STATUS_URL=https://api.spainip.es/v1/pota/status
ENV POTA_SPOTS_URL=https://api.spainip.es/v1/pota/spots

EXPOSE 80
