import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { gzipSync } from 'node:zlib';

/**
 * Write `data` as JSON with a trailing newline, creating the folder if needed.
 *
 * @param {string} path
 * @param {unknown} data
 * @param {number} [indent] - Pretty-print with this many spaces; compact when omitted.
 * @returns {{ kb: number, gzKb: number }} Sizes for the log.
 */
export function writeJson(path, data, indent) {
  const json = JSON.stringify(data, null, indent);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${json}\n`);
  return { kb: json.length / 1024, gzKb: gzipSync(json).length / 1024 };
}

/**
 * Run an async script body; on failure print why and exit 1. Scripts that use
 * this write only at the end of `main`, so a failure leaves the old output.
 *
 * @param {string} name - Printed in the failure message.
 * @param {() => Promise<void>} main
 * @param {string} [untouched] - What the failure leaves in place.
 */
export function runMain(name, main, untouched = 'Nothing was written.') {
  main().catch((err) => {
    console.error(`${name} failed: ${err.message}`);
    console.error(untouched);
    process.exit(1);
  });
}
