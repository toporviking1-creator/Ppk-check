import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Режимы сборки:
//  - по умолчанию: офлайн-приложение (PWA) в dist/ для GitHub Pages;
//  - `--mode single`: всё приложение одним файлом dist-single/index.html (флешка, без сервера);
//  - `--mode claude`: один файл для публикации на claude.ai (помощник, сохранение файлов через платформу).
export default defineConfig(({ mode }) => {
  const single = mode === 'single' || mode === 'claude';
  return {
    base: './',
    plugins: single ? [react(), viteSingleFile()] : [react()],
    build: {
      outDir: mode === 'claude' ? 'dist-claude' : mode === 'single' ? 'dist-single' : 'dist',
      chunkSizeWarningLimit: 2000,
    },
    test: {
      environment: 'node',
    },
  };
});
