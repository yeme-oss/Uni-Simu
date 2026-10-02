import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022', // top-level await in src/main.js
    // Two pages: the app, and the admin panel (usage per IP; its API is off unless ADMIN_TOKEN is set).
    rolldownOptions: { input: { main: 'index.html', admin: 'admin.html' } },
  },
});
