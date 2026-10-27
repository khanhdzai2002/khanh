import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { incomingMatrix, withIncomingGroups } from "../shared/incoming-matrix";
import { incomingFormSchema, type IncomingRow } from "../shared/incoming-goods";
const row = (extra: Partial<IncomingRow> = {}): IncomingRow => ({
  id: randomUUID(),
  sku: "MIU15",
  color: "Xám tiêu đậm",
  bag: "14",
  size: "S",
  qty: 3,
  variantId: randomUUID(),
  orderId: null,
  remember: false,
  allocationMode: "auto",
  ...extra,
});
it("legacy repeated bag labels group product/colour lines and sizes without changing counts", () => {
  const rows = [
    row({ sku: "MIU37", color: "Cam cháy", qty: 125 }),
    row(),
    row({ size: "M", qty: 1 }),
    row({ size: "L", qty: 2 }),
  ];
  const bags = incomingMatrix(rows);
  expect(bags).toHaveLength(1);
  expect(bags[0].label).toBe("14");
  expect(bags[0].lines).toHaveLength(2);
  expect(bags[0].lines[1].cells.S?.qty).toBe(3);
  expect(bags[0].lines[1].cells.M?.qty).toBe(1);
  expect(bags[0].lines[1].cells.L?.qty).toBe(2);
  expect(
    Object.values(bags[0].lines[0].cells).reduce((n, r) => n + (r.qty || 0), 0),
  ).toBe(125);
});
it("bag display order follows original sheet order, not numeric sorting", () => {
  const bags = incomingMatrix([
    row({ bag: "14" }),
    row({ bag: "1" }),
    row({ bag: "15" }),
    row({ bag: "1", size: "M" }),
  ]);
  expect(bags.map((b) => b.label)).toEqual(["14", "1", "15"]);
  expect(bags[1].lines[0].cells.M).toBeDefined();
});
it("duplicate same-size legacy entries stay separate, not summed or overwritten", () => {
  const first = row({
      qty: 3,
      allocationMode: "manual",
      orderId: randomUUID(),
    }),
    second = row({ qty: 7, allocationMode: "manual", orderId: randomUUID() });
  const bags = incomingMatrix([first, second, row({ size: "M", qty: 1 })]);
  expect(bags[0].lines).toHaveLength(2);
  expect(bags[0].lines[0].cells.S).toEqual(first);
  expect(bags[0].lines[1].cells.S).toEqual(second);
  expect(
    bags[0].lines
      .flatMap((l) => Object.values(l.cells))
      .reduce((n, r) => n + (r.qty || 0), 0),
  ).toBe(11);
});
it("explicit bag IDs keep two distinct bags with same written label separate", () => {
  const bags = incomingMatrix([
    row({ bag: "1", bagGroupId: randomUUID() }),
    row({ bag: "1", bagGroupId: randomUUID() }),
  ]);
  expect(bags).toHaveLength(2);
});
it("explicit line IDs keep same-code/colour rows separate under one bag", () => {
  const bagGroupId = randomUUID();
  const bags = incomingMatrix([
    row({ bagGroupId, lineGroupId: randomUUID() }),
    row({ bagGroupId, lineGroupId: randomUUID(), size: "M" }),
  ]);
  expect(bags[0].lines).toHaveLength(2);
});
it("group normalization is idempotent and preserves every original identity, null and order choice", () => {
  const rows = [
    row({ qty: null, allocationMode: "manual", orderId: randomUUID() }),
    row({ size: "M", qty: 9, excessOrderId: randomUUID() }),
  ];
  const normalized = withIncomingGroups(rows);
  expect(withIncomingGroups(normalized)).toEqual(normalized);
  for (let i = 0; i < rows.length; i++) {
    const { bagGroupId, lineGroupId, ...unchanged } = normalized[i];
    expect(unchanged).toEqual(rows[i]);
    expect(bagGroupId).toBe(rows[0].id);
    expect(lineGroupId).toBe(rows[0].id);
  }
});
it("matrix metadata passes the backend form schema and survives JSON roundtrip", () => {
  const bagGroupId = randomUUID(),
    lineGroupId = randomUUID();
  const rows = [
    row({ bagGroupId, lineGroupId, qty: 0 }),
    row({ bagGroupId, lineGroupId, size: "M", qty: 125 }),
  ];
  const form = incomingFormSchema.parse(
    JSON.parse(JSON.stringify({ date: "2026-10-27", note: "", rows })),
  );
  expect(form.rows).toEqual(rows);
  expect(incomingMatrix(form.rows)[0].lines[0].cells.M?.qty).toBe(125);
});
it("renaming a bag preserves its child grouping even when labels overlap another bag", () => {
  const source = withIncomingGroups([
    row({ bag: "1" }),
    row({ bag: "1", size: "M" }),
    row({ bag: "2" }),
  ]);
  const changed = source.map((r) => (r.bag === "1" ? { ...r, bag: "2" } : r));
  const bags = incomingMatrix(changed);
  expect(bags).toHaveLength(2);
  expect(bags[0].lines[0].cells.M).toBeDefined();
});
