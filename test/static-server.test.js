const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
const nginxConfig = fs.readFileSync(path.join(root, 'nginx.conf.template'), 'utf8');
const testFleet = fs.readFileSync(path.join(root, 'fleet/potamap-test/resources.yaml'), 'utf8');

test('uses an Nginx-only serving image with a Node build stage', () => {
  assert.match(dockerfile, /FROM node:22-alpine AS static-build/);
  assert.match(dockerfile, /RUN node \/build\/source\/scripts\/build_static\.js/);
  assert.match(dockerfile, /FROM nginx:1\.27-alpine/);
  assert.match(dockerfile, /EXPOSE 80/);
  assert.doesNotMatch(dockerfile, /CMD \["node", "server\.js"\]/);
});

test('Nginx serves runtime configuration and preserves removed API 404s', () => {
  assert.match(nginxConfig, /location = \/config\.js/);
  assert.match(nginxConfig, /Cache-Control "no-store"/);
  assert.match(nginxConfig, /location \^~ \/api\//);
  assert.match(nginxConfig, /return 404/);
  assert.match(nginxConfig, /gzip_static on/);
});

test('test Fleet deployment targets the Nginx port and image defaults', () => {
  assert.match(testFleet, /image: ghcr\.io\/ea7klk\/osm-pota-map:test/);
  assert.match(testFleet, /containerPort: 80/);
  assert.doesNotMatch(testFleet, /server\.js/);
  assert.doesNotMatch(testFleet, /port: 3000/);
  assert.match(testFleet, /port: 80/);
});

test('static build optimizes HTML/CSS and creates precompressed assets', () => {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'osm-pota-map-static-'));
  try {
    const result = spawnSync(process.execPath, [
      path.join(root, 'scripts/build_static.js'),
      root,
      outputRoot,
    ], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.ok(fs.existsSync(path.join(outputRoot, 'index.html.gz')));
    assert.ok(fs.existsSync(path.join(outputRoot, 'app.js.gz')));
    assert.ok(fs.existsSync(path.join(outputRoot, 'help/en.html')));
    assert.ok(fs.existsSync(path.join(outputRoot, 'docs/images/04-en-select-park.png')));
    const index = fs.readFileSync(path.join(outputRoot, 'index.html'), 'utf8');
    assert.match(index, /bbox-limits\.js\?v=[0-9a-f]{12}/);
    assert.match(index, /spots\.js\?v=[0-9a-f]{12}/);
    assert.match(index, /app\.js\?v=[0-9a-f]{12}/);
    assert.match(index, /styles\.css\?v=[0-9a-f]{12}/);
    assert.ok(fs.statSync(path.join(outputRoot, 'index.html')).size < fs.statSync(path.join(root, 'index.html')).size);
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});
