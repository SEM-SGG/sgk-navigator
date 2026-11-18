import { readFileSync } from 'node:fs';
import { DOMParser } from '../lib-dom.mjs';
import { parseEurLex } from '../../src/core/parser.js';
const [file, unit, key] = process.argv.slice(2);
const r = parseEurLex(readFileSync(file, 'utf8'), { DOMParser });
const b = r.units.find((u) => u.id === unit).blocks.find((x) => x.k === key);
console.log(JSON.stringify(b, null, 1).slice(0, 3000));
