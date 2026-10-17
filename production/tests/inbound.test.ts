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
  editOrder,
  variants,
} from "../server/service";
import { previewInbound, confirmInbound } from "../server/inbound";
import { skuSchema, forecast } from "../shared/domain";
import { makeApp } from "../server/app";
const actor = {
  id: randomUUID(),
  name: "Synthetic inbound planner",
  role: "Production Planner",
};
const tx = transaction;
beforeAll(async () => {
  await migrate();
});
beforeEach(async () => {
  await pool.query("TRUNCATE users,products,suppliers,session CASCADE");
  await pool.query(
    "INSERT INTO users(id,tenant_key,open_id,name,role) VALUES($1,'test','synthetic-inbound',$2,'Production Planner')",
    [actor.id, actor.name],
  );
});
afterAll(async () => {
  await pool.end();
});
const sku = (size = "M") =>
  tx((db) =>
    saveSku(
      db,
      actor,
      skuSchema.parse({
        sku: "SYNTHETIC-INBOUND",
        color: "Cam",
        size,
        stock: 30,
        inbound: 999,
        day1: 40,
        day2: 40,
        health: "Tăng trưởng",
        inventoryAt: "2026-10-14T00:00:00+07:00",
        inventorySource: "Synthetic Lark",
      }),
    ),
  );
const order = (id: string, qty = 100, status = "Đã xác nhận") =>
  tx((db) =>
    createOrder(db, actor, {
      time: "2026-10-17T10:00:00+07:00",
      supplier: "Synthetic factory",
      delivery: "2026-10-20",
      requestedBy: actor.name,
      status,
      notes: "Synthetic only",
      items: [{ variantId: id, qty, priority: "THƯỜNG" }],
    }),
  );
const received = (o: any, qty: number) =>
  tx((db) =>
    receive(db, actor, o.id, randomUUID(), {
      expectedVersion: o.version,
      date: "2026-10-17",
      note: "Synthetic",
      lines: [{ itemId: o.items[0].id, qty }],
    }),
  );
const preview = (ids: string[], extra = {}) =>
  tx((db) => previewInbound(db, actor, { ids, ...extra }));
