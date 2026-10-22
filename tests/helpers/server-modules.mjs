// Lets node --test import the app's server-only TypeScript modules (src/lib/server/...):
//   node --import ./tests/helpers/server-modules.mjs --test "tests/supplier-match/*.test.mjs"
// Next.js maps "server-only" to an empty module on the server (and to one that throws in a client bundle); here it
// is simply empty. Relative imports written without an extension, as the app writes them, resolve to the .ts file.
import { register } from "node:module";

const hooks = `
export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
  try {
    return await next(specifier, context);
  } catch (error) {
    if (error && error.code === "ERR_MODULE_NOT_FOUND" && /^\\.{1,2}\\//.test(specifier) && !/\\.[a-z]+$/i.test(specifier)) {
      return next(specifier + ".ts", context);
    }
    throw error;
  }
}`;

register(`data:text/javascript,${encodeURIComponent(hooks)}`);
