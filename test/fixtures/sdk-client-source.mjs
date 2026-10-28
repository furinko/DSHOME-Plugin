/* Resolve the browser script from the package's PUBLIC ./client export.
 * Node's resolver would select Gateway's node condition, not browser. Reading
 * public package metadata is deliberate; no assumed lib path or src fallback. */
import { readFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
export async function sdkClientSource(id, sdk) {
  const manifestPath = sdk.resolve(id + '/package.json'), manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.version !== '0.2.1-rc.2') throw Error('Unverified SDK client version: ' + id + '@' + manifest.version);
  const face = manifest.exports?.['./client'], entry = typeof face === 'string' ? face : face?.browser ?? face?.default;
  if (typeof entry !== 'string' || !entry.startsWith('./')) throw Error('No public browser ./client entry: ' + id);
  const root = dirname(manifestPath), target = resolve(root, entry);
  if (!target.startsWith(root + sep)) throw Error('Public client export escapes package: ' + id);
  return readFile(target, 'utf8');
}
