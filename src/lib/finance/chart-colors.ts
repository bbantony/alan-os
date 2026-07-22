// Validated categorical palette (dataviz skill reference instance) — colors
// are assigned by RANK at render time (largest category = slot 1, etc.), not
// stored per-category, so the accessibility ordering guarantee always holds
// regardless of which categories happen to be top-N in a given month. Beyond
// the cap, everything folds into a single muted "Other" slot rather than
// generating a 9th+ hue (the skill's own rule).
export const CHART_CATEGORICAL_LIGHT = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];

export const CHART_CATEGORICAL_DARK = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
];

export const CHART_OTHER_LIGHT = "#c3c2b7";
export const CHART_OTHER_DARK = "#383835";

export const CHART_CATEGORY_CAP = 6;
