export const ASCII_CELL_WIDTH_RATIO = 0.62;
export const ASCII_GRID_FILL = 0.94;

export function fittedAsciiFontSize(width, columns) {
  return (width / columns / ASCII_CELL_WIDTH_RATIO) * ASCII_GRID_FILL;
}
