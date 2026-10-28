import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import { FT_DATA } from './paths.mjs';

/**
 * Every row of a parquet file in the analysis repo, as plain objects.
 *
 * @param {string} file - Relative to FT_DATA.
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function readParquet(file) {
  const path = resolve(FT_DATA, file);
  if (!existsSync(path)) throw new Error(`${file} not found in ${FT_DATA} — set FT_DATA`);
  const buf = readFileSync(path);
  // A Git LFS pointer is ~130 bytes of text; parsing it gives a baffling error.
  if (buf.length < 1024 && buf.toString('utf8', 0, 40).startsWith('version https://git-lfs')) {
    throw new Error(`${file} is a Git LFS pointer — run \`git lfs pull\` in the analysis repo`);
  }
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const rows = await parquetReadObjects({ file: ab, compressors });
  // int64 columns arrive as BigInt; every count here fits a double exactly.
  return rows.map((r) =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]),
    ),
  );
}
