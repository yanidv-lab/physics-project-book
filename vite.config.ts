import os from 'node:os';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

function getLanUrls(port: number): string[] {
  const nets = os.networkInterfaces();
  const preferred: string[] = [];
  const others: string[] = [];

  for (const [name, addrs] of Object.entries(nets)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      if (addr.address.startsWith('169.254.')) continue;
      const url = `http://${addr.address}:${port}/`;
      if (/wi-?fi|wlan|ethernet/i.test(name)) {
        preferred.push(url);
      } else {
        others.push(url);
      }
    }
  }
  return [...preferred, ...others];
}

function lanInfoPlugin(): Plugin {
  return {
    name: 'lan-info-endpoint',
    configureServer(server) {
      server.middlewares.use('/__lan-info', (_req, res) => {
        const addr = server.httpServer?.address();
        const port = typeof addr === 'object' && addr ? addr.port : 5173;
        const urls = getLanUrls(port);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ port, urls }));
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [lanInfoPlugin()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
  },
  test: {
    environment: 'node',
  },
});
