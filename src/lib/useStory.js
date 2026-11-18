/**
 * The homepage story: which step is open, and the map state each step sets.
 * Content is in config/story.js; the scroll mechanics in useScrollSteps.js.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { buildStory } from '../config/story';
import { defaultLayerFor, hasCountBasis, viewForLayer } from '../config/layers';
import { useScrollSteps } from './useScrollSteps';

/** The step a shared `?layer=` link opens on, so the link is not overwritten by chapter one. */
function stepForLayer(steps, layer) {
  const exact = steps.findIndex((s) => s.layer === layer);
  if (exact >= 0) return exact;
  const view = viewForLayer(layer).key;
  return Math.max(0, steps.findIndex((s) => s.chapter.view === view));
}

/**
 * @param {{ state: object, dispatch: Function, pinned: boolean }} args
 *   `pinned`: whether the story scrolls step by step (STORY_PINNED).
 */
export function useStory({ state, dispatch, pinned }) {
  const story = useMemo(() => buildStory(), []);
  const storyRef = useRef(null);

  // Opened from the page switch, the story starts at the top whatever layer the URL carries.
  const fromSwitch = useLocation().state?.fromSwitch === true;
  const [initialStep] = useState(() => (fromSwitch ? 0 : stepForLayer(story.steps, state.layer)));
  const scroll = useScrollSteps(storyRef, story.steps.length, { enabled: pinned, initial: initialStep });
  const step = story.steps[Math.min(scroll.active, story.steps.length - 1)];

  /** The Vulnerability index's "Index + assistance" switch. Each step sets it on arrival. */
  const [capacityOn, setCapacityOn] = useState(false);

  /*
     Arriving at a step sets the layer and measure it declares; the reader can
     change them until the next step. Skipped on first render, so a shared
     link's state is what the reader sees first.
  */
  const appliedRef = useRef(null);
  useEffect(() => {
    if (appliedRef.current === step.id) return;
    const first = appliedRef.current === null;
    appliedRef.current = step.id;
    setCapacityOn(!!step.capacity);
    if (first && !fromSwitch) return;

    const layer = step.layer ?? defaultLayerFor(step.chapter.view);
    // Never open a step on a count the layer cannot show.
    const measure =
      step.measure ?? (state.measure === 'count' && !hasCountBasis(layer) ? 'rate' : state.measure);
    if (layer !== state.layer) dispatch({ type: 'setLayer', layer });
    if (measure !== state.measure) dispatch({ type: 'setMeasure', measure });
  }, [step, state.layer, state.measure, dispatch, fromSwitch]);

  /** Go to step `si` of chapter `ci`. */
  const goToStep = (ci, si) => scroll.goTo(story.firstStep[ci] + si);

  return { story, storyRef, step, ...scroll, goToStep, capacityOn, setCapacityOn };
}
