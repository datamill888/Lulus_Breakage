import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import path from 'node:path'

// `--mode singlefile` inlines everything into one index.html for shareable previews.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'singlefile' ? [viteSingleFile()] : [])],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: mode === 'singlefile' ? { outDir: 'dist-preview' } : undefined,
  // The Incorta Apps preview proxy serves the dev server from its own host.
  server: { allowedHosts: true },
  test: { environment: 'node' },
}))
