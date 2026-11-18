/**
 * "Where need meets capacity": every county on a scatter of two metrics, picked
 * from curated pairings (SCATTER_PRESETS), with a tooltip beside the hovered dot.
 *
 * Its hover is its own, not the map's: the scatter has its own tooltip, and the
 * global hover would also open the map's.
 */
import { useMemo, useState } from 'react';
import { metricById, presetById, SCATTER_PRESETS } from '../../config/metrics';
import { useElementSize } from '../../lib/useElementSize';
import { Section } from '../shell/Section';
import { ScatterChart } from './ScatterChart';
import { ScatterPanel, ScatterTooltip } from './ScatterPanel';
import styles from './CapacitySection.module.css';

const TOOLTIP_W = 280;

/** The tooltip's spot beside a dot: right of it, or left near the right edge, kept inside the slot. */
function tooltipPosition({ x, y, r, width, height }) {
  const right = x + r + 12;
  const left = right + TOOLTIP_W > width ? x - r - 12 - TOOLTIP_W : right;
  return { left, top: Math.max(0, Math.min(y - 32, height - 250)) };
}

/**
 * @param {{
 *   id: string,
 *   counties: object[],
 *   byGeoid: Map<string, object>,
 *   i0: number,
 *   i1: number,
 *   window: [string, string],
 *   childSeries: boolean,
 * }} props
 *   `childSeries`: the map is showing children, so the tooltip's trend is the children's.
 */
export function CapacitySection({ id, counties, byGeoid, i0, i1, window, childSeries }) {
  const [presetId, setPresetId] = useState(SCATTER_PRESETS[0].id);
  const [focus, setFocus] = useState(null);
  const [slotRef, slot] = useElementSize();

  const preset = presetById(presetId);
  const xMetric = metricById(preset.x);
  const yMetric = metricById(preset.y);
  const ctx = useMemo(() => ({ i0, i1 }), [i0, i1]);

  const points = useMemo(
    () =>
      counties
        .map((c) => ({ geoid: c.geoid, name: c.name, x: xMetric.value(c, ctx), y: yMetric.value(c, ctx), weight: c.pop }))
        .filter((p) => p.x != null && p.y != null),
    [counties, xMetric, yMetric, ctx],
  );

  const renderTooltip = (dot) => {
    const county = byGeoid.get(dot.geoid);
    if (!county) return null;
    return (
      <ScatterTooltip
        county={county}
        x={xMetric}
        y={yMetric}
        ctx={ctx}
        window={window}
        childSeries={childSeries}
        style={tooltipPosition(dot)}
      />
    );
  };

  return (
    <Section
      title="Where need meets capacity"
      subtitle="Each dot is a county, sized by enrollment. Pick a comparison, then hover a dot or search for a county."
      tone="alt"
      id={id}
    >
      <div className={styles.card}>
        <ScatterPanel
          counties={counties}
          presets={SCATTER_PRESETS}
          preset={preset}
          onChangePreset={setPresetId}
          x={xMetric}
          ctx={ctx}
          onFocus={setFocus}
          chart={
            <div className={styles.chart} ref={slotRef}>
              <ScatterChart
                points={points}
                // Authored at the slot's real pixels; the floors cover the first paint.
                viewWidth={Math.max(360, Math.round(slot.width) || 460)}
                height={Math.max(260, Math.round(slot.height) || 320)}
                hovered={focus}
                onHover={setFocus}
                xLabel={`${xMetric.axis} →`}
                yLabel={yMetric.axis}
                xFormat={xMetric.format}
                yFormat={yMetric.format}
                quadrants={preset.quadrants}
                ySplit={preset.ySplit}
                renderOverlay={renderTooltip}
              />
            </div>
          }
        />
      </div>
    </Section>
  );
}
