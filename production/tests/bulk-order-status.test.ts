import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, transaction } from "../server/db";
import { migrate } from "../server/migrate";
import {
  saveSku,
  createOrder,
  receive,
  loadOrder,
  orderAction,
} from "../server/service";
import { bulkOrderStatus } from "../server/bulk-order-status";
import { makeApp } from "../server/app";
import { priorityClass, highestPriority } from "../src/Priority";
const actor = {
  id: randomUUID(),
  name: "Synthetic batch planner",
  role: "Production Planner",
};
const tx = transaction;
beforeAll(async () => {
  await migrate();
});
beforeEach(async () => {
  await pool.query("TRUNCATE users,products,suppliers,session CASCADE");
  await pool.query(
    "INSERT INTO users(id,tenant_key,open_id,name,role) VALUES($1,'test','synthetic-batch',$2,'Production Planner')",
    [actor.id, actor.name],
  );
});
afterAll(async () => {
  await pool.end();
});
const order = () =>
  tx(async (db) => {
    const id = await saveSku(db, actor, {
      sku: "SYNTHETIC-" + randomUUID().slice(0, 6),
      color: "Cam",
      size: "M",
    });
    return createOrder(db, actor, {
      time: "2026-10-24T10:00:00+07:00",
      supplier: "Synthetic factory",
      delivery: "2026-10-28",
      requestedBy: actor.name,
      notes: "Keep this metadata",
      status: "Nháp",
      items: [{ variantId: id, qty: 100, priority: "CẤP BÁCH" }],
    });
  });
