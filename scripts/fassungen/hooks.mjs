// Node-Ladehaken für Skripte, die Module der Anwendung laden: virtuelle Module «sgk-core/model» und «sgk-core/parser»
// (im Build per esbuild-Plugin aufgelöst, build.mjs) auf src/core abbilden. Gleich wie test/app/equiv/hooks.mjs.
const ROOT = new URL('../../', import.meta.url);
export async function resolve(spec, ctx, next) {
  const m = /^sgk-core\/(model|parser)$/.exec(spec);
  if (m) return { url: new URL(`src/core/${m[1]}.js`, ROOT).href, shortCircuit: true };
  return next(spec, ctx);
}
