/** Fetching the static JSON under public/data — spec §2: "Static JSON fetched once." */

export class MissingDataError extends Error {
  file;
  constructor(file) {
    super(`${file} has not been exported yet.`);
    this.name = 'MissingDataError';
    this.file = file;
  }
}

// BASE_URL carries vite's `base`, so this works at / in dev and at
// /hr1-dashboard/ on Pages.
const dataUrl = (file) => `${import.meta.env.BASE_URL}data/${file}`;

/**
 * A data file, parsed. Throws MissingDataError when the file is absent and a
 * plain Error on any other failed response.
 *
 * @param {string} file - Path under public/data, e.g. "counties.json".
 */
export async function fetchJson(file) {
  let res;
  try {
    res = await fetch(dataUrl(file));
  } catch {
    throw new MissingDataError(file);
  }
  if (res.status === 404) throw new MissingDataError(file);
  if (!res.ok) throw new Error(`Failed to load ${file} (${res.status})`);

  // A dev server with SPA fallback answers a missing .json with index.html, so a
  // 200 is not proof the file exists.
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new MissingDataError(file);
  }
}

/** An optional data file: null on any failure, so its absence degrades rather than throws. */
export async function fetchOptionalJson(file) {
  try {
    return await fetchJson(file);
  } catch {
    return null;
  }
}
