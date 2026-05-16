#!/bin/sh
set -e
printf "window.OR_DEFAULT_KEY='%s';\n" "${OR_KEY:-}" > /usr/share/nginx/html/config.js
exec /docker-entrypoint.sh nginx -g 'daemon off;'
