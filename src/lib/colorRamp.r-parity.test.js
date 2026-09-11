/**
 * Randomised parity check against real R. Skips automatically when R is not on
 * PATH, so CI stays green on a machine without it; run it locally whenever
 * colorRamp.ts changes.
 *
 * The pinned expectations in colorRamp.test.ts cover the five palettes that
 * actually ship. This covers the port itself across anchor counts and lengths.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { colorRampPalette } from './colorRamp';

function hasR() {
  try {
    execFileSync('Rscript', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasR())('colorRampPalette — randomised parity with R', () => {
  it('matches R across 120 random anchor sets and lengths', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const hex = () =>
      '#' +
      Array.from({ length: 3 }, () =>
        Math.floor(rnd() * 256)
          .toString(16)
          .padStart(2, '0')
          .toUpperCase(),
      ).join('');

    const cases = Array.from({ length: 120 }, () => ({
      anchors: Array.from({ length: 2 + Math.floor(rnd() * 4) }, hex),
      n: 1 + Math.floor(rnd() * 12),
    }));

    // One line per case. Prefix each so a stray R message cannot shift the rows.
    const rScript = cases
      .map(
        ({ anchors, n }, i) =>
          `cat("CASE${i}", paste(grDevices::colorRampPalette(c(${anchors
            .map((a) => `"${a}"`)
            .join(',')}))(${n}), collapse=" "), "\\n")`,
      )
      .join('\n');

    // Rscript's -e has a byte limit well under the size of this script, so it
    // goes to a file.
    const scriptPath = join(mkdtempSync(join(tmpdir(), 'ramp-parity-')), 'parity.R');
    writeFileSync(scriptPath, rScript);
    const stdout = execFileSync('Rscript', [scriptPath], { encoding: 'utf8' });
    const fromR = new Map();
    for (const line of stdout.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts[0]?.startsWith('CASE')) fromR.set(parts[0], parts.slice(1));
    }

    expect(fromR.size).toBe(cases.length);

    const mismatches = [];
    cases.forEach(({ anchors, n }, i) => {
      const mine = colorRampPalette(anchors, n);
      const theirs = fromR.get(`CASE${i}`);
      if (JSON.stringify(mine) !== JSON.stringify(theirs)) {
        mismatches.push(`anchors=${anchors.join(',')} n=${n}\n  R:  ${theirs.join(' ')}\n  JS: ${mine.join(' ')}`);
      }
    });

    expect(mismatches, `${mismatches.length} case(s) diverged:\n${mismatches.slice(0, 5).join('\n')}`).toEqual([]);
  }, 60_000);
});
