import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
  },
  build: {
    outDir: '../../public/games/chicken-shop',
    emptyOutDir: true,
  },
  base: '/games/chicken-shop/',
})
