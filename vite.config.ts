import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  root: process.cwd(),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // Paksa satu instance three.js di seluruh app — mencegah konflik
    // antara three@0.184 (root) vs three@0.170 (nested di stats-gl/maath).
    // Tanpa ini, R3F mendapat instance THREE yang berbeda dari renderer-nya,
    // sehingga Canvas render kosong tanpa error.
    dedupe: ['three', '@react-three/fiber', '@react-three/drei'],
  },
  // Pre-bundle three.js dan R3F agar Vite tidak memuat dua versi berbeda
  // di development mode. Ini kritis untuk R3F berfungsi di Vite.
  optimizeDeps: {
    include: ['three', '@react-three/fiber', '@react-three/drei'],
  },
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'react'
          if (id.includes('node_modules/@mantine')) return 'mantine'
          if (id.includes('node_modules/@tanstack')) return 'tanstack'
          if (id.includes('node_modules/react-icons')) return 'icons'
          if (id.includes('node_modules/@xyflow') || id.includes('node_modules/elkjs')) return 'xyflow'
          if (id.includes('node_modules/three') || id.includes('node_modules/@react-three')) return 'three'
          if (id.includes('node_modules/')) return 'vendor'
        },
      },
    },
  },
})
