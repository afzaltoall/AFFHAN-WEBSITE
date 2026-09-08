import { eproloRaw } from './client.mjs';

const { status, text } = await eproloRaw('product_type.html');
console.log(`HTTP ${status}`);
console.log(text.length > 1200 ? text.slice(0, 1200) + `\n... [truncated, ${text.length} bytes total]` : text);

const json = JSON.parse(text);
console.log(`\n=> code=${JSON.stringify(json.code)}  msg=${JSON.stringify(json.msg)}  ${String(json.code) === '0' ? 'AUTH OK' : 'AUTH FAILED'}`);
