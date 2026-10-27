import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, transaction as tx } from "../server/db";
import { migrate } from "../server/migrate";
import {
  saveSku,
  createOrder,
  loadOrder,
  receive,
  listOrders,
} from "../server/service";
import {
  createIncoming,
  confirmIncoming,
  previewIncomingAllocation,
  saveIncoming,
} from "../server/incoming-goods";
import { incomingAllocation } from "../shared/incoming-allocation";
import { totals, type ProductionOrder } from "../shared/domain";
import { type IncomingForm, type IncomingRow } from "../shared/incoming-goods";
const actor = {
  id: randomUUID(),
  name: "Synthetic automatic receiver",
  role: "Administrator",
};
beforeAll(async () => {
  await migrate();
});
beforeEach(async () => {
  await pool.query("TRUNCATE users,products,suppliers,session CASCADE");
  await pool.query(
    "INSERT INTO users(id,tenant_key,open_id,name,role) VALUES($1,'test','synthetic-allocation',$2,'Administrator')",
    [actor.id, actor.name],
  );
});
afterAll(async () => {
  await pool.end();
});
async function fixture(
  qty = 150,
  time = "2026-10-23T10:00:00+07:00",
  supplier = "PRIMITEX",
  status = "Đang sản xuất",
) {
  let variantId = (
    await pool.query(
      "SELECT id FROM variants WHERE body->>'sku'='MIU37' AND size='M'",
    )
  ).rows[0]?.id;
  if (!variantId)
    variantId = await tx((db) =>
      saveSku(db, actor, {
        sku: "MIU37",
        color: "Ghi tây (Phối nâu)",
        size: "M",
        stock: 30,
        inbound: 10,
      }),
    );
  return tx((db) =>
    createOrder(db, actor, {
      time,
      supplier,
      delivery: "2026-10-30",
      requestedBy: actor.name,
      notes: "Synthetic",
      status,
      items: [{ variantId, qty, priority: "THƯỜNG" }],
    }),
  );
}
const row = (
  o: ProductionOrder,
  qty = 300,
  extra: Partial<IncomingRow> = {},
): IncomingRow => ({
  id: randomUUID(),
  sku: "MIU37",
  color: "Ghi tây (Phối nâu)",
  size: "M",
  bag: "1",
  qty,
  variantId: o.items[0].variantId,
  orderId: null,
  remember: false,
  allocationMode: "auto",
  excessOrderId: null,
  ...extra,
});
const form = (
  rows: IncomingRow[],
  extra: Partial<IncomingForm> = {},
): IncomingForm => ({
  date: "2026-10-27",
  note: "Synthetic FIFO receipt",
  rows,
  ...extra,
});
const draft = () => tx((db) => createIncoming(db, actor, { images: [] }));
const preview = (id: string, f: IncomingForm) =>
  tx((db) =>
    previewIncomingAllocation(db, actor, id, { expectedVersion: 1, form: f }),
  );
