import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  main: { build: { rollupOptions: { input: { index: resolve('src/main/index.ts'), emulator: resolve('src/main/emulator/host.ts') } } } },
  preload: {},
  renderer: { plugins: [react()], resolve: { dedupe: ['react', 'react-dom'] },
    optimizeDeps: { include: ['react', 'react-dom/client', 'react/jsx-runtime', 'three', 'three/addons/loaders/GLTFLoader.js'] },
    build: { rollupOptions: { input: {
    index: resolve('src/renderer/index.html'), splash: resolve('src/renderer/splash.html')
  } } } }
})
