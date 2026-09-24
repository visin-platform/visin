/**
 * Series colours for charts: eight hues in a fixed order, stepped separately
 * for each scheme.
 *
 * The order is what keeps neighbouring series apart under colour-vision
 * deficiency, so assign slots in order, never shuffle them, and give an entity
 * the same slot wherever it appears (training is slot 1, validation slot 2).
 * Validated against Visin's paper surfaces (#ffffff, #121826): every adjacent
 * pair clears ΔE 8 under CVD simulation and 15 in normal vision. In light,
 * slots 3–5 sit under 3:1 on white, so a chart using them keeps its legend.
 *
 * Real values rather than CSS variables: the chart library writes them into
 * SVG attributes and blends them itself, and can do neither with `var()`.
 */
export const chartSeries = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
} as const;
