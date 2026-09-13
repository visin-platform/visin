#!/bin/sh
set -e
cat <<EOF > /usr/share/nginx/html/config.json
{
  "AUTH_SERVICE_URL": "${AUTH_SERVICE_URL}",
  "AUTH_FRONT_URL": "${AUTH_FRONT_URL}",
  "VISION_FRONT_URL": "${VISION_FRONT_URL}",
  "LABEL_FRONT_URL": "${LABEL_FRONT_URL}",
  "MCP_PUBLIC_URL": "${MCP_PUBLIC_URL}",
  "GROUP_SERVICE_URL": "${GROUP_SERVICE_URL}"
}
EOF
exec "$@"

