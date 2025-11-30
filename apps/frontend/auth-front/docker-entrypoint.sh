#!/bin/sh

# Generate config.json at runtime using environment variables
cat > /usr/share/nginx/html/config.json << EOF
{
  "GOOGLE_CLIENT_ID": "${GOOGLE_CLIENT_ID}",
  "AUTH_SERVICE_URL": "${AUTH_SERVICE_URL}",
  "PUBLIC_API_URL": "${PUBLIC_API_URL}"
}
EOF

echo "Generated config.json with runtime environment variables:"
cat /usr/share/nginx/html/config.json

# Execute the original command
exec "$@"

