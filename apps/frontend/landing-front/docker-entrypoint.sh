#!/bin/sh

HTML=/usr/share/nginx/html

cat > $HTML/config.json << EOF
{
  "SHELL_FRONT_URL": "${SHELL_FRONT_URL}",
  "MCP_PUBLIC_URL": "${MCP_PUBLIC_URL}",
  "VISION_API_URL": "${VISION_API_URL}",
  "AUTH_SERVICE_URL": "${AUTH_SERVICE_URL}"
}
EOF

echo "Generated config.json with runtime environment variables:"
cat $HTML/config.json

# The page's own public address, for what has to name it absolutely: the
# canonical link, the Open Graph and Twitter image URLs, the sitemap and
# llms.txt. Visin is self-hosted on its operator's domain, so nothing can
# default here; unset, those tags and the sitemap are dropped rather than left
# pointing elsewhere, and llms.txt keeps its links relative to this site.
SITE_URL="${LANDING_FRONT_URL%/}"
if [ -n "$SITE_URL" ]; then
  sed -i "s#__LANDING_FRONT_URL__#${SITE_URL}#g" $HTML/index.html $HTML/robots.txt $HTML/sitemap.xml $HTML/llms.txt
else
  sed -i '/__LANDING_FRONT_URL__/d' $HTML/index.html $HTML/robots.txt
  rm -f $HTML/sitemap.xml
  sed -i 's#__LANDING_FRONT_URL__##g' $HTML/llms.txt
fi

exec "$@"
