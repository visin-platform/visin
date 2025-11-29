#!/bin/sh

cat > /usr/share/nginx/html/config.json << EOF
{
  "APP_URL": "${APP_URL:-https://app.visin.eu}"
}
EOF

echo "Generated config.json with runtime environment variables:"
cat /usr/share/nginx/html/config.json

exec "$@"

