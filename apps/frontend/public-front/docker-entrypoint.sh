#!/bin/sh

cat > /usr/share/nginx/html/config.json << EOF
{
  "VISION_API_URL": "${VISION_API_URL}"
}
EOF

echo "Generated config.json with runtime environment variables:"
cat /usr/share/nginx/html/config.json

exec "$@"

