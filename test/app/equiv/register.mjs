// Mit `node --import ./test/app/equiv/register.mjs` oder per import vor dem Laden von src/app/data.js einbinden.
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
