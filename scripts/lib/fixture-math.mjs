// Deterministic helpers for the fixture generator. Seeded so regenerating the
// fixtures produces a byte-identical file and diffs stay readable.

/** mulberry32 — small, fast, deterministic. */
export function rng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller, drawing from a supplied uniform generator. */
export function normal(next) {
  let u = 0;
  while (u === 0) u = next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
}

/** Cholesky decomposition of a symmetric positive-definite matrix. */
export function cholesky(m) {
  const n = m.length;
  const L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = m[i][j];
      for (let k = 0; k < j; k++) sum -= L[i][k] * L[j][k];
      if (i === j) {
        if (sum <= 0) throw new Error('correlation matrix is not positive-definite');
        L[i][j] = Math.sqrt(sum);
      } else {
        L[i][j] = sum / L[j][j];
      }
    }
  }
  return L;
}

/**
 * Draw `count` correlated standard-normal vectors matching a target correlation
 * matrix, then rank-transform each dimension to a within-set percentile in [0,1].
 * Rank-transforming preserves rank correlation (which is what a percentile map
 * shows) while guaranteeing a uniform 0–1 spread per layer.
 */
export function correlatedPercentiles(count, corr, next) {
  const L = cholesky(corr);
  const dims = corr.length;

  const draws = [];
  for (let i = 0; i < count; i++) {
    const z = Array.from({ length: dims }, () => normal(next));
    draws.push(L.map((row) => row.reduce((s, v, k) => s + v * z[k], 0)));
  }

  const out = Array.from({ length: count }, () => new Array(dims).fill(0));
  for (let d = 0; d < dims; d++) {
    const order = draws.map((v, i) => [v[d], i]).sort((a, b) => a[0] - b[0]);
    // Midpoint ranks: avoids a county sitting at exactly 0 or 1.
    order.forEach(([, i], rank) => {
      out[i][d] = (rank + 0.5) / count;
    });
  }
  return out;
}

/** Pearson correlation, for verifying the generated fixture hit its targets. */
export function pearson(a, b) {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return num / Math.sqrt(da * db);
}

/** Quintile 1–5 from a 0–1 percentile. */
export function quintile(p) {
  return Math.min(5, Math.floor(p * 5) + 1);
}
