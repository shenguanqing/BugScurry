/**
 * Screen-space nudge (fractions of body size) so visual mass sits centered.
 * Origin is thorax-based; wings / hanging legs / proboscis shift the balance.
 * Shared with the QA page so centering checks match the settings popover.
 */
export const CENTER_BIAS: Record<string, readonly [number, number]> = {
  // Fixed offsets include the current wing / leg silhouette; never track each gait frame.
  fly: [0, -0.25],
  mosquito: [-0.04, -0.25],
  butterfly: [0, -0.04],
  ant: [0.04, 0.12],
  bee: [0.04, 0.06],
  caterpillar: [0.03, 0.03],
  spider: [0, 0.04],
  cockroach: [0, -0.06],
  ladybug: [0, 0.02],
};
