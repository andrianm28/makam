# opencode.makam.co.id/app: OpenCode web app (packages/app)

type: vite static (dist/)
deploy: /var/www/opencode-app/
serve: nginx alias /app/ (same domain) or subdomain app.opencode.makam.co.id
build: cd packages/app && bun run build
