/*
 * Post-build step for the service worker.
 *
 * Vite emits the app's hashed JS/CSS after `vite build`, so the static
 * `public/sw.js` cannot know them. This script injects:
 *   - PRECACHE_ASSETS: every hashed build asset, so the whole app works
 *     offline from the first visit (not just after a second, controlled load);
 *   - BUILD: a hash of that asset list, used as the cache name, so each deploy
 *     invalidates the previous cache automatically.
 *
 * It also removes the stale sw.js.gz produced by vite-plugin-compression
 * (it was compressed before injection and could be served by gzip_static).
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const distDir = fileURLToPath(new URL('../dist/', import.meta.url));
const assetsDir = join(distDir, 'assets');

const files = (await readdir(assetsDir))
  .filter((name) => /\.(js|css)$/.test(name))
  .sort();
if (!files.length) {
  throw new Error(`[sw] no JS/CSS assets found in ${assetsDir}`);
}

const assets = files.map((name) => '/assets/' + name);
const buildId = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12);

const swPath = join(distDir, 'sw.js');
let sw = await readFile(swPath, 'utf8');
if (!sw.includes("'__BUILD_ID__'") || !sw.includes('const PRECACHE_ASSETS = [];')) {
  throw new Error('[sw] sw.js is missing its build placeholders');
}
sw = sw
  .replace("'__BUILD_ID__'", JSON.stringify(buildId))
  .replace('const PRECACHE_ASSETS = [];', 'const PRECACHE_ASSETS = ' + JSON.stringify(assets) + ';');
await writeFile(swPath, sw);

await rm(swPath + '.gz', { force: true });
await rm(swPath + '.br', { force: true });

console.log(`[sw] precached ${assets.length} assets, cache addredance-${buildId}`);