const confirmation = (f: IncomingForm, p: any) => ({
  expectedVersion: 1,
  form: f,
  checked: true,
  orders: p.orders,
  allocationPreviewId: p.id,
});
it("FIFO uses order date first; 300 receives150 into oldest then150 into next", async () => {
  const a = await fixture(),
    b = await fixture(150, "2026-10-24T10:00:00+07:00");
  const r = incomingAllocation(form([row(a)]), [b, a]);
  expect(r.allocations.map((x) => [x.orderId, x.qty, x.pendingAfter])).toEqual([
    [a.id, 150, 0],
    [b.id, 150, 0],
  ]);
  expect(r).toMatchObject({
    entered: 300,
    allocated: 300,
    remaining: 0,
    excess: 0,
  });
});
it("subtracts actual prior receipts instead of allocating original placed quantity", async () => {
  let a = await fixture();
  const b = await fixture(150, "2026-10-24T10:00:00+07:00");
  await tx((db) =>
    receive(db, actor, a.id, randomUUID(), {
      expectedVersion: a.version,
      date: "2026-10-26",
      note: "Earlier",
      lines: [{ itemId: a.items[0].id, qty: 50 }],
    }),
  );
  a = await loadOrder(pool, a.id);
  const r = incomingAllocation(form([row(a, 200)]), [a, b]);
  expect(r.allocations.map((x) => x.qty)).toEqual([100, 100]);
  expect(r.allocations[1].pendingAfter).toBe(50);
});
it("repeated bag rows share one reservation ledger, so no duplicate outstanding capacity", async () => {
  const a = await fixture(),
    b = await fixture(150, "2026-10-24T10:00:00+07:00");
  const r = incomingAllocation(form([row(a, 180), row(a, 120)]), [a, b]);
  expect(
    r.allocations
      .filter((x) => x.orderId === a.id)
      .reduce((n, x) => n + x.qty, 0),
  ).toBe(150);
  expect(
    r.allocations
      .filter((x) => x.orderId === b.id)
      .reduce((n, x) => n + x.qty, 0),
  ).toBe(150);
  expect(r.remaining).toBe(0);
});
it("manual selections reserve capacity before automatic entries regardless of row order", async () => {
  const a = await fixture(),
    b = await fixture(150, "2026-10-24T10:00:00+07:00");
  const r = incomingAllocation(
    form([
      row(a, 200),
      row(a, 100, { allocationMode: "manual", orderId: a.id }),
    ]),
    [a, b],
  );
  expect(r.allocations.map((x) => x.qty)).toEqual([100, 50, 150]);
  expect(r.excess).toBe(0);
  expect(r.remaining).toBe(0);
});
it("matches variant AND code/color/size; never uses another SKU/color/size", async () => {
  const a = await fixture();
  for (const change of [
    { sku: "MIU66" },
    { color: "Ghi tây (Phối đen)" },
    { size: "S" },
    { variantId: randomUUID() },
  ]) {
    const r = incomingAllocation(form([row(a, 100, change as any)]), [a]);
    expect(r.allocated).toBe(0);
    expect(r.remaining).toBe(100);
  }
});
it("overflow stays unallocated until user explicitly picks a matching surplus order", async () => {
  const a = await fixture(),
    d = await draft();
  let f = form([row(a)]);
  let p = await preview(d.id, f);
  expect(p).toMatchObject({ allocated: 150, remaining: 150, excess: 0 });
  await expect(
    tx((db) => confirmIncoming(db, actor, d.id, confirmation(f, p))),
  ).rejects.toThrow("chưa phân bổ");
  expect((await pool.query("SELECT * FROM production_receipts")).rowCount).toBe(
    0,
  );
  f = form([{ ...f.rows[0], excessOrderId: a.id }]);
  p = await preview(d.id, f);
  expect(p).toMatchObject({ allocated: 300, remaining: 0, excess: 150 });
  await tx((db) => confirmIncoming(db, actor, d.id, confirmation(f, p)));
  expect(totals(await loadOrder(pool, a.id))).toMatchObject({
    received: 300,
    percent: 200,
    pending: 0,
  });
});
it("unmatched SKU does not invent an order, drop units or silently receive", async () => {
  const a = await fixture();
  const f = form([row(a, 300, { variantId: randomUUID() })]);
  const r = incomingAllocation(f, [a]);
  expect(r).toMatchObject({ entered: 300, allocated: 0, remaining: 300 });
});
it("soft deleted/cancelled orders excluded; draft/paused require explicit toggles", async () => {
  const a = await fixture(),
    b = await fixture(150, "2026-10-24T10:00:00+07:00", "PRIMITEX", "Nháp"),
    c = await fixture(150, "2026-10-25T10:00:00+07:00", "PRIMITEX", "Tạm dừng");
  const orders = [
    { ...a, deletedAt: "2026-10-26" },
    { ...a, id: randomUUID(), cancelled: true },
    b,
    c,
  ];
  expect(incomingAllocation(form([row(a, 200)]), orders).allocated).toBe(0);
  expect(
    incomingAllocation(
      form([row(a, 200)], { includeDrafts: true, includePaused: true }),
      orders,
    ).allocations.map((x) => x.qty),
  ).toEqual([150, 50]);
});
it("multiple factories block ambiguous automatic allocation; selected factory scopes it", async () => {
  const a = await fixture(),
    b = await fixture(200, "2026-10-24T10:00:00+07:00", "OTHER FACTORY");
  const r = incomingAllocation(form([row(a, 150)]), [a, b]);
  expect(r).toMatchObject({ allocated: 0, remaining: 150 });
  expect(r.unallocated[0].reason).toContain("nhiều xưởng");
  const scoped = incomingAllocation(
    form([row(a, 150)], { supplier: "OTHER FACTORY" }),
    [a, b],
  );
  expect(scoped.allocations[0].orderId).toBe(b.id);
});
it("manual selected factory mismatch is not allocated", async () => {
  const a = await fixture();
  const r = incomingAllocation(
    form([row(a, 100, { allocationMode: "manual", orderId: a.id })], {
      supplier: "Different",
    }),
    [a],
  );
  expect(r.remaining).toBe(100);
});
it("preview has no receipts; confirm makes two receipts atomically, preserves stock and original quantities; retries return same result", async () => {
  const a = await fixture(),
    b = await fixture(150, "2026-10-24T10:00:00+07:00"),
    d = await draft(),
    f = form([row(a)]),
    p = await preview(d.id, f);
  expect((await pool.query("SELECT * FROM production_receipts")).rowCount).toBe(
    0,
  );
  const payload = confirmation(f, p);
  const [x, y] = await Promise.all([
    tx((db) => confirmIncoming(db, actor, d.id, payload)),
    tx((db) => confirmIncoming(db, actor, d.id, payload)),
  ]);
  expect(x).toEqual(y);
  expect(x.received).toBe(300);
  expect(x.receipts).toHaveLength(2);
  expect(x.allocation?.remaining).toBe(0);
  expect(totals(await loadOrder(pool, a.id)).pending).toBe(0);
  expect(totals(await loadOrder(pool, b.id)).pending).toBe(0);
  expect(
    (await pool.query("SELECT body FROM variants")).rows[0].body,
  ).toMatchObject({ stock: 30, inbound: 10 });
  expect((await pool.query("SELECT * FROM production_receipts")).rowCount).toBe(
    2,
  );
  expect(
    (
      await pool.query(
        "SELECT details FROM activity_logs WHERE action='incoming.confirm'",
      )
    ).rows[0].details.allocation.allocations,
  ).toHaveLength(2);
});
it("stale preview from a new receipt rejects whole confirmation, not a partial batch", async () => {
  const a = await fixture(),
    b = await fixture(150, "2026-10-24T10:00:00+07:00"),
    d = await draft(),
    f = form([row(a)]),
    p = await preview(d.id, f);
  await tx((db) =>
    receive(db, actor, b.id, randomUUID(), {
      expectedVersion: b.version,
      date: "2026-10-27",
      note: "Concurrent",
      lines: [{ itemId: b.items[0].id, qty: 1 }],
    }),
  );
  await expect(
    tx((db) => confirmIncoming(db, actor, d.id, confirmation(f, p))),
  ).rejects.toThrow("đã thay đổi");
  expect((await loadOrder(pool, a.id)).items[0].received).toBe(0);
  expect((await pool.query("SELECT * FROM production_receipts")).rowCount).toBe(
    1,
  );
});
it("new matching order after preview requires recomputation", async () => {
  const a = await fixture(),
    d = await draft(),
    f = form([row(a, 150)]),
    p = await preview(d.id, f);
  await fixture(150, "2026-10-22T10:00:00+07:00");
  await expect(
    tx((db) => confirmIncoming(db, actor, d.id, confirmation(f, p))),
  ).rejects.toThrow("đã thay đổi");
});
it("quantity edits, saved draft version and expired preview cannot bypass review", async () => {
  const a = await fixture(),
    d = await draft(),
    f = form([row(a, 150)]),
    p = await preview(d.id, f);
  await expect(
    tx((db) =>
      confirmIncoming(
        db,
        actor,
        d.id,
        confirmation({ ...f, rows: [{ ...f.rows[0], qty: 1 }] }, p),
      ),
    ),
  ).rejects.toThrow("phiếu đã đổi");
  await pool.query(
    "UPDATE import_previews SET created_at=now()-interval '16 minutes' WHERE id=$1",
    [p.id],
  );
  await expect(
    tx((db) => confirmIncoming(db, actor, d.id, confirmation(f, p))),
  ).rejects.toThrow("hết hạn");
  const q = await preview(d.id, f);
  await tx((db) =>
    saveIncoming(db, actor, d.id, { expectedVersion: 1, form: f }),
  );
  await expect(
    tx((db) =>
      confirmIncoming(db, actor, d.id, {
        ...confirmation(f, q),
        expectedVersion: 2,
      }),
    ),
  ).rejects.toThrow("phiếu đã đổi");
});
it("two different receipts previewing same capacity cannot both commit stale allocations", async () => {
  const a = await fixture(),
    d = await draft(),
    e = await draft(),
    f = form([row(a, 100)]),
    p = await preview(d.id, f),
    q = await preview(e.id, f);
  const r = await Promise.allSettled([
    tx((db) => confirmIncoming(db, actor, d.id, confirmation(f, p))),
    tx((db) => confirmIncoming(db, actor, e.id, confirmation(f, q))),
  ]);
  expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  expect((await loadOrder(pool, a.id)).items[0].received).toBe(100);
});
it("automatic rows cannot directly post received quantities without server preview", async () => {
  const a = await fixture(),
    d = await draft(),
    f = form([row(a, 100)]);
  await expect(
    tx((db) =>
      confirmIncoming(db, actor, d.id, {
        expectedVersion: 1,
        checked: true,
        form: f,
        orders: [{ id: a.id, version: a.version }],
      }),
    ),
  ).rejects.toThrow("Tự động cộng dồn");
});
it("preview binds to actor and draft; cannot reuse another preview", async () => {
  const a = await fixture(),
    d = await draft(),
    e = await draft(),
    f = form([row(a, 100)]),
    p = await preview(d.id, f);
  await expect(
    tx((db) => confirmIncoming(db, actor, e.id, confirmation(f, p))),
  ).rejects.toThrow("phiếu đã đổi");
  const other = { id: randomUUID(), name: "Other", role: "Administrator" };
  await pool.query(
    "INSERT INTO users(id,tenant_key,open_id,name,role) VALUES($1,'test','other-allocation','Other','Administrator')",
    [other.id],
  );
  await expect(
    tx((db) => confirmIncoming(db, other, d.id, confirmation(f, p))),
  ).rejects.toThrow("hết hạn");
});
it("null quantities and duplicated table row IDs are rejected before preview", async () => {
  const a = await fixture(),
    r = row(a, 100);
  expect(() => incomingAllocation(form([{ ...r, qty: null }]), [a])).toThrow(
    "Điền số lượng",
  );
  expect(() => incomingAllocation(form([r, r]), [a])).toThrow("Trùng dòng");
});

