import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig(({command})=>({ plugins: [react(),tailwindcss()], define:command==='build'?{'process.env.NODE_ENV':JSON.stringify('production')}:{}, build: { outDir: 'dist/client' } }));
