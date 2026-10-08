import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendPort = process.env.PI_LIVECRAFT_BACKEND_PORT ?? '43121'
const proxyErrorLog = fileURLToPath(new URL('./proxy-error.log', import.meta.url))
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${backendPort}`,
        configure: (proxy) => {
          // The only source of 502s — log the exact failure mode when it happens.
          proxy.on('error', (error: Error & { code?: string }, req) => {
            const line = `[${new Date().toISOString()}] ${error.code ?? 'ERROR'} ${
              req?.method ?? '?'
            } ${req?.url ?? '?'}: ${error.message}`
            console.error(`[proxy] ${line}`)
            appendFileSync(proxyErrorLog, line + '\n')
          })
        },
      },
    },
  },
})
