#!/bin/sh
set -e
cat <<EOF > /usr/share/nginx/html/config.json
{
  "AUTH_SERVICE_URL": "${AUTH_SERVICE_URL}",
  "AUTH_FRONT_URL": "${AUTH_FRONT_URL}",
  "VISION_FRONT_URL": "${VISION_FRONT_URL}",
  "LABEL_FRONT_URL": "${LABEL_FRONT_URL}",
  "ACCOUNT_FRONT_URL": "${ACCOUNT_FRONT_URL}",
  "VISION_API_URL": "${VISION_API_URL}",
  "DATASET_API_URL": "${DATASET_API_URL}",
  "LABEL_SERVICE_URL": "${LABEL_SERVICE_URL}",
  "GROUP_SERVICE_URL": "${GROUP_SERVICE_URL}",
  "LANDING_FRONT_URL": "${LANDING_FRONT_URL}"
}
EOF
# The APIs own the live sitemaps; omit links for services that are not configured.
{
  printf 'User-agent: *\nAllow: /\n'
  [ -z "$VISION_API_URL" ] || printf 'Sitemap: %s/api/public/sitemap.xml\n' "${VISION_API_URL%/}"
  [ -z "$DATASET_API_URL" ] || printf 'Sitemap: %s/api/datasets/sitemap.xml\n' "${DATASET_API_URL%/}"
  [ -z "$AUTH_SERVICE_URL" ] || printf 'Sitemap: %s/auth/sitemap.xml\n' "${AUTH_SERVICE_URL%/}"
  [ -z "$GROUP_SERVICE_URL" ] || printf 'Sitemap: %s/api/public/sitemap.xml\n' "${GROUP_SERVICE_URL%/}"
} > /usr/share/nginx/html/robots.txt
exec "$@"