it("sums remaining across active orders, excludes draft/paused/cancelled/deleted/completed; replaces without touching stock/sales/lifecycle", async () => {
  const id = await sku(),
    a = await order(id, 100);
  await received(a, 30);
  await order(id, 50, "Đang sản xuất");
  await order(id, 500, "Nháp");
  await order(id, 600, "Tạm dừng");
  const cancelled = await order(id, 700);
  await tx((db) =>
    orderAction(db, actor, cancelled.id, "cancel", {
      expectedVersion: cancelled.version,
      reason: "Synthetic cancel",
    }),
  );
  const deleted = await order(id, 800);
  await tx((db) =>
    orderAction(db, actor, deleted.id, "delete", {
      expectedVersion: deleted.version,
      reason: "Synthetic delete",
    }),
  );
  const done = await order(id, 10);
  await received(done, 10);
  const p = await preview([id]);
  expect(p.rows[0].inbound).toBe(120);
  expect(p.rows[0].sources).toHaveLength(2);
  expect(p.ignored).toHaveLength(4);
  expect((await variants())[0].inbound).toBe(999);
  await tx((db) => confirmInbound(db, actor, p.id));
  const v = (await variants())[0];
  expect(v).toMatchObject({
    stock: 30,
    inbound: 120,
    day1: 40,
    day2: 40,
    health: "Tăng trưởng",
    inventorySource: "Synthetic Lark",
    inventoryAt: "2026-10-14T00:00:00+07:00",
  });
  expect(forecast(v).need).toBe(50); // 40*5-30-120. Do not also subtract the same factory debt.
  expect(
    (
      await pool.query(
        "SELECT details FROM activity_logs WHERE action='planning.inbound.reconcile'",
      )
    ).rows[0].details.rows[0],
  ).toMatchObject({ previous: 999, inbound: 120 });
});
it("draft and paused inclusion must be explicit; deleted and cancelled always excluded", async () => {
  const id = await sku();
  await order(id, 10, "Nháp");
  await order(id, 20, "Tạm dừng");
  expect((await preview([id])).rows[0].inbound).toBe(0);
  expect((await preview([id], { includeDrafts: true })).rows[0].inbound).toBe(
    10,
  );
  expect(
    (await preview([id], { includeDrafts: true, includePaused: true })).rows[0]
      .inbound,
  ).toBe(30);
});
it("zero sources replaces old inbound with zero only after confirmation; selected size only", async () => {
  const m = await sku(),
    s = await sku("S");
  await order(s, 99);
  const p = await preview([m]);
  expect(p.rows).toHaveLength(1);
  expect(p.rows[0].inbound).toBe(0);
  await tx((db) => confirmInbound(db, actor, p.id));
  const all = await variants();
  expect(all.find((v) => v.id === m)?.inbound).toBe(0);
  expect(all.find((v) => v.id === s)?.inbound).toBe(999);
});
it("repeated and concurrent confirmations are idempotent, snapshots not duplicated", async () => {
  const id = await sku();
  await order(id, 30);
  const p = await preview([id]);
  const results = await Promise.all([
    tx((db) => confirmInbound(db, actor, p.id)),
    tx((db) => confirmInbound(db, actor, p.id)),
  ]);
  expect(results.filter((r) => r.replayed)).toHaveLength(1);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM inventory_snapshots WHERE source='Đối soát lệnh sản xuất'",
      )
    ).rows[0].n,
  ).toBe(1);
});
it("receipt after preview invalidates before updating any SKU", async () => {
  const id = await sku(),
    o = await order(id, 100),
    p = await preview([id]);
  await received(o, 30);
  await expect(tx((db) => confirmInbound(db, actor, p.id))).rejects.toThrow(
    "giao nhận đã thay đổi",
  );
  expect((await variants())[0].inbound).toBe(999);
  const next = await preview([id]);
  expect(next.rows[0].inbound).toBe(70);
});
it("new order, soft deletion and order edits invalidate preview", async () => {
  const id = await sku();
  const o = await order(id, 100);
  let p = await preview([id]);
  await order(id, 20);
  await expect(tx((db) => confirmInbound(db, actor, p.id))).rejects.toThrow(
    "đã thay đổi",
  );
  p = await preview([id]);
  await tx((db) =>
    orderAction(db, actor, o.id, "delete", {
      expectedVersion: o.version,
      reason: "Synthetic archive",
    }),
  );
  await expect(tx((db) => confirmInbound(db, actor, p.id))).rejects.toThrow(
    "đã thay đổi",
  );
});
it("SKU version conflict rolls back all selected rows", async () => {
  const a = await sku(),
    b = await sku("S"),
    p = await preview([a, b]);
  await pool.query("UPDATE variants SET version=version+1 WHERE id=$1", [b]);
  await expect(tx((db) => confirmInbound(db, actor, p.id))).rejects.toThrow(
    "SKU đã được cập nhật",
  );
  expect((await variants()).every((v) => v.inbound === 999)).toBe(true);
});
it("expiry, wrong actor, wrong preview kind, missing and duplicate SKU selection blocked", async () => {
  const id = await sku(),
    p = await preview([id]);
  await expect(
    tx((db) => confirmInbound(db, { ...actor, id: randomUUID() }, p.id)),
  ).rejects.toThrow("của bạn");
  await pool.query(
    "UPDATE import_previews SET body=jsonb_set(body,'{fetchedAt}','\"2026-01-01T00:00:00Z\"') WHERE id=$1",
    [p.id],
  );
  await expect(tx((db) => confirmInbound(db, actor, p.id))).rejects.toThrow(
    "15 phút",
  );
  await expect(preview([id, id])).rejects.toThrow();
  await expect(preview([randomUUID()])).rejects.toThrow("không còn");
  await expect(preview([])).rejects.toThrow();
});
it("HTTP Planner can reconcile; anonymous, Viewer, Warehouse and missing CSRF cannot", async () => {
  const server = makeApp().listen(0, "127.0.0.1");
  await new Promise<void>((ok) => server.once("listening", ok));
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  try {
    const path = "/api/planning/inbound/preview";
    expect(
      (
        await fetch(base + path, {
          method: "POST",
          headers: {
            Origin: process.env.PUBLIC_URL!,
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
    ).toBe(401);
    const login = await fetch(base + "/auth/dev", {
      method: "POST",
      headers: { Origin: process.env.PUBLIC_URL! },
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const me = await (
      await fetch(base + "/api/me", { headers: { Cookie: cookie } })
    ).json();
    const id = await sku();
    const post = (url: string, body: any, csrf = me.csrf) =>
      fetch(base + url, {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: process.env.PUBLIC_URL!,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        body: JSON.stringify(body),
      });
    expect((await post(path, { ids: [id] }, "bad")).status).toBe(403);
    await pool.query("UPDATE users SET role='Production Planner' WHERE id=$1", [
      me.user.id,
    ]);
    const result = await post(path, { ids: [id] });
    expect(result.status).toBe(200);
    const p = await result.json();
    expect(
      (await post(`/api/planning/inbound/${p.id}/confirm`, {})).status,
    ).toBe(200);
    for (const role of ["Viewer", "Warehouse Operator"]) {
      await pool.query("UPDATE users SET role=$1 WHERE id=$2", [
        role,
        me.user.id,
      ]);
      expect((await post(path, { ids: [id] })).status).toBe(403);
      expect(
        (await post(`/api/planning/inbound/${p.id}/confirm`, {})).status,
      ).toBe(403);
    }
  } finally {
    await new Promise<void>((ok) => server.close(() => ok()));
  }
});
