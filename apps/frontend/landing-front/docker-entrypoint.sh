#!/bin/sh

HTML=/usr/share/nginx/html

cat > $HTML/config.json << EOF
{
  "VISION_FRONT_URL": "${VISION_FRONT_URL}",
  "VISION_API_URL": "${VISION_API_URL}",
  "MCP_PUBLIC_URL": "${MCP_PUBLIC_URL}"
}
EOF

echo "Generated config.json with runtime environment variables:"
cat $HTML/config.json

# The page's own public address, for what has to name it absolutely: the
# canonical link, the Open Graph and Twitter image URLs, and the sitemap. Visin
# is self-hosted on its operator's domain, so nothing can default here; unset,
# those tags and the sitemap are dropped rather than left pointing elsewhere.
SITE_URL="${LANDING_FRONT_URL%/}"
if [ -n "$SITE_URL" ]; then
  sed -i "s#__LANDING_FRONT_URL__#${SITE_URL}#g" $HTML/index.html $HTML/robots.txt $HTML/sitemap.xml
else
  sed -i '/__LANDING_FRONT_URL__/d' $HTML/index.html $HTML/robots.txt
  rm -f $HTML/sitemap.xml
fi

exec "$@"
