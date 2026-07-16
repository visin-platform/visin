#!/bin/sh
set -e
cat <<EOF > /usr/share/nginx/html/config.json
{
  "AUTH_SERVICE_URL": "${AUTH_SERVICE_URL}",
  "AUTH_FRONT_URL": "${AUTH_FRONT_URL}",
  "LABEL_SERVICE_URL": "${LABEL_SERVICE_URL}"
}
EOF
exec "$@"

