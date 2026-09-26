import type { CellRow } from "./grid";

/**
 * Whether `cells` (at least 2) are all connected through shared edges (never
 * diagonals): a Kavling Keluarga must be one connected shape (spec, Inventory
 * > Denah).
 */
export function areAdjacent(cells: readonly Pick<CellRow, "row" | "col">[]): boolean {
  if (cells.length < 2) return false;
  const positions = new Set(cells.map((cell) => `${cell.row}:${cell.col}`));
  const seen = new Set<string>([`${cells[0].row}:${cells[0].col}`]);
  const stack = [cells[0]];
  while (stack.length) {
    const { row, col } = stack.pop()!;
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const key = `${row + dr}:${col + dc}`;
      if (positions.has(key) && !seen.has(key)) {
        seen.add(key);
        const next = cells.find((cell) => `${cell.row}:${cell.col}` === key)!;
        stack.push(next);
      }
    }
  }
  return seen.size === cells.length;
}
