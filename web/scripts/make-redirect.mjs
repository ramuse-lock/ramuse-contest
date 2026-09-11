// 旧い共有URL（/app/）を新しい置き場所へ転送するだけの小さなページを置く
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [, , dir, to] = process.argv;
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'index.html'), `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<meta http-equiv="refresh" content="0; url=${to}">
<title>RAMUSE</title></head>
<body><script>location.replace('${to}');</script>
<p style="font-family:sans-serif;padding:24px">移動しました。<a href="${to}">RAMUSEを開く</a></p></body></html>
`);
console.log('redirect written:', join(dir, 'index.html'), '->', to);
