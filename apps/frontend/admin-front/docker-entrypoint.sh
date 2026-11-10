#!/bin/sh
set -e
# These are public URLs only; deployment validates their values.
cat <<CONFIG > /usr/share/nginx/html/config.json
{"ADMIN_SERVICE_URL":"${ADMIN_SERVICE_URL}","AUTH_SERVICE_URL":"${AUTH_SERVICE_URL}","AUTH_FRONT_URL":"${AUTH_FRONT_URL}","SHELL_FRONT_URL":"${SHELL_FRONT_URL}","GRAFANA_URL":"${GRAFANA_URL}"}
CONFIG
exec "$@"
