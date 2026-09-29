// dshome-plugin — node half.
//
// No host behaviour. The theme, conversation layout, and turn minimap are all
// implemented in the browser module (./client.js), which the host picks up from
// the `dsh.client` declaration in package.json.
//
// This file exists so the loader's roster scan finds a plugin row for the
// package and therefore reads that `dsh.client` section. Keeping it a plain
// object with `{ name, apply }` avoids the `default`/named export ambiguity
// between ESM and CJS import conventions.

export const name = 'dshome-plugin';

export function apply() {
  // Intentionally empty — see ./client.js.
}

export default { name, apply };
