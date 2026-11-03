#!/bin/sh
set -e
cat <<JSON > /usr/share/nginx/html/config.json
{"AUTH_SERVICE_URL":"${AUTH_SERVICE_URL}","AUTH_FRONT_URL":"${AUTH_FRONT_URL}","CHAT_SERVICE_URL":"${CHAT_SERVICE_URL}","ACCOUNT_FRONT_URL":"${ACCOUNT_FRONT_URL}"}
JSON
exec "$@"
