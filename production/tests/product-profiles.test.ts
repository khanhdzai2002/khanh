import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, transaction as tx } from "../server/db";
import { migrate } from "../server/migrate";
import {
  saveSku,
  createOrder,
  loadOrder,
  editOrder,
  receive,
  orderAction,
  dashboard,
} from "../server/service";
import {
  listProductProfiles,
  saveProductProfile,
} from "../server/product-profiles";
import { composeOrder } from "../server/order-composer";
import { makeApp } from "../server/app";
const actor = {
  id: randomUUID(),
  name: "Synthetic product planner",
  role: "Administrator",
};
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const image = { name: "synthetic.png", data: png };
beforeAll(async () => {
  await migrate();
});
beforeEach(async () => {
  await pool.query("TRUNCATE users,products,suppliers,session CASCADE");
  await pool.query(
    `INSERT INTO planning_policies VALUES(1,'{"targetDays":5,"leadDays":3,"safeDays":0,"includeLead":false,"roundTo":1}',1) ON CONFLICT(id) DO NOTHING`,
  );
  await pool.query(
    "INSERT INTO users(id,tenant_key,open_id,name,role) VALUES($1,'test','photo-test',$2,'Administrator')",
    [actor.id, actor.name],
  );
});
afterAll(async () => {
  await pool.end();
});
async function fixture() {
  const v = await tx((db) =>
    saveSku(db, actor, {
      sku: "MIU15",
      color: "Đen",
      size: "M",
      stock: 30,
      inbound: 10,
    }),
  );
  return { v, p: (await listProductProfiles())[0] };
}
const orderInput = (v: string) => ({
  time: "2026-10-28T10:00:00+07:00",
  supplier: "PRIMITEX",
  delivery: null,
  requestedBy: actor.name,
  notes: "Synthetic",
  status: "Đang sản xuất",
  items: [{ variantId: v, qty: 100, priority: "THƯỜNG" }],
});
const editInput = (o: any) => ({
  expectedVersion: o.version,
  reason: "Synthetic edit",
  order: {
    code: o.code,
    time: o.time,
    supplier: o.supplier,
    delivery: o.delivery,
    requestedBy: o.requestedBy,
    notes: o.notes,
    status: o.status,
    items: o.items.map(({ id, variantId, qty, priority, goodsType }: any) => ({
      id,
      variantId,
      qty,
      priority,
      goodsType,
    })),
  },
});
it("one product profile serves all colours/sizes, never adds image bytes to dashboard or SKU payload", async () => {
  const { p } = await fixture();
  await tx((db) =>
    saveSku(db, actor, { sku: "MIU15", color: "Trắng", size: "S" }),
  );
  expect(await listProductProfiles()).toHaveLength(1);
  expect(p).toMatchObject({
    sku: "MIU15",
    version: 0,
    goodsType: null,
    imageUrl: null,
  });
  const saved = await tx((db) =>
    saveProductProfile(db, actor, p.id, {
      expectedVersion: 0,
      goodsType: "In",
      image,
    }),
  );
  expect(saved).toMatchObject({
    version: 1,
    goodsType: "In",
    imageName: "synthetic.png",
  });
  expect(saved.imageUrl).toContain(`/api/product-profiles/${p.id}/image?v=`);
  const snapshot = await dashboard();
  expect(snapshot.products).toHaveLength(1);
  expect(JSON.stringify(snapshot)).not.toContain(png);
  expect(snapshot.skus.every((s) => !("image" in s))).toBe(true);
});
it("validates image bytes, size and enum; a bad upload leaves profile untouched", async () => {
  const { p } = await fixture();
  for (const bad of [
    "a===",
    Buffer.from("<svg><script>bad</script></svg>").toString("base64"),
    Buffer.concat([
      Buffer.from([255, 216, 255]),
      Buffer.alloc(2097150),
    ]).toString("base64"),
  ])
    await expect(
      tx((db) =>
        saveProductProfile(db, actor, p.id, {
          expectedVersion: 0,
          goodsType: "In",
          image: { name: "wrong.jpg", data: bad },
        }),
      ),
    ).rejects.toThrow();
  await expect(
    tx((db) =>
      saveProductProfile(db, actor, p.id, {
        expectedVersion: 0,
        goodsType: "Khác",
      }),
    ),
  ).rejects.toThrow();
  await expect(
    tx((db) =>
      saveProductProfile(db, actor, p.id, {
        expectedVersion: 0,
        goodsType: null,
        image,
        removeImage: true,
      }),
    ),
  ).rejects.toThrow();
  expect((await listProductProfiles())[0]).toMatchObject({
    version: 0,
    imageUrl: null,
  });
});
it("type-only edits preserve image; replacement/removal changes metadata with no binary audit copies", async () => {
  const { p } = await fixture();
  const a = await tx((db) =>
    saveProductProfile(db, actor, p.id, {
      expectedVersion: 0,
      goodsType: "In",
      image,
    }),
  );
  const b = await tx((db) =>
    saveProductProfile(db, actor, p.id, {
      expectedVersion: 1,
      goodsType: "Trơn",
    }),
  );
  expect(b.imageUrl).toBe(a.imageUrl);
  const jpeg = {
    name: "replacement.png",
    data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC",
  };
  const c = await tx((db) =>
    saveProductProfile(db, actor, p.id, {
      expectedVersion: 2,
      goodsType: "Trơn",
      image: jpeg,
    }),
  );
  expect(c.imageUrl).not.toBe(a.imageUrl);
  const d = await tx((db) =>
    saveProductProfile(db, actor, p.id, {
      expectedVersion: 3,
      goodsType: "Trơn",
      removeImage: true,
    }),
  );
  expect(d).toMatchObject({ imageUrl: null, imageName: null, version: 4 });
  const logs = (
    await pool.query(
      "SELECT details FROM activity_logs WHERE action='product-profile.update'",
    )
  ).rows;
  expect(logs).toHaveLength(4);
  expect(JSON.stringify(logs)).not.toContain(png);
});
it("concurrent/stale settings never overwrite another operator, unknown product is rejected", async () => {
  const { p } = await fixture();
  const results = await Promise.allSettled([
    tx((db) =>
      saveProductProfile(db, actor, p.id, {
        expectedVersion: 0,
        goodsType: "In",
        image,
      }),
    ),
    tx((db) =>
      saveProductProfile(db, actor, p.id, {
        expectedVersion: 0,
        goodsType: "Trơn",
      }),
    ),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  await expect(
    tx((db) =>
      saveProductProfile(db, actor, randomUUID(), {
        expectedVersion: 0,
        goodsType: null,
      }),
    ),
  ).rejects.toThrow("Không tìm thấy");
  expect((await listProductProfiles())[0].version).toBe(1);
});
it("new order snapshots default type but accepts explicit override/null and profile changes never rewrite old orders", async () => {
  const { p, v } = await fixture();
  await tx((db) =>
    saveProductProfile(db, actor, p.id, {
      expectedVersion: 0,
      goodsType: "In",
      image,
    }),
  );
  const first = await tx((db) => createOrder(db, actor, orderInput(v)));
  const second = await tx((db) =>
    createOrder(db, actor, {
      ...orderInput(v),
      items: [{ ...orderInput(v).items[0], goodsType: "Trơn" }],
    }),
  );
  const third = await tx((db) =>
    createOrder(db, actor, {
      ...orderInput(v),
      items: [{ ...orderInput(v).items[0], goodsType: null }],
    }),
  );
  await tx((db) =>
    saveProductProfile(db, actor, p.id, {
      expectedVersion: 1,
      goodsType: "Trơn",
    }),
  );
  expect((await loadOrder(pool, first.id)).items[0].goodsType).toBe("In");
  expect(second.items[0].goodsType).toBe("Trơn");
  expect(third.items[0].goodsType).toBeNull();
});
it("editing line type keeps received quantities and immutable receipts, with revision history", async () => {
  const { v } = await fixture();
  let o = await tx((db) => createOrder(db, actor, orderInput(v)));
  await tx((db) =>
    receive(db, actor, o.id, randomUUID(), {
      expectedVersion: 1,
      date: "2026-10-29",
      note: "Synthetic",
      lines: [{ itemId: o.items[0].id, qty: 25 }],
    }),
  );
  o = await loadOrder(pool, o.id);
  const receipts = (await pool.query("SELECT * FROM production_receipt_items"))
    .rows;
  const input = editInput(o);
  input.order.items[0].goodsType = "In";
  const edited = await tx((db) => editOrder(db, actor, o.id, input));
  expect(edited.items[0]).toMatchObject({
    goodsType: "In",
    qty: 100,
    received: 25,
  });
  expect(
    (await pool.query("SELECT * FROM production_receipt_items")).rows,
  ).toEqual(receipts);
  const rev = (
    await pool.query("SELECT before,after FROM production_order_revisions")
  ).rows[0];
  expect(rev.before.items[0].goodsType).toBeNull();
  expect(rev.after.items[0].goodsType).toBe("In");
  expect(
    (await pool.query("SELECT body FROM variants")).rows[0].body,
  ).toMatchObject({ stock: 30, inbound: 10 });
});
it("older editor payloads keep existing type including cancelled orders; new draft SKU inherits code profile", async () => {
  const { v, p } = await fixture();
  await tx((db) =>
    saveProductProfile(db, actor, p.id, {
      expectedVersion: 0,
      goodsType: "In",
    }),
  );
  let o = await tx((db) => createOrder(db, actor, orderInput(v)));
  await tx((db) =>
    orderAction(db, actor, o.id, "cancel", {
      expectedVersion: o.version,
      reason: "Synthetic cancel",
    }),
  );
  o = await loadOrder(pool, o.id);
  const input = editInput(o);
  delete input.order.items[0].goodsType;
  input.order.notes = "Metadata only";
  const saved = await tx((db) => editOrder(db, actor, o.id, input));
  expect(saved.items[0].goodsType).toBe("In");
  expect(saved.cancelled).toBe(true);
  const draft = randomUUID();
  const fresh = await tx((db) =>
    composeOrder(db, actor, {
      order: { ...orderInput(draft) },
      newSkus: [{ id: draft, sku: "MIU15", color: "Đen", size: "L" }],
    }),
  );
  expect(fresh.items[0]).toMatchObject({
    sku: "MIU15",
    size: "L",
    goodsType: "In",
  });
  expect(await listProductProfiles()).toHaveLength(1);
});
it("photo routes require login, viewer can read but cannot write, planner edits with CSRF and exports retain type", async () => {
  const { p, v } = await fixture();
  await tx((db) =>
    saveProductProfile(db, actor, p.id, {
      expectedVersion: 0,
      goodsType: "In",
      image,
    }),
  );
  const o = await tx((db) => createOrder(db, actor, orderInput(v)));
  const app = makeApp(),
    server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    expect(
      (await fetch(base + `/api/product-profiles/${p.id}/image`)).status,
    ).toBe(401);
    vi.stubEnv("DEV_AUTH", "true");
    const login = await fetch(base + "/auth/dev", {
        method: "POST",
        headers: { Origin: process.env.PUBLIC_URL! },
      }),
      cookie = login.headers.get("set-cookie")!.split(";")[0];
    const me = await (
      await fetch(base + "/api/me", { headers: { Cookie: cookie } })
    ).json();
    await pool.query("UPDATE users SET role='Viewer' WHERE id=$1", [
      me.user.id,
    ]);
    const photo = await fetch(base + `/api/product-profiles/${p.id}/image`, {
      headers: { Cookie: cookie },
    });
    expect(photo.status).toBe(200);
    expect(photo.headers.get("content-type")).toContain("image/png");
    expect(Buffer.from(await photo.arrayBuffer()).toString("base64")).toBe(png);
    const headers = {
      Cookie: cookie,
      Origin: process.env.PUBLIC_URL!,
      "Content-Type": "application/json",
      "X-CSRF-Token": me.csrf,
    };
    const payload = JSON.stringify({ expectedVersion: 1, goodsType: "Trơn" });
    expect(
      (
        await fetch(base + `/api/product-profiles/${p.id}`, {
          method: "PUT",
          headers,
          body: payload,
        })
      ).status,
    ).toBe(403);
    await pool.query("UPDATE users SET role='Production Planner' WHERE id=$1", [
      me.user.id,
    ]);
    expect(
      (
        await fetch(base + `/api/product-profiles/${p.id}`, {
          method: "PUT",
          headers: { ...headers, "X-CSRF-Token": "wrong" },
          body: payload,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(base + `/api/product-profiles/${p.id}`, {
          method: "PUT",
          headers,
          body: payload,
        })
      ).status,
    ).toBe(200);
    const csv = await (
      await fetch(base + `/api/export/orders?id=${o.id}`, {
        headers: { Cookie: cookie },
      })
    ).text();
    expect(csv).toContain("Loại hàng");
    expect(csv).toContain('"In"');
    expect((await loadOrder(pool, o.id)).items[0].goodsType).toBe("In");
  } finally {
    vi.unstubAllEnvs();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
