import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, transaction as tx } from "../server/db";
import { migrate } from "../server/migrate";
import {
  saveSku,
  createOrder,
  loadOrder,
  receive,
  orderAction,
} from "../server/service";
import {
  createIncoming,
  confirmIncoming,
  previewIncomingAllocation,
} from "../server/incoming-goods";
import { loadReceivingReport, receivingCsv } from "../server/receiving-report";
import { receivingReport } from "../shared/receiving-report";
import { makeApp } from "../server/app";
const actor = {
  id: randomUUID(),
  name: "Synthetic warehouse",
  role: "Administrator",
};
beforeAll(async () => {
  await migrate();
});
beforeEach(async () => {
  await pool.query("TRUNCATE users,products,suppliers,session CASCADE");
  await pool.query(
    "INSERT INTO users(id,tenant_key,open_id,name,role) VALUES($1,'test','unmatched-test',$2,'Administrator')",
    [actor.id, actor.name],
  );
});
afterAll(async () => {
  await pool.end();
});
async function fixture() {
  const v = await tx((db) =>
    saveSku(db, actor, {
      sku: "MIU37",
      color: "Ghi tây (Phối nâu)",
      size: "M",
      stock: 30,
      inbound: 10,
    }),
  );
  const order = await tx((db) =>
    createOrder(db, actor, {
      time: "2026-10-23T10:00:00+07:00",
      supplier: "PRIMITEX",
      delivery: "2026-10-25",
      requestedBy: actor.name,
      notes: "Synthetic",
      status: "Đang sản xuất",
      items: [{ variantId: v, qty: 150, priority: "THƯỜNG" }],
    }),
  );
  return { v, order };
}
const row = (extra: any = {}) => ({
  id: randomUUID(),
  sku: "MIU37",
  color: "Ghi tây (Phối nâu)",
  bag: "5",
  size: "XL",
  qty: 54,
  variantId: null,
  orderId: null,
  remember: false,
  allocationMode: "auto",
  ...extra,
});
async function setup(rows: any[], extra: any = {}) {
  const d = await tx((db) => createIncoming(db, actor, { images: [] }));
  const form = {
    date: "2026-10-28",
    supplier: "PRIMITEX",
    note: "Hàng sửa / lô cũ",
    rows,
    ...extra,
  };
  const p = await tx((db) =>
    previewIncomingAllocation(db, actor, d.id, { expectedVersion: 1, form }),
  );
  return {
    d,
    form,
    p,
    body: {
      expectedVersion: 1,
      form,
      orders: p.orders,
      allocationPreviewId: p.id,
      checked: true,
      acceptUnmatched: true,
    },
  };
}
it("missing size without SKU/order can confirm as unmatched, without creating catalog/order/stock", async () => {
  const f = await fixture(),
    s = await setup([row()]);
  expect(s.p).toMatchObject({ allocated: 0, remaining: 54 });
  const result = await tx((db) => confirmIncoming(db, actor, s.d.id, s.body));
  expect(result).toMatchObject({
    received: 54,
    matchedReceived: 0,
    unmatchedReceived: 54,
    receipts: [],
  });
  expect(
    (await pool.query("SELECT * FROM incoming_unmatched_items")).rows[0],
  ).toMatchObject({
    sku: "MIU37",
    size: "XL",
    qty: 54,
    supplier: "PRIMITEX",
    bag: "5",
  });
  expect((await pool.query("SELECT * FROM variants")).rowCount).toBe(1);
  expect((await pool.query("SELECT * FROM production_orders")).rowCount).toBe(
    1,
  );
  expect((await loadOrder(pool, f.order.id)).items[0].received).toBe(0);
  expect(
    (await pool.query("SELECT body FROM variants")).rows[0].body,
  ).toMatchObject({ stock: 30, inbound: 10 });
});
it("partial FIFO receipt records150 matched +54 unmatched, conserving actual204", async () => {
  const f = await fixture(),
    s = await setup([row({ size: "M", variantId: f.v, qty: 204 })]);
  expect(s.p).toMatchObject({ allocated: 150, remaining: 54 });
  const r = await tx((db) => confirmIncoming(db, actor, s.d.id, s.body));
  expect(r).toMatchObject({
    received: 204,
    matchedReceived: 150,
    unmatchedReceived: 54,
  });
  expect((await loadOrder(pool, f.order.id)).items[0]).toMatchObject({
    qty: 150,
    received: 150,
  });
  const report = await loadReceivingReport(pool, {
    from: "2026-10-28",
    to: "2026-10-28",
  });
  expect(report.totals).toMatchObject({
    received: 204,
    matched: 150,
    unmatched: 54,
    pending: 0,
  });
  expect(report.products[0].colors[0].sizes.M).toBe(204);
});
it("text-only SKU identity resolves the actual variant for a matching receipt and preview balances", async () => {
  const f = await fixture(),
    s = await setup([row({ size: "M", qty: 204 })]);
  expect(s.p).toMatchObject({
    allocated: 150,
    remaining: 54,
    pendingBefore: 150,
    pendingAfter: 0,
  });
  const r = await tx((db) => confirmIncoming(db, actor, s.d.id, s.body));
  expect(r).toMatchObject({
    received: 204,
    matchedReceived: 150,
    unmatchedReceived: 54,
  });
  expect((await loadOrder(pool, f.order.id)).items[0].received).toBe(150);
});
it("manual text-only identity never matches another colour of the same code and size", async () => {
  const f = await fixture(),
    s = await setup([
      row({
        size: "M",
        color: "Đen",
        qty: 20,
        allocationMode: "manual",
        orderId: f.order.id,
      }),
    ]);
  expect(s.p).toMatchObject({ allocated: 0, remaining: 20 });
  expect(s.p.unallocated[0].canRecordUnmatched).toBe(false);
  await expect(
    tx((db) => confirmIncoming(db, actor, s.d.id, s.body)),
  ).rejects.toThrow("bị chặn");
  expect((await loadOrder(pool, f.order.id)).items[0].received).toBe(0);
});
it("unmatched is explicit acknowledgement; missing acknowledgement/factory rolls back the whole mixed batch", async () => {
  const f = await fixture(),
    s = await setup([row({ size: "M", variantId: f.v, qty: 204 })]);
  await expect(
    tx((db) =>
      confirmIncoming(db, actor, s.d.id, { ...s.body, acceptUnmatched: false }),
    ),
  ).rejects.toThrow("Đánh dấu");
  const empty = await setup([row()], { supplier: "" });
  await expect(
    tx((db) => confirmIncoming(db, actor, empty.d.id, empty.body)),
  ).rejects.toThrow("Nhà xưởng");
  expect((await pool.query("SELECT * FROM production_receipts")).rowCount).toBe(
    0,
  );
  expect(
    (await pool.query("SELECT * FROM incoming_unmatched_items")).rowCount,
  ).toBe(0);
});
it("explicit unmatched choice preserves outstanding order even when a matching order exists", async () => {
  const f = await fixture(),
    s = await setup([
      row({ size: "M", variantId: f.v, qty: 20, allocationMode: "unmatched" }),
    ]);
  await tx((db) => confirmIncoming(db, actor, s.d.id, s.body));
  expect((await loadOrder(pool, f.order.id)).items[0].received).toBe(0);
  const r = await loadReceivingReport(pool, {});
  expect(r.totals).toMatchObject({
    received: 20,
    matched: 0,
    unmatched: 20,
    pending: 150,
  });
});
it("fully unknown code/colour records textual identity and factory without creating a SKU", async () => {
  const s = await setup(
    [
      row({
        sku: "OLD99",
        color: "Màu lô cũ",
        size: "S",
        qty: 17,
        allocationMode: "unmatched",
      }),
    ],
    { supplier: "Xưởng lô cũ" },
  );
  await tx((db) => confirmIncoming(db, actor, s.d.id, s.body));
  expect((await pool.query("SELECT * FROM variants")).rowCount).toBe(0);
  expect(
    (await loadReceivingReport(pool, { supplier: "Xưởng lô cũ" })).totals
      .unmatched,
  ).toBe(17);
});
it("idempotent/concurrent retries produce one unmatched ledger entry, immutable at DB", async () => {
  const s = await setup([row()]);
  const [a, b] = await Promise.all([
    tx((db) => confirmIncoming(db, actor, s.d.id, s.body)),
    tx((db) => confirmIncoming(db, actor, s.d.id, s.body)),
  ]);
  expect(a).toEqual(b);
  expect(
    (await pool.query("SELECT * FROM incoming_unmatched_items")).rowCount,
  ).toBe(1);
  await expect(
    pool.query("UPDATE incoming_unmatched_items SET qty=1"),
  ).rejects.toThrow("append-only");
  await expect(
    pool.query("DELETE FROM incoming_unmatched_items"),
  ).rejects.toThrow("append-only");
});
it("ambiguous multiple factories or wrong manual selection cannot be silently classified unmatched", async () => {
  const f = await fixture();
  await tx((db) =>
    createOrder(db, actor, {
      time: "2026-10-24T10:00:00+07:00",
      supplier: "OTHER",
      delivery: null,
      requestedBy: actor.name,
      notes: "",
      status: "Đang sản xuất",
      items: [{ variantId: f.v, qty: 100, priority: "THƯỜNG" }],
    }),
  );
  const s = await setup([row({ size: "M", variantId: f.v, qty: 10 })], {
    supplier: "",
  });
  expect(s.p.unallocated[0].canRecordUnmatched).toBe(false);
  await expect(
    tx((db) => confirmIncoming(db, actor, s.d.id, s.body)),
  ).rejects.toThrow("bị chặn");
  const m = await setup([
    row({ allocationMode: "manual", orderId: f.order.id }),
  ]);
  await expect(
    tx((db) => confirmIncoming(db, actor, m.d.id, m.body)),
  ).rejects.toThrow("bị chặn");
});
it("new matching order after unmatched preview conflicts; recompute before receiving", async () => {
  const s = await setup([row()]);
  const v = await tx((db) =>
    saveSku(db, actor, {
      sku: "MIU37",
      color: "Ghi tây (Phối nâu)",
      size: "XL",
    }),
  );
  await tx((db) =>
    createOrder(db, actor, {
      time: "2026-10-23T10:00:00+07:00",
      supplier: "PRIMITEX",
      delivery: null,
      requestedBy: actor.name,
      notes: "",
      status: "Đang sản xuất",
      items: [{ variantId: v, qty: 54, priority: "THƯỜNG" }],
    }),
  );
  await expect(
    tx((db) => confirmIncoming(db, actor, s.d.id, s.body)),
  ).rejects.toThrow("đã thay đổi");
  expect(
    (await pool.query("SELECT * FROM incoming_unmatched_items")).rowCount,
  ).toBe(0);
});
it("report includes direct and archived order receipts once, date uses receipt date and debt uses current state", async () => {
  const f = await fixture();
  await tx((db) =>
    receive(db, actor, f.order.id, randomUUID(), {
      expectedVersion: 1,
      date: "2026-10-01",
      note: "Direct receipt",
      lines: [{ itemId: f.order.items[0].id, qty: 40 }],
    }),
  );
  let r = await loadReceivingReport(pool, {
    from: "2026-10-28",
    to: "2026-10-28",
  });
  expect(r.totals).toMatchObject({ received: 0, pending: 110 });
  r = await loadReceivingReport(pool, { from: "2026-10-01", to: "2026-10-28" });
  expect(r.totals).toMatchObject({
    received: 40,
    matched: 40,
    unmatched: 0,
    pending: 110,
  });
  expect(r.exportEntries[0].supplier).toBe("PRIMITEX");
  await tx((db) =>
    orderAction(db, actor, f.order.id, "delete", {
      expectedVersion: 2,
      reason: "Synthetic delete",
    }),
  );
  r = await loadReceivingReport(pool, {});
  expect(r.totals).toMatchObject({ received: 40, pending: 0 });
  expect(r.entries[0].archived).toBe(true);
});
it("report filters classification, SKU, color, size and Vietnamese search; CSV uses same full dataset", async () => {
  await fixture();
  const s = await setup([
    row({ size: "S", qty: 10 }),
    row({ size: "XL", qty: 20 }),
  ]);
  await tx((db) => confirmIncoming(db, actor, s.d.id, s.body));
  let r = await loadReceivingReport(pool, {
    classification: "unmatched",
    size: "S",
    search: "ghi tay",
  });
  expect(r.totals.received).toBe(10);
  expect(r.products[0].share).toBe(100);
  expect(receivingCsv(r.exportEntries)).toContain('"Chưa đối chiếu lệnh"');
  expect(receivingCsv(r.exportEntries)).not.toContain('"XL"');
  r = await loadReceivingReport(pool, { sku: "other" });
  expect(r.totals.received).toBe(0);
  expect(r.products).toEqual([]);
  await expect(
    loadReceivingReport(pool, { from: "2026-10-28", to: "2026-10-01" }),
  ).rejects.toThrow();
});
it("report grand total/share/size conservation, zero safe and result limiting never changes totals", () => {
  const entries = Array.from({ length: 130 }, (_, i) => ({
    id: String(i),
    receiptId: String(i),
    draftId: null,
    actor: "Synthetic",
    date: "2026-10-28",
    sku: i % 2 ? "A" : "B",
    color: "Cam",
    size: "S",
    supplier: "Test",
    qty: 2,
    classification: "matched" as const,
    orderId: randomUUID(),
    code: "Test",
    bag: "",
    note: "",
    reason: "",
    archived: false,
  }));
  const r = receivingReport(entries, [], { limit: 50 }, "2026-10-28");
  expect(r.entries).toHaveLength(50);
  expect(r.entryCount).toBe(130);
  expect(r.totals.received).toBe(260);
  expect(r.products.reduce((n, p) => n + p.share, 0)).toBe(100);
  expect(r.exportEntries).toHaveLength(130);
  expect(receivingCsv([{ ...entries[0], sku: " =1+1" }])).toContain("' =1+1");
  expect(
    receivingReport([], [], {}, "2026-10-28").totals.unmatchedPercent,
  ).toBe(0);
});
it("report endpoints require login; Viewer can read report/export but cannot create unmatched receipt", async () => {
  const server = makeApp().listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    expect((await fetch(base + "/api/incoming/report")).status).toBe(401);
    const login = await fetch(base + "/auth/dev", {
        method: "POST",
        headers: { Origin: process.env.PUBLIC_URL! },
      }),
      cookie = login.headers.get("set-cookie")!.split(";")[0];
    await login.arrayBuffer();
    const me = await (
      await fetch(base + "/api/me", { headers: { Cookie: cookie } })
    ).json();
    await pool.query("UPDATE users SET role='Viewer' WHERE id=$1", [
      me.user.id,
    ]);
    expect(
      (
        await fetch(base + "/api/incoming/report", {
          headers: { Cookie: cookie },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(base + "/api/incoming/report/export", {
          headers: { Cookie: cookie },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(base + "/api/incoming", {
          method: "POST",
          headers: {
            Cookie: cookie,
            Origin: process.env.PUBLIC_URL!,
            "Content-Type": "application/json",
            "X-CSRF-Token": me.csrf,
          },
          body: JSON.stringify({ images: [] }),
        })
      ).status,
    ).toBe(403);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

it("factory report retains receipt snapshot after order factory is edited", async () => {
  const f = await fixture();
  await tx((db) =>
    receive(db, actor, f.order.id, randomUUID(), {
      expectedVersion: 1,
      date: "2026-10-28",
      note: "Snapshot",
      lines: [{ itemId: f.order.items[0].id, qty: 20 }],
    }),
  );
  await pool.query(
    "UPDATE production_orders SET body=jsonb_set(body,'{supplier}',to_jsonb('CHANGED FACTORY'::text)),version=version+1 WHERE id=$1",
    [f.order.id],
  );
  const r = await loadReceivingReport(pool, { supplier: "PRIMITEX" });
  expect(r.totals.received).toBe(20);
  expect(r.entries[0].supplier).toBe("PRIMITEX");
});