const request = (orders: any[], extra = {}) => ({
  orders: orders.map((o) => ({ id: o.id, expectedVersion: o.version })),
  status: "Đang sản xuất",
  reason: "Synthetic production confirmation",
  ...extra,
});
it("changes all selected statuses with per-order revisions and shared batch audit; item IDs/priorities/metadata remain", async () => {
  const a = await order(),
    b = await order();
  const result = await tx((db) => bulkOrderStatus(db, actor, request([a, b])));
  expect(result.changed).toBe(2);
  for (const o of [a, b]) {
    const after = await loadOrder(pool, o.id);
    expect(after.status).toBe("Đang sản xuất");
    expect(after.version).toBe(o.version + 1);
    expect(after.items).toEqual(o.items);
    expect(after.notes).toBe(o.notes);
    expect(after.supplier).toBe(o.supplier);
  }
  const rev = (
    await pool.query(
      "SELECT before,after,reason FROM production_order_revisions",
    )
  ).rows;
  expect(rev).toHaveLength(2);
  expect(
    rev.every(
      (r) => r.before.status === "Nháp" && r.after.status === "Đang sản xuất",
    ),
  ).toBe(true);
  const audit = (
    await pool.query(
      "SELECT details FROM activity_logs WHERE action='order.status.bulk'",
    )
  ).rows;
  expect(audit).toHaveLength(2);
  expect(audit.every((a) => a.details.batchId === result.batchId)).toBe(true);
});
it("partial receipts immutable, quantities received and receipt IDs not rewritten", async () => {
  let o = await order();
  await tx((db) =>
    receive(db, actor, o.id, randomUUID(), {
      expectedVersion: o.version,
      date: "2026-10-24",
      note: "Synthetic partial",
      lines: [{ itemId: o.items[0].id, qty: 30 }],
    }),
  );
  o = await loadOrder(pool, o.id);
  const before = (await pool.query("SELECT * FROM production_receipts")).rows;
  await tx((db) =>
    bulkOrderStatus(db, actor, request([o], { status: "Tạm dừng" })),
  );
  expect((await loadOrder(pool, o.id)).items).toEqual(o.items);
  expect((await pool.query("SELECT * FROM production_receipts")).rows).toEqual(
    before,
  );
});
it("one stale version rolls back the entire batch, no partial revisions", async () => {
  const a = await order(),
    b = await order();
  await pool.query(
    "UPDATE production_orders SET version=version+1 WHERE id=$1",
    [b.id],
  );
  await expect(
    tx((db) => bulkOrderStatus(db, actor, request([a, b]))),
  ).rejects.toThrow("đã thay đổi");
  expect((await loadOrder(pool, a.id)).status).toBe("Nháp");
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM production_order_revisions",
      )
    ).rows[0].n,
  ).toBe(0);
});
it("cancelled/deleted/completed reject all targets, never silently reopen or mark receipts complete", async () => {
  for (const kind of ["cancel", "delete", "complete"]) {
    const a = await order(),
      b = await order();
    if (kind === "complete")
      await tx((db) =>
        receive(db, actor, b.id, randomUUID(), {
          expectedVersion: b.version,
          date: "2026-10-24",
          note: "Synthetic full",
          lines: [{ itemId: b.items[0].id, qty: 100 }],
        }),
      );
    else
      await tx((db) =>
        orderAction(db, actor, b.id, kind, {
          expectedVersion: b.version,
          reason: "Synthetic archive/cancel",
        }),
      );
    const current = await loadOrder(pool, b.id);
    await expect(
      tx((db) => bulkOrderStatus(db, actor, request([a, current]))),
    ).rejects.toThrow("không thể");
    expect((await loadOrder(pool, a.id)).status).toBe("Nháp");
  }
});
it("no-op statuses do not bump version or create misleading revision/audit; mixed batches count accurately", async () => {
  const a = await order(),
    b = await order();
  const x = await tx((db) =>
    bulkOrderStatus(db, actor, request([a], { status: "Nháp" })),
  );
  expect(x).toMatchObject({ changed: 0, unchanged: 1 });
  expect((await loadOrder(pool, a.id)).version).toBe(a.version);
  await tx((db) => bulkOrderStatus(db, actor, request([b])));
  const fresh = await loadOrder(pool, b.id);
  expect(
    await tx((db) => bulkOrderStatus(db, actor, request([a, fresh]))),
  ).toMatchObject({ changed: 1, unchanged: 1 });
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM production_order_revisions",
      )
    ).rows[0].n,
  ).toBe(2);
});
it("concurrent batches using same versions: exactly one succeeds", async () => {
  const a = await order(),
    b = await order();
  const results = await Promise.allSettled([
    tx((db) => bulkOrderStatus(db, actor, request([a, b]))),
    tx((db) =>
      bulkOrderStatus(db, actor, request([b, a], { status: "Đã xác nhận" })),
    ),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM production_order_revisions",
      )
    ).rows[0].n,
  ).toBe(2);
});
it("input constraints: reason, duplicates, empty/>200 selections, forged receipt/cancellation statuses and extra fields", async () => {
  const a = await order();
  for (const body of [
    request([a], { reason: "x" }),
    request([a, a]),
    request([a, { ...a, id: a.id.toUpperCase() }]),
    request([]),
    request([a], { status: "Đã giao đủ" }),
    request([a], { status: "Đã hủy phần còn lại" }),
    request([a], { received: 100 }),
    request(
      Array.from({ length: 201 }, () => ({ id: randomUUID(), version: 1 })),
    ),
  ])
    await expect(
      tx((db) => bulkOrderStatus(db, actor, body)),
    ).rejects.toThrow();
  expect((await loadOrder(pool, a.id)).status).toBe("Nháp");
});
it("actor permission is rechecked against DB, including account disable", async () => {
  const a = await order();
  for (const role of ["Viewer", "Warehouse Operator", "Manager"]) {
    await pool.query("UPDATE users SET role=$1 WHERE id=$2", [role, actor.id]);
    await expect(
      tx((db) => bulkOrderStatus(db, actor, request([a]))),
    ).rejects.toThrow("quyền");
  }
  await pool.query(
    "UPDATE users SET role='Production Planner',disabled=true WHERE id=$1",
    [actor.id],
  );
  await expect(
    tx((db) => bulkOrderStatus(db, actor, request([a]))),
  ).rejects.toThrow("quyền");
});
it("HTTP requires session, CSRF and Planner/Admin; Viewer cannot batch", async () => {
  const server = makeApp().listen(0, "127.0.0.1");
  await new Promise<void>((ok) => server.once("listening", ok));
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  try {
    const a = await order(),
      body = request([a]),
      path = base + "/api/orders/bulk-status";
    expect(
      (
        await fetch(path, {
          method: "POST",
          headers: {
            Origin: process.env.PUBLIC_URL!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        })
      ).status,
    ).toBe(401);
    const login = await fetch(base + "/auth/dev", {
        method: "POST",
        headers: { Origin: process.env.PUBLIC_URL! },
      }),
      cookie = login.headers.get("set-cookie")!.split(";")[0],
      me = await (
        await fetch(base + "/api/me", { headers: { Cookie: cookie } })
      ).json();
    const post = (csrf = me.csrf) =>
      fetch(path, {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: process.env.PUBLIC_URL!,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify(body),
      });
    expect((await post("wrong")).status).toBe(403);
    await pool.query("UPDATE users SET role='Viewer' WHERE id=$1", [
      me.user.id,
    ]);
    expect((await post()).status).toBe(403);
    await pool.query("UPDATE users SET role='Production Planner' WHERE id=$1", [
      me.user.id,
    ]);
    expect((await post()).status).toBe(200);
  } finally {
    await new Promise<void>((ok) => server.close(() => ok()));
  }
});
it("priority tone and highest level stay deterministic without losing text labels", () => {
  expect(priorityClass("THƯỜNG")).toBe("priority-normal");
  expect(priorityClass("ƯU TIÊN")).toBe("priority-high");
  expect(priorityClass("CẤP BÁCH")).toBe("priority-urgent");
  expect(
    highestPriority([{ priority: "THƯỜNG" }, { priority: "ƯU TIÊN" }]),
  ).toBe("ƯU TIÊN");
  expect(
    highestPriority([{ priority: "CẤP BÁCH" }, { priority: "ƯU TIÊN" }]),
  ).toBe("CẤP BÁCH");
});
