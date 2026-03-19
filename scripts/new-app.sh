#!/usr/bin/env bash
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <app-name>"
  exit 1
fi

APP_NAME="$1"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT_DIR/apps/$APP_NAME"

if [ -d "$APP_DIR" ]; then
  echo "Error: $APP_DIR already exists"
  exit 1
fi

echo "Creating app: $APP_NAME"

mkdir -p "$APP_DIR/src" "$APP_DIR/public"

# package.json
cat > "$APP_DIR/package.json" << ENDJSON
{
  "name": "@micro-apps/$APP_NAME",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@micro-apps/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vite-plugin-pwa": "^0.20.0"
  }
}
ENDJSON

# vite.config.ts
cat > "$APP_DIR/vite.config.ts" << 'ENDVITE'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
    }),
  ],
});
ENDVITE

# tsconfig.json
cat > "$APP_DIR/tsconfig.json" << 'ENDTS'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "noEmit": true
  },
  "include": ["src"]
}
ENDTS

# index.html
cat > "$APP_DIR/index.html" << ENDHTML
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>$APP_NAME</title>
    <link rel="manifest" href="/manifest.json" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
ENDHTML

# src/main.tsx
cat > "$APP_DIR/src/main.tsx" << 'ENDMAIN'
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@micro-apps/shared';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
);
ENDMAIN

# src/App.tsx
cat > "$APP_DIR/src/App.tsx" << ENDAPP
import { Layout } from '@micro-apps/shared';

export default function App() {
  return (
    <Layout title="$APP_NAME">
      <p>Welcome to $APP_NAME</p>
    </Layout>
  );
}
ENDAPP

# src/App.module.css
touch "$APP_DIR/src/App.module.css"

# public/manifest.json
cat > "$APP_DIR/public/manifest.json" << ENDMANIFEST
{
  "name": "$APP_NAME",
  "short_name": "$APP_NAME",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0071e3",
  "icons": []
}
ENDMANIFEST

echo "App created at $APP_DIR"
echo "Run: pnpm install && pnpm --filter @micro-apps/$APP_NAME dev"
