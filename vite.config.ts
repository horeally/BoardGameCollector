import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/bgg-api': {
          target: 'https://boardgamegeek.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/bgg-api/, '/xmlapi2'),
          headers: {
            'Accept': 'application/xml',
            'Authorization': `Bearer ${env.VITE_BGG_TOKEN || ''}`,
          },
        },
      },
    },
  }
})
