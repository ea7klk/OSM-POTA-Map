#!/usr/bin/env node
/** Build the Nginx document root without requiring a Node.js runtime at serving time. */

const fs = require('node:fs');
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
];
const directories = ['help', 'docs/images'];
const compressibleExtensions = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt']);

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

function optimize(relativePath, content) {
  if (relativePath.endsWith('.html')) return optimizeHtml(content);
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