it("SKU balance includes untouched matching orders, not just allocation lines", async () => {
  const a = await fixture(),
    b = await fixture(200, "2026-10-24T10:00:00+07:00");
  const r = incomingAllocation(form([row(a, 100)]), [a, b]);
  expect(r.allocations).toHaveLength(1);
  expect(r).toMatchObject({
    pendingBefore: 350,
    pendingAfter: 250,
    allocated: 100,
    remaining: 0,
  });
  expect(r.balances[0]).toMatchObject({
    sku: "MIU37",
    size: "M",
    pendingBefore: 350,
    receivedNow: 100,
    pendingAfter: 250,
  });
});

it("four-size rows under one bag confirm FIFO and retain grouping metadata", async () => {
  const a = await fixture(),
    b = await fixture(150, "2026-10-24T10:00:00+07:00"),
    d = await draft();
  const bagGroupId = randomUUID(),
    lineGroupId = randomUUID();
  const rows = (["S", "M", "L", "XL"] as const).map((size) => ({
    ...row(a, size === "M" ? 300 : 0),
    bag: "14",
    bagGroupId,
    lineGroupId,
    size,
    variantId: size === "M" ? a.items[0].variantId : null,
  }));
  const f = form(rows),
    p = await preview(d.id, f);
  expect(p.allocated).toBe(300);
  await tx((db) => confirmIncoming(db, actor, d.id, confirmation(f, p)));
  const saved = (
    await pool.query("SELECT form FROM incoming_goods_drafts WHERE id=$1", [
      d.id,
    ])
  ).rows[0].form;
  expect(saved.rows).toHaveLength(4);
  expect(
    saved.rows.every(
      (r: any) =>
        r.bagGroupId === bagGroupId &&
        r.lineGroupId === lineGroupId &&
        r.bag === "14",
    ),
  ).toBe(true);
  expect((await loadOrder(pool, a.id)).items[0].received).toBe(150);
  expect((await loadOrder(pool, b.id)).items[0].received).toBe(150);
});
