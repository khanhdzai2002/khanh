import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  it,
  expect,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { pool, transaction as tx } from "../server/db";
import { migrate } from "../server/migrate";
import {
  createIncoming,
  confirmIncoming,
  saveIncoming,
  incomingDraft,
} from "../server/incoming-goods";
import { saveSku, createOrder, loadOrder, receive } from "../server/service";
import {
  matchColor,
  normalizeLabel,
  type IncomingRow,
} from "../shared/incoming-goods";
import { makeApp } from "../server/app";
const actor = {
  id: randomUUID(),
  role: "Administrator",
  name: "Synthetic receiving admin",
};
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64",
);
const upload = () => ({
  images: [{ name: "synthetic-slip.png", data: png.toString("base64") }],
});
beforeAll(async () => {
  await migrate();
});
beforeEach(async () => {
  await pool.query("TRUNCATE users,products,suppliers,session CASCADE");
  await pool.query(
    "INSERT INTO users(id,tenant_key,open_id,name,role) VALUES($1,'test','synthetic-incoming',$2,'Administrator')",
    [actor.id, actor.name],
  );
  delete process.env.INCOMING_OCR_API_KEY;
  delete process.env.INCOMING_OCR_MODEL;
  delete process.env.INCOMING_OCR_PROVIDER;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.INCOMING_OCR_API_KEY;
  delete process.env.INCOMING_OCR_MODEL;
  delete process.env.INCOMING_OCR_PROVIDER;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_MODEL;
});
afterAll(async () => {
  await pool.end();
});
async function fixture(qty = 100) {
  const existing = (
    await pool.query(
      "SELECT id FROM variants WHERE body->>'sku'='MIU37' AND size='S' LIMIT 1",
    )
  ).rows[0];
  const variantId =
    existing?.id ||
    (await tx((db) =>
      saveSku(db, actor, {
        sku: "MIU37",
        color: "Cam cháy (phối đen)",
        size: "S",
        stock: 30,
        inbound: 10,
      }),
    ));
  const order = await tx((db) =>
    createOrder(db, actor, {
      time: "2026-10-26T10:00:00+07:00",
      supplier: "Synthetic",
      delivery: "2026-10-28",
      requestedBy: actor.name,
      notes: "",
      status: "Đang sản xuất",
      items: [{ variantId, qty, priority: "THƯỜNG" }],
    }),
  );
  return { variantId, order };
}
const row = (
  f: Awaited<ReturnType<typeof fixture>>,
  qty = 150,
): IncomingRow => ({
  id: randomUUID(),
  sku: "miu37",
  color: "Cam",
  bag: "1",
  size: "S",
  qty,
  variantId: f.variantId,
  orderId: f.order.id,
  remember: true,
});
const payload = (rows: IncomingRow[], orders: any[]) => ({
  expectedVersion: 1,
  checked: true,
  form: { date: "2026-10-26", note: "Synthetic receipt", rows },
  orders: orders.map((o) => ({ id: o.id, version: o.version })),
});
it("normalizes Vietnamese labels; matches raw colors within SKU, exact first, ambiguous never guesses", () => {
  const variants = [
    { sku: "MIU37", color: "Cam cháy (phối đen)" },
    { sku: "MIU37", color: "Trắng (Phối đỏ)" },
    { sku: "OTHER", color: "Cam" },
  ] as any;
  expect(normalizeLabel("ĐEN")).toBe("den");
  expect(
    matchColor("MIU37", "CHƯA RÕ", variants, [
      { sku: "MIU37", raw_color: "chua ro", color: "Cam cháy (phối đen)" },
    ]).color,
  ).toBe("");
  expect(matchColor("MIU37", "Đen", variants, []).color).toBe("");
  expect(matchColor("MIU37", "Màu cam", variants, []).color).toBe(
    "Cam cháy (phối đen)",
  );
  expect(matchColor("miu37", "Cam", variants, []).color).toBe(
    "Cam cháy (phối đen)",
  );
  expect(matchColor("MIU37", "Trắng đỏ", variants, []).color).toBe(
    "Trắng (Phối đỏ)",
  );
  expect(matchColor("UNKNOWN", "Cam", variants, []).color).toBe("");
  expect(
    matchColor(
      "MIU37",
      "Cam",
      [...variants, { sku: "MIU37", color: "Cam nhạt" }] as any,
      [],
    ).color,
  ).toBe("");
  expect(
    matchColor("OTHER", "Cam", variants, [
      { sku: "MIU37", raw_color: "cam", color: "Cam cháy (phối đen)" },
    ]).color,
  ).toBe("Cam");
});
it("stores draft images in database without external calls or business changes", async () => {
  const spy = vi.fn();
  vi.stubGlobal("fetch", spy);
  const d = await tx((db) => createIncoming(db, actor, upload()));
  expect((await incomingDraft(pool, actor, d.id)).state).toBe("draft");
  expect(
    (await pool.query("SELECT bytes FROM incoming_goods_images")).rows[0].bytes,
  ).toEqual(png);
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM production_receipts"))
      .rows[0].n,
  ).toBe(0);
  expect(spy).not.toHaveBeenCalled();
});
it("validates image content, file count and repeated photos", async () => {
  await expect(
    tx((db) =>
      createIncoming(db, actor, {
        images: [
          {
            name: "fake.jpg",
            data: Buffer.from("not an image").toString("base64"),
          },
        ],
      }),
    ),
  ).rejects.toThrow("Chỉ nhận ảnh");
  await expect(
    tx((db) =>
      createIncoming(db, actor, {
        images: [...upload().images, ...upload().images],
      }),
    ),
  ).rejects.toThrow("trùng");
  await expect(
    tx((db) =>
      createIncoming(db, actor, { images: Array(5).fill(upload().images[0]) }),
    ),
  ).rejects.toThrow();
});
it("manual draft -> preview save with version -> no receipts before explicit confirmation", async () => {
  const f = await fixture();
  const d = await tx((db) => createIncoming(db, actor, { images: [] }));
  const form = payload([row(f)], [f.order]).form;
  expect(
    await tx((db) =>
      saveIncoming(db, actor, d.id, { expectedVersion: 1, form }),
    ),
  ).toEqual({ version: 2 });
  await expect(
    tx((db) => saveIncoming(db, actor, d.id, { expectedVersion: 1, form })),
  ).rejects.toThrow("thay đổi");
  expect((await pool.query("SELECT * FROM production_receipts")).rowCount).toBe(
    0,
  );
});
it("receives above ordered quantity, keeps actual stock, stores learned rule, confirms once under concurrent retries", async () => {
  const f = await fixture(),
    d = await tx((db) => createIncoming(db, actor, upload())),
    p = payload([row(f)], [f.order]);
  const [a, b] = await Promise.all([
    tx((db) => confirmIncoming(db, actor, d.id, p)),
    tx((db) => confirmIncoming(db, actor, d.id, p)),
  ]);
  expect(a).toEqual(b);
  expect((await loadOrder(pool, f.order.id)).items[0]).toMatchObject({
    qty: 100,
    received: 150,
  });
  expect((await pool.query("SELECT * FROM production_receipts")).rowCount).toBe(
    1,
  );
  expect(
    (await pool.query("SELECT body FROM variants WHERE id=$1", [f.variantId]))
      .rows[0].body,
  ).toMatchObject({ stock: 30, inbound: 10 });
  expect(
    (await pool.query("SELECT raw_color,color FROM incoming_color_aliases"))
      .rows,
  ).toEqual([{ raw_color: "cam", color: "Cam cháy (phối đen)" }]);
  await expect(
    tx((db) =>
      confirmIncoming(db, actor, d.id, {
        ...p,
        form: { ...p.form, note: "changed" },
      }),
    ),
  ).rejects.toThrow("nội dung khác");
  await expect(
    tx((db) =>
      saveIncoming(db, actor, d.id, { expectedVersion: 2, form: p.form }),
    ),
  ).rejects.toThrow("đã được xác nhận");
});
it("blocks image reused by another draft and new upload after confirmation", async () => {
  const f = await fixture(),
    a = await tx((db) => createIncoming(db, actor, upload())),
    b = await tx((db) => createIncoming(db, actor, upload()));
  await tx((db) =>
    confirmIncoming(db, actor, a.id, payload([row(f)], [f.order])),
  );
  const updated = await loadOrder(pool, f.order.id);
  await expect(
    tx((db) =>
      confirmIncoming(
        db,
        actor,
        b.id,
        payload([row({ ...f, order: updated })], [updated]),
      ),
    ),
  ).rejects.toThrow("Ảnh đã được ghi nhận");
  await expect(tx((db) => createIncoming(db, actor, upload()))).rejects.toThrow(
    "Ảnh này đã được ghi nhận",
  );
  expect((await pool.query("SELECT * FROM production_receipts")).rowCount).toBe(
    1,
  );
});
it("splits one SKU across two orders; repeated bag rows aggregate per order item", async () => {
  const f = await fixture(100),
    g = await fixture(200),
    d = await tx((db) => createIncoming(db, actor, { images: [] }));
  const result = await tx((db) =>
    confirmIncoming(
      db,
      actor,
      d.id,
      payload([row(f, 30), row(f, 20), row(g, 70)], [f.order, g.order]),
    ),
  );
  expect(result.received).toBe(120);
  expect(result.receipts).toHaveLength(2);
  expect((await loadOrder(pool, f.order.id)).items[0].received).toBe(50);
  expect((await loadOrder(pool, g.order.id)).items[0].received).toBe(70);
  expect(
    (await pool.query("SELECT * FROM production_receipt_items")).rowCount,
  ).toBe(2);
});
it("stale order in batch rolls back every receipt, alias and draft state", async () => {
  const f = await fixture(),
    g = await fixture(),
    d = await tx((db) => createIncoming(db, actor, { images: [] }));
  const p = payload([row(f, 10), row(g, 20)], [f.order, g.order]);
  await tx((db) =>
    receive(db, actor, g.order.id, randomUUID(), {
      expectedVersion: g.order.version,
      date: "2026-10-26",
      note: "Concurrent",
      lines: [{ itemId: g.order.items[0].id, qty: 1 }],
    }),
  );
  await expect(
    tx((db) => confirmIncoming(db, actor, d.id, p)),
  ).rejects.toThrow();
  expect((await loadOrder(pool, f.order.id)).items[0].received).toBe(0);
  expect((await pool.query("SELECT * FROM production_receipts")).rowCount).toBe(
    1,
  );
  expect(
    (await pool.query("SELECT * FROM incoming_color_aliases")).rowCount,
  ).toBe(0);
  expect((await incomingDraft(pool, actor, d.id)).state).toBe("draft");
});
it("requires reviewed quantities, valid active variant/size, orders and explicit confirmation", async () => {
  const f = await fixture(),
    d = await tx((db) => createIncoming(db, actor, { images: [] })),
    p = payload([row(f)], [f.order]);
  for (const r of [
    { ...row(f), qty: null },
    { ...row(f), orderId: null },
    { ...row(f), size: "M" },
    { ...row(f), sku: "WRONG" },
    { ...row(f), variantId: randomUUID() },
    { ...row(f), qty: -1 },
    { ...row(f), size: "XS" },
    { ...row(f), qty: 0 },
  ])
    await expect(
      tx((db) =>
        confirmIncoming(db, actor, d.id, {
          ...p,
          form: { ...p.form, rows: [r] },
        }),
      ),
    ).rejects.toThrow();
  await expect(
    tx((db) => confirmIncoming(db, actor, d.id, { ...p, checked: false })),
  ).rejects.toThrow();
  expect((await pool.query("SELECT * FROM production_receipts")).rowCount).toBe(
    0,
  );
});
it("does not overwrite existing learned alias; conflict rolls back receipt", async () => {
  const f = await fixture(),
    d = await tx((db) => createIncoming(db, actor, { images: [] }));
  await pool.query(
    "INSERT INTO incoming_color_aliases SELECT product_id,'cam','Different color',$2 FROM variants WHERE id=$1",
    [f.variantId, actor.id],
  );
  await expect(
    tx((db) => confirmIncoming(db, actor, d.id, payload([row(f)], [f.order]))),
  ).rejects.toThrow("Quy ước màu");
  expect((await pool.query("SELECT * FROM production_receipts")).rowCount).toBe(
    0,
  );
  const r = row(f);
  r.remember = false;
  await tx((db) => confirmIncoming(db, actor, d.id, payload([r], [f.order])));
  expect(
    (await pool.query("SELECT color FROM incoming_color_aliases")).rows[0]
      .color,
  ).toBe("Different color");
});
it("blocks disabled/Viewer and other owner, even direct confirmation calls", async () => {
  const f = await fixture(),
    d = await tx((db) => createIncoming(db, actor, { images: [] }));
  await pool.query("UPDATE users SET role='Viewer' WHERE id=$1", [actor.id]);
  await expect(
    tx((db) => confirmIncoming(db, actor, d.id, payload([row(f)], [f.order]))),
  ).rejects.toThrow("quyền");
  await expect(
    incomingDraft(
      pool,
      { ...actor, id: randomUUID(), role: "Warehouse Operator" },
      d.id,
    ),
  ).rejects.toThrow("Không tìm thấy");
});
it("HTTP: auth, CSRF, role, source image ownership, retired OCR never sends images, and source evidence", async () => {
  const server = makeApp().listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const realFetch = globalThis.fetch;
  try {
    expect((await realFetch(base + "/api/incoming/status")).status).toBe(401);
    const login = await realFetch(base + "/auth/dev", {
      method: "POST",
      headers: { Origin: process.env.PUBLIC_URL! },
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    await login.arrayBuffer();
    const me = await (
      await realFetch(base + "/api/me", { headers: { Cookie: cookie } })
    ).json();
    const headers = {
      Cookie: cookie,
      Origin: process.env.PUBLIC_URL!,
      "Content-Type": "application/json",
      "X-CSRF-Token": me.csrf,
    };
    const post = (path: string, body: any, extra = {}) =>
      realFetch(base + path, {
        method: "POST",
        headers: { ...headers, ...extra },
        body: JSON.stringify(body),
      });
    expect(
      (await post("/api/incoming", upload(), { "X-CSRF-Token": "wrong" }))
        .status,
    ).toBe(403);
    await pool.query("UPDATE users SET role='Viewer' WHERE id=$1", [
      me.user.id,
    ]);
    expect((await post("/api/incoming", upload())).status).toBe(403);
    await pool.query("UPDATE users SET role='Warehouse Operator' WHERE id=$1", [
      me.user.id,
    ]);
    const created = await post("/api/incoming", upload());
    expect(created.status).toBe(201);
    const d = await created.json();
    const photo = await (
      await realFetch(base + "/api/incoming/" + d.id, { headers })
    ).json();
    const image = await realFetch(
      base + `/api/incoming/${d.id}/images/${photo.images[0].id}`,
      { headers },
    );
    expect(image.headers.get("content-type")).toContain("image/png");
    expect(Buffer.from(await image.arrayBuffer())).toEqual(png);
    process.env.INCOMING_OCR_API_KEY = "synthetic-disabled-key";
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    const retired = await post(`/api/incoming/${d.id}/read`, {
      expectedVersion: 1,
      consent: true,
    });
    expect(retired.status).toBe(410);
    expect(spy).not.toHaveBeenCalled();
    expect(
      (await realFetch(base + "/api/incoming/status", { headers })).status,
    ).toBe(200);
    expect(
      (await pool.query("SELECT * FROM production_receipts")).rowCount,
    ).toBe(0);
    const f = await fixture();
    const allocationRequest = {
      expectedVersion: 1,
      form: {
        date: "2026-10-27",
        note: "HTTP preview",
        rows: [
          {
            ...row(f, 100),
            color: f.order.items[0].color,
            allocationMode: "auto",
          },
        ],
      },
    };
    expect(
      (
        await post(`/api/incoming/${d.id}/allocate`, allocationRequest, {
          "X-CSRF-Token": "wrong",
        })
      ).status,
    ).toBe(403);
    await pool.query("UPDATE users SET role='Viewer' WHERE id=$1", [
      me.user.id,
    ]);
    expect(
      (await post(`/api/incoming/${d.id}/allocate`, allocationRequest)).status,
    ).toBe(403);
    await pool.query("UPDATE users SET role='Warehouse Operator' WHERE id=$1", [
      me.user.id,
    ]);
    const allocationResponse = await post(
      `/api/incoming/${d.id}/allocate`,
      allocationRequest,
    );
    expect(allocationResponse.status).toBe(200);
    expect((await allocationResponse.json()).allocated).toBe(100);
    expect(
      (await pool.query("SELECT * FROM production_receipts")).rowCount,
    ).toBe(0);
    const source = await tx((db) => createIncoming(db, actor, upload()));
    await tx((db) =>
      confirmIncoming(db, actor, source.id, payload([row(f)], [f.order])),
    );
    const imageId = (
      await pool.query(
        "SELECT id FROM incoming_goods_images WHERE draft_id=$1",
        [source.id],
      )
    ).rows[0].id;
    // Another authorized employee can read evidence through the linked order,
    // but cannot read someone else's unconfirmed draft or unrelated order image.
    expect(
      (await realFetch(base + "/api/incoming/" + source.id, { headers }))
        .status,
    ).toBe(404);
    const attached = await realFetch(
      base + `/api/orders/${f.order.id}/incoming-images/${imageId}`,
      { headers },
    );
    expect(attached.status).toBe(200);
    expect(Buffer.from(await attached.arrayBuffer())).toEqual(png);
    const other = await fixture();
    expect(
      (
        await realFetch(
          base + `/api/orders/${other.order.id}/incoming-images/${imageId}`,
          { headers },
        )
      ).status,
    ).toBe(404);
    const hist = await (
      await realFetch(base + `/api/orders/${f.order.id}/history`, { headers })
    ).json();
    expect(hist.sources).toEqual([{ id: imageId, name: "synthetic-slip.png" }]);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
