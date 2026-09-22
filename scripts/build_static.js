#!/usr/bin/env node
/** Build the Nginx document root without requiring a Node.js runtime at serving time. */

const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const zlib = require('node:zlib');

const sourceRoot = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const outputRoot = path.resolve(process.argv[3] || path.join(sourceRoot, 'dist'));

const rootFiles = [
  'index.html',
  'app.js',
  'bbox-limits.js',
  'spots.js',
  'styles.css',
  'pota-logo-38x38.png',
  'pota_marker.png',
  'pota_marker_inactive.png',
];
const directories = ['help', 'docs/images'];
const compressibleExtensions = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt']);
const versionedAssets = ['bbox-limits.js', 'spots.js', 'app.js', 'styles.css'];

function optimizeHtml(content) {
  return content
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

function optimizeCss(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .trim();
}

function getAssetVersion(relativePath) {
  const content = fs.readFileSync(path.join(sourceRoot, relativePath));
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12);
}

function versionIndexAssets(content) {
  return versionedAssets.reduce((result, relativePath) => {
    const assetName = path.basename(relativePath);
    const version = getAssetVersion(relativePath);

    return result
      .replaceAll(`src="${assetName}"`, `src="${assetName}?v=${version}"`)
      .replaceAll(`src="/${assetName}"`, `src="/${assetName}?v=${version}"`)
      .replaceAll(`href="${assetName}"`, `href="${assetName}?v=${version}"`)
      .replaceAll(`href="/${assetName}"`, `href="/${assetName}?v=${version}"`);
  }, content);
}

function optimize(relativePath, content) {
  if (relativePath.endsWith('.html')) {
    const optimized = optimizeHtml(content);
    return relativePath === 'index.html' ? versionIndexAssets(optimized) : optimized;
  }
  if (relativePath.endsWith('.css')) return optimizeCss(content);
  return content;
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function copyFile(relativePath) {
  const sourcePath = path.join(sourceRoot, relativePath);
  const outputPath = path.join(outputRoot, relativePath);
  ensureParent(outputPath);

  if (compressibleExtensions.has(path.extname(relativePath))) {
    const content = optimize(relativePath, fs.readFileSync(sourcePath, 'utf8'));
    const buffer = Buffer.from(content, 'utf8');
    fs.writeFileSync(outputPath, buffer);
    fs.writeFileSync(`${outputPath}.gz`, zlib.gzipSync(buffer, { level: 9 }));
  } else {
    fs.copyFileSync(sourcePath, outputPath);
  }
}

function copyDirectory(relativeDirectory) {
  const absoluteDirectory = path.join(sourceRoot, relativeDirectory);
  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) copyDirectory(relativePath);
    else copyFile(relativePath);
  }
}

function main() {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  rootFiles.forEach(copyFile);
  directories.forEach(copyDirectory);
}

main();
