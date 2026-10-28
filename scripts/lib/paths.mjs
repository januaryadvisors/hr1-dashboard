import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The analysis repo's data-clean/ folder. FT_DATA overrides it, relative to
 * ROOT (CI checks the analysis repo out inside this one).
 */
export const FT_DATA = resolve(ROOT, process.env.FT_DATA ?? '../feeding-texas-hr1/data-clean');
