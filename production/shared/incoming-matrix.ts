import { sizes } from "./domain";
import type { IncomingRow } from "./incoming-goods";
export type IncomingMatrixLine = {
  id: string;
  sku: string;
  color: string;
  cells: Partial<Record<(typeof sizes)[number], IncomingRow>>;
};
export type IncomingMatrixBag = {
  id: string;
  label: string;
  lines: IncomingMatrixLine[];
};
// Legacy rows remain separate when the same size occurs twice. Never sum,
// overwrite or discard quantities/order selections while changing their layout.
export function incomingMatrix(rows: IncomingRow[]): IncomingMatrixBag[] {
  const bags: IncomingMatrixBag[] = [];
  const bagKeys = new Map<string, IncomingMatrixBag>();
  for (const row of rows) {
    const key = row.bagGroupId ? `id:${row.bagGroupId}` : `legacy:${row.bag}`;
    let bag = bagKeys.get(key);
    if (!bag) {
      bag = { id: row.bagGroupId || row.id, label: row.bag, lines: [] };
      bags.push(bag);
      bagKeys.set(key, bag);
    }
    let line = bag.lines.find(
      (l) =>
        (row.lineGroupId
          ? l.id === row.lineGroupId
          : l.sku === row.sku && l.color === row.color) &&
        l.sku === row.sku &&
        l.color === row.color &&
        !l.cells[row.size],
    );
    if (!line) {
      line = {
        id:
          row.lineGroupId && !bag.lines.some((l) => l.id === row.lineGroupId)
            ? row.lineGroupId
            : row.id,
        sku: row.sku,
        color: row.color,
        cells: {},
      };
      bag.lines.push(line);
    }
    line.cells[row.size] = row;
  }
  return bags;
}
export function withIncomingGroups(rows: IncomingRow[]): IncomingRow[] {
  const identities = new Map<
    string,
    { bagGroupId: string; lineGroupId: string }
  >();
  for (const bag of incomingMatrix(rows))
    for (const line of bag.lines)
      for (const cell of Object.values(line.cells))
        identities.set(cell.id, { bagGroupId: bag.id, lineGroupId: line.id });
  return rows.map((r) => ({ ...r, ...identities.get(r.id)! }));
}
