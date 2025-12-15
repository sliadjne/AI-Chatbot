#!/bin/sh
set -e

# Create a small runtime env JS file that the app can read from window.__ENV__
cat > /usr/share/nginx/html/env.js <<EOF
window.__ENV__ = {
  VITE_API_URL: "${VITE_API_URL:-}" 
};
EOF

# exec the container's CMD
exec "$@"
