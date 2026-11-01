import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, transaction as tx } from "../server/db";
import { migrate } from "../server/migrate";
import { addProductCatalog } from "../server/product-catalog";
import { saveSku, createOrder, loadOrder, receive } from "../server/service";
import {
  saveProductProfile,
  listProductProfiles,
} from "../server/product-profiles";
import { makeApp } from "../server/app";
const actor = {
  id: randomUUID(),
  name: "Synthetic catalogue planner",
  role: "Administrator",
};
beforeAll(async () => {
  await migrate();
});
beforeEach(async () => {
  await pool.query("TRUNCATE users,products,suppliers,session CASCADE");
  await pool.query(
    "INSERT INTO users(id,tenant_key,open_id,name,role) VALUES($1,'test','catalogue-test',$2,'Administrator')",
    [actor.id, actor.name],
  );
});
afterAll(async () => {
  await pool.end();
});
const input = (extra: any = {}) => ({
  mode: "new",
  sku: " synthetic-new ",
  name: "Synthetic shirt",
  goodsType: "In",
  colors: ["Đen", "Xám tiêu đậm"],
  sizes: ["S", "M", "L", "XL"],
  ...extra,
});
it("creates a product and all four-size child SKUs with unknown stock, zero sales and default type", async () => {
  const r = await tx((db) => addProductCatalog(db, actor, input()));
  expect(r).toMatchObject({ sku: "SYNTHETIC-NEW", created: 8, skipped: 0 });
  const profiles = await listProductProfiles();
  expect(profiles).toHaveLength(1);
  expect(profiles[0]).toMatchObject({
    name: "Synthetic shirt",
    goodsType: "In",
    version: 1,
  });
  expect(profiles[0].colors).toHaveLength(2);
  const rows = (await pool.query("SELECT body,version FROM variants")).rows;
  expect(rows).toHaveLength(8);
  for (const v of rows)
    expect(v).toMatchObject({
      version: 1,
      body: {
        name: "Synthetic shirt",
        stock: null,
        inbound: 0,
        day1: 0,
        day2: 0,
        health: "Mở bán",
        pilotQty: 0,
      },
    });
  expect((await pool.query("SELECT * FROM production_orders")).rowCount).toBe(
    0,
  );
});
it("append only creates missing combinations and preserves existing SKU, photo, receipts and order exactly", async () => {
  const v = await tx((db) =>
    saveSku(db, actor, {
      sku: "SYNTHETIC-EXIST",
      name: "Old name",
      color: "Đen",
      size: "M",
      stock: 30,
      inbound: 10,
      day1: 20,
      day2: 10,
      health: "Tăng trưởng",
    }),
  );
  const p = (await listProductProfiles())[0];
  await tx((db) =>
    saveProductProfile(db, actor, p.id, {
      expectedVersion: 0,
      goodsType: "Trơn",
      image: {
        name: "old.png",
        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
      },
    }),
  );
  const o = await tx((db) =>
    createOrder(db, actor, {
      time: "2026-11-01T10:00:00+07:00",
      supplier: "Synthetic factory",
      delivery: null,
      requestedBy: actor.name,
      notes: "Old order",
      status: "Đang sản xuất",
      items: [{ variantId: v, qty: 100, priority: "THƯỜNG" }],
    }),
  );
  await tx((db) =>
    receive(db, actor, o.id, randomUUID(), {
      expectedVersion: 1,
      date: "2026-11-01",
      note: "Old receipt",
      lines: [{ itemId: o.items[0].id, qty: 20 }],
    }),
  );
  const before = {
    variant: (await pool.query("SELECT * FROM variants WHERE id=$1", [v]))
      .rows[0],
    profile: (await pool.query("SELECT * FROM product_profiles")).rows,
    order: await loadOrder(pool, o.id),
    receipts: (await pool.query("SELECT * FROM production_receipts")).rows,
  };
  const r = await tx((db) =>
    addProductCatalog(db, actor, {
      mode: "append",
      productId: p.id,
      colors: ["ĐEN", "Xám tiêu đậm"],
      sizes: ["S", "M"],
    }),
  );
  expect(r).toMatchObject({ created: 3, skipped: 1 });
  expect(
    (await pool.query("SELECT * FROM variants WHERE id=$1", [v])).rows[0],
  ).toEqual(before.variant);
  expect((await pool.query("SELECT * FROM product_profiles")).rows).toEqual(
    before.profile,
  );
  expect(await loadOrder(pool, o.id)).toEqual(before.order);
  expect((await pool.query("SELECT * FROM production_receipts")).rows).toEqual(
    before.receipts,
  );
  expect(
    (
      await pool.query(
        "SELECT body->>'color' AS color FROM variants WHERE color_key='đen'",
      )
    ).rows.every((v) => v.color === "Đen"),
  ).toBe(true);
});
it("repeated append skips old SKUs without resetting versions or adding inventory snapshots", async () => {
  const created = await tx((db) => addProductCatalog(db, actor, input()));
  const before = (await pool.query("SELECT * FROM variants ORDER BY id")).rows,
    n = (await pool.query("SELECT * FROM inventory_snapshots")).rowCount;
  expect(
    await tx((db) =>
      addProductCatalog(db, actor, {
        mode: "append",
        productId: created.productId,
        colors: ["Đen", "Xám tiêu đậm"],
        sizes: ["S", "M", "L", "XL"],
      }),
    ),
  ).toMatchObject({ created: 0, skipped: 8 });
  expect((await pool.query("SELECT * FROM variants ORDER BY id")).rows).toEqual(
    before,
  );
  expect((await pool.query("SELECT * FROM inventory_snapshots")).rowCount).toBe(
    n,
  );
});
it("normalizes duplicate case/size choices but preserves distinct Vietnamese colour names", async () => {
  const r = await tx((db) =>
    addProductCatalog(
      db,
      actor,
      input({ colors: ["Đen", "đen", "Đỏ", "Đỗ"], sizes: ["S", "S", "M"] }),
    ),
  );
  expect(r.created).toBe(6);
  expect((await listProductProfiles())[0].colors).toHaveLength(3);
});
it("rejects existing codes and invalid child inputs atomically instead of updating old metadata", async () => {
  const r = await tx((db) => addProductCatalog(db, actor, input()));
  await expect(
    tx((db) =>
      addProductCatalog(
        db,
        actor,
        input({ sku: "SYNTHETIC-NEW", name: "overwrite" }),
      ),
    ),
  ).rejects.toThrow("đã có");
  for (const bad of [
    { colors: [] },
    { sizes: [] },
    { sizes: ["XS"] },
    { sizes: ["2XL"] },
    { colors: ["valid", " "] },
    { colors: Array.from({ length: 101 }, (_, i) => "Color" + i) },
  ])
    await expect(
      tx((db) =>
        addProductCatalog(db, actor, input({ sku: "SYNTHETIC-BAD", ...bad })),
      ),
    ).rejects.toThrow();
  await expect(
    tx((db) =>
      addProductCatalog(db, actor, {
        mode: "append",
        productId: r.productId,
        colors: ["Xanh"],
        sizes: ["M"],
        name: "overwrite",
      }),
    ),
  ).rejects.toThrow();
  await expect(
    tx((db) =>
      addProductCatalog(db, actor, {
        mode: "append",
        productId: randomUUID(),
        colors: ["Xanh"],
        sizes: ["M"],
      }),
    ),
  ).rejects.toThrow("Không tìm thấy");
  expect((await pool.query("SELECT * FROM products")).rowCount).toBe(1);
  expect((await listProductProfiles())[0].name).toBe("Synthetic shirt");
});
it("a transaction error leaves no orphan product/profile or partial variants", async () => {
  await expect(
    tx((db) => addProductCatalog(db, { ...actor, id: randomUUID() }, input())),
  ).rejects.toThrow();
  for (const table of [
    "products",
    "product_profiles",
    "variants",
    "inventory_snapshots",
  ])
    expect((await pool.query(`SELECT * FROM ${table}`)).rowCount).toBe(0);
});
it("concurrent appends serialize, creating one SKU and skipping its duplicate", async () => {
  const r = await tx((db) =>
    addProductCatalog(db, actor, input({ colors: ["Đen"], sizes: ["S"] })),
  );
  const body = {
    mode: "append",
    productId: r.productId,
    colors: ["Đen"],
    sizes: ["M"],
  };
  const results = await Promise.all([
    tx((db) => addProductCatalog(db, actor, body)),
    tx((db) => addProductCatalog(db, actor, body)),
  ]);
  expect(results.map((r) => r.created).sort()).toEqual([0, 1]);
  expect((await pool.query("SELECT * FROM variants")).rowCount).toBe(2);
});
it("catalogue endpoint enforces login, planner permission and CSRF", async () => {
  const app = makeApp(),
    server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    expect(
      (
        await fetch(base + "/api/product-profiles/catalog", {
          method: "POST",
          headers: {
            Origin: process.env.PUBLIC_URL!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(input()),
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
      ).json(),
      headers = {
        Cookie: cookie,
        Origin: process.env.PUBLIC_URL!,
        "Content-Type": "application/json",
        "X-CSRF-Token": me.csrf,
      };
    for (const role of ["Viewer", "Warehouse Operator", "Manager"]) {
      await pool.query("UPDATE users SET role=$2 WHERE id=$1", [
        me.user.id,
        role,
      ]);
      expect(
        (
          await fetch(base + "/api/product-profiles/catalog", {
            method: "POST",
            headers,
            body: JSON.stringify(input()),
          })
        ).status,
      ).toBe(403);
    }
    await pool.query("UPDATE users SET role='Production Planner' WHERE id=$1", [
      me.user.id,
    ]);
    expect(
      (
        await fetch(base + "/api/product-profiles/catalog", {
          method: "POST",
          headers: { ...headers, "X-CSRF-Token": "wrong" },
          body: JSON.stringify(input()),
        })
      ).status,
    ).toBe(403);
    const response = await fetch(base + "/api/product-profiles/catalog", {
      method: "POST",
      headers,
      body: JSON.stringify(input()),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ created: 8 });
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
