import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],clearScreen:false,server:{port:1420,strictPort:true,host:'127.0.0.1'},envPrefix:['VITE_','TAURI_'],build:{outDir:'app-dist',target:['es2021','chrome100','safari13'],minify:'esbuild',sourcemap:!!process.env.TAURI_DEBUG}});
