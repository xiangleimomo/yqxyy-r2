const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
// Only website assets are published; server code, credentials and data stay out.
for (const name of ['index.html', 'manifest.webmanifest', 'sw.js', 'assets', 'css', 'js', 'arcade', 'source-lab']) {
  fs.cpSync(path.join(root, name), path.join(output, name), { recursive: true });
}
console.log('Static site ready in dist/. Resources are served from R2 at runtime.');
