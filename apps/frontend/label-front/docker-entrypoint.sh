#!/bin/sh
set -e
cat <<EOF > /usr/share/nginx/html/config.json
{
  "AUTH_SERVICE_URL": "${AUTH_SERVICE_URL}",
  "AUTH_FRONT_URL": "${AUTH_FRONT_URL}",
  "LABEL_SERVICE_URL": "${LABEL_SERVICE_URL}",
  "VISION_FRONT_URL": "${VISION_FRONT_URL}",
  "ACCOUNT_FRONT_URL": "${ACCOUNT_FRONT_URL}"
}
EOF
exec "$@"

