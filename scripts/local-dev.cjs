const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
process.chdir(root);
if (!fs.existsSync('.env')) {
  console.error('请先复制 .env.example 为 .env 并填写 R2 配置。');
  process.exit(1);
}
process.loadEnvFile('.env');
for (const name of ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
  if (!process.env[name]) { console.error(`缺少本地配置：${name}`); process.exit(1); }
}
require('./build-static.cjs');
let timer;
const rebuild = () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try { delete require.cache[require.resolve('./build-static.cjs')]; require('./build-static.cjs'); }
    catch (error) { console.error('预览构建失败：', error.message); }
  }, 250);
};
const watchers = ['assets', 'css', 'js', 'arcade', 'source-lab'].map(name => fs.watch(name, { recursive: true }, rebuild));
watchers.push(fs.watch(root, (_, name) => { if (name === 'index.html') rebuild(); }));
// Keep local CLI state and Deno cache inside the ignored project directory.
const child = spawn(process.execPath, [path.join(root, 'node_modules/netlify-cli/bin/run.js'), 'dev', '--offline', '--framework', '#static', '--dir', 'dist', '--port', '8888', '--no-open'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, APPDATA: path.join(root, '.netlify/cli-profile'), DENO_DIR: path.join(root, '.netlify/deno-cache') }
});
let probing = false;
const probe = setInterval(async () => {
  if (probing) return;
  probing = true;
  try {
    const response = await fetch('http://localhost:8888/', { signal: AbortSignal.timeout(2000) });
    if (response.ok) { clearInterval(probe); console.log('LOCAL_PREVIEW_READY http://localhost:8888'); }
    await response.body?.cancel();
  } catch {} finally { probing = false; }
}, 1500);
const cleanup = () => { clearInterval(probe); clearTimeout(timer); watchers.forEach(w => w.close()); };
child.on('error', error => { console.error(error.message); cleanup(); process.exitCode = 1; });
child.on('exit', code => { cleanup(); process.exitCode = code ?? 1; });
process.on('SIGINT', () => { cleanup(); child.kill('SIGINT'); });
process.on('SIGTERM', () => { cleanup(); child.kill('SIGTERM'); });
