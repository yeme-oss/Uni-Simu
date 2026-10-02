// Loads settings from a .env file in the project folder, if there is one (Node's built-in
// loader, no dependency). Imported first by server.js, before any module reads its settings.
// Real environment variables win over the file (so hosts like Railway can override it).
// See .env.example for every setting.
try {
  process.loadEnvFile('.env');
} catch (err) {
  if (err.code !== 'ENOENT') console.warn('[env] could not read .env:', err.message);
}
