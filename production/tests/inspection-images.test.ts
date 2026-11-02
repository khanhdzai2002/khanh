import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { pool, transaction as tx, type DB } from "../server/db";
import { migrate } from "../server/migrate";
import {
  createIncoming,
  confirmIncoming,
  incomingDraft,
} from "../server/incoming-goods";
import {
  appendInspectionImages,
  inspectionBundle,
  inspectionArchive,
  editInspectionMetadata,
} from "../server/inspection-images";
import { saveSku, createOrder, receive, loadOrder } from "../server/service";
import { makeApp } from "../server/app";
const actor = {
  id: randomUUID(),
  role: "Administrator",
  name: "Synthetic evidence admin",
};
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
  "base64",
);
const photo = (n = 0) => ({
  name: `synthetic-phieu-${n}.png`,
  data: Buffer.concat([png, Buffer.from(String(n))]).toString("base64"),
});
const upload = (n = 0, extra: any = {}) => ({
  images: [photo(n)],
  inspectionDate: "2026-10-27",
  category: "Phiếu kiểm hàng",
  note: "Kiểm xưởng",
  ...extra,
});
beforeAll(async () => {
  await migrate();
});
beforeEach(async () => {
  await pool.query("TRUNCATE users,products,suppliers,session CASCADE");
  await pool.query(
    "INSERT INTO users(id,tenant_key,open_id,name,role) VALUES($1,'test','evidence-admin',$2,'Administrator')",
    [actor.id, actor.name],
  );
});
afterAll(async () => {
  await pool.end();
});
async function fixture(db: DB = pool) {
  const v = await saveSku(db, actor, {
    sku: "SYNTHETIC-MIU37",
    color: "Ghi tây (Phối nâu)",
    size: "M",
    stock: 30,
    inbound: 10,
  });
  const order = await createOrder(db, actor, {
    time: "2026-10-23T10:00:00+07:00",
    supplier: "Synthetic Primtex",
    delivery: "2026-10-30",
    requestedBy: actor.name,
    notes: "",
    status: "Đang sản xuất",
    items: [{ variantId: v, qty: 150, priority: "THƯỜNG" }],
  });
  return { v, order };
}
async function confirmed() {
  const f = await tx((db) => fixture(db)),
    draft = await tx((db) => createIncoming(db, actor, { images: [] }));
  const body = {
    expectedVersion: 1,
    checked: true as const,
    orders: [{ id: f.order.id, version: f.order.version }],
    form: {
      date: "2026-10-27",
      supplier: f.order.supplier,
      note: "Synthetic",
      rows: [
        {
          id: randomUUID(),
          sku: "SYNTHETIC-MIU37",
          color: "Ghi tây (Phối nâu)",
          size: "M",
          qty: 100,
          variantId: f.v,
          orderId: f.order.id,
        },
      ],
    },
  };
  const result = await tx((db) => confirmIncoming(db, actor, draft.id, body));
  return { ...f, draft, body, result };
}
it("adds images to existing drafts and confirmed slips without changing form, version, receipts, stock or retry results", async () => {
  const f = await confirmed(),
    target = { kind: "draft" as const, id: f.draft.id };
  const before = await incomingDraft(pool, actor, target.id),
    order = await loadOrder(pool, f.order.id);
  const receipts = (await pool.query("SELECT * FROM production_receipts")).rows,
    stock = (await pool.query("SELECT * FROM inventory_snapshots")).rows;
  const a = await tx((db) =>
    appendInspectionImages(db, actor, target, upload()),
  );
  expect(a.added).toBe(1);
  expect(a.images[0]).toMatchObject({
    inspectionDate: "2026-10-27",
    source: "manual",
    dateSource: "classified",
    canWrite: true,
    products: ["SYNTHETIC-MIU37"],
  });
  expect(a.images[0].orders).toEqual([{ id: f.order.id, code: f.order.code }]);
  expect(await incomingDraft(pool, actor, target.id)).toEqual(before);
  expect(await loadOrder(pool, f.order.id)).toEqual(order);
  expect((await pool.query("SELECT * FROM production_receipts")).rows).toEqual(
    receipts,
  );
  expect((await pool.query("SELECT * FROM inventory_snapshots")).rows).toEqual(
    stock,
  );
  expect(
    await tx((db) => confirmIncoming(db, actor, target.id, f.body)),
  ).toEqual(f.result);
  const raw = (
    await pool.query("SELECT bytes FROM incoming_goods_images WHERE id=$1", [
      a.images[0].id,
    ])
  ).rows[0].bytes;
  expect(raw.toString("base64")).toBe(photo().data);
});
it("resolves receipt attachments to original incoming slip and supports direct manual receipts", async () => {
  const f = await confirmed();
  const linked = await tx((db) =>
    appendInspectionImages(
      db,
      actor,
      { kind: "receipt", id: f.result.receipts[0].receiptId },
      upload(),
    ),
  );
  expect(linked.target).toEqual({ kind: "draft", id: f.draft.id });
  const latest = await loadOrder(pool, f.order.id);
  const direct = await tx((db) =>
    receive(db, actor, f.order.id, randomUUID(), {
      expectedVersion: latest.version,
      date: "2026-10-29",
      note: "Direct",
      lines: [{ itemId: f.order.items[0].id, qty: 10 }],
    }),
  );
  const attached = await tx((db) =>
    appendInspectionImages(
      db,
      actor,
      { kind: "receipt", id: direct.receiptId },
      upload(1),
    ),
  );
  expect(attached.images[0]).toMatchObject({
    source: "direct",
    receiptDate: "2026-10-29",
    orders: [{ id: f.order.id, code: f.order.code }],
  });
  expect((await inspectionArchive(pool, actor, {})).total).toBe(2);
});
it("accepts JSON evidence and uses immutable source inspection date for legacy photos", async () => {
  const d = await tx((db) => createIncoming(db, actor, { images: [photo()] }));
  await pool.query(
    `INSERT INTO incoming_json_sources(document_key,document_id,draft_id,actor_id,source_hash,source,decisions,original_total) VALUES('synthetic','SYNTHETIC-JSON-PHIEU',$1,$2,'hash',$3,'{}',1)`,
    [
      d.id,
      actor.id,
      JSON.stringify({
        document: {
          inspection_date: "2026-09-21",
          receipt_date: "2026-09-20",
          supplier: "JSON Factory",
        },
      }),
    ],
  );
  const before = (await pool.query("SELECT * FROM incoming_json_sources")).rows;
  const legacy = (
    await inspectionBundle(pool, actor, { kind: "draft", id: d.id })
  ).images[0];
  expect(legacy).toMatchObject({
    source: "json",
    inspectionDate: "2026-09-21",
    dateSource: "json",
  });
  const added = await tx((db) =>
    appendInspectionImages(
      db,
      actor,
      { kind: "draft", id: d.id },
      upload(1, { inspectionDate: "2026-09-22" }),
    ),
  );
  expect(added.images).toHaveLength(2);
  expect(
    (
      await inspectionArchive(pool, actor, {
        source: "json",
        search: "SYNTHETIC-JSON-PHIEU",
      })
    ).total,
  ).toBe(2);
  expect(
    (await pool.query("SELECT * FROM incoming_json_sources")).rows,
  ).toEqual(before);
});
it("concurrent retries skip existing photos without new images, metadata or duplicate movements", async () => {
  const d = await tx((db) => createIncoming(db, actor, { images: [] })),
    target = { kind: "draft" as const, id: d.id };
  const results = await Promise.all([
    tx((db) => appendInspectionImages(db, actor, target, upload())),
    tx((db) => appendInspectionImages(db, actor, target, upload())),
  ]);
  expect(results.map((r) => r.added).sort()).toEqual([0, 1]);
  expect(
    (await pool.query("SELECT * FROM incoming_goods_images")).rowCount,
  ).toBe(1);
  expect(
    (await pool.query("SELECT * FROM inspection_image_metadata")).rowCount,
  ).toBe(1);
  expect((await pool.query("SELECT * FROM production_receipts")).rowCount).toBe(
    0,
  );
  expect(
    (
      await pool.query(
        "SELECT * FROM activity_logs WHERE action='inspection.images.append'",
      )
    ).rowCount,
  ).toBe(1);
});
it("validates date, image bytes, count, batch size and parent limits atomically", async () => {
  const d = await tx((db) => createIncoming(db, actor, { images: [] })),
    target = { kind: "draft" as const, id: d.id };
  for (const bad of [
    { inspectionDate: "2026-02-30" },
    { images: [] },
    { images: [photo(), photo()] },
    {
      images: [
        photo(),
        { name: "bad.png", data: Buffer.from("notanimage").toString("base64") },
      ],
    },
    { images: [{ ...photo(), data: photo().data + "\n" }] },
    { images: Array.from({ length: 5 }, (_, i) => photo(i)) },
    {
      images: [
        {
          name: "large.png",
          data: Buffer.concat([png, Buffer.alloc(8 * 1024 * 1024)]).toString(
            "base64",
          ),
        },
      ],
    },
  ]) {
    await expect(
      tx((db) => appendInspectionImages(db, actor, target, upload(0, bad))),
    ).rejects.toThrow();
  }
  expect(
    (await pool.query("SELECT * FROM incoming_goods_images")).rowCount,
  ).toBe(0);
  for (let n = 0; n < 40; n += 4)
    await tx((db) =>
      appendInspectionImages(
        db,
        actor,
        target,
        upload(0, {
          images: Array.from({ length: 4 }, (_, i) => photo(n + i)),
        }),
      ),
    );
  await expect(
    tx((db) => appendInspectionImages(db, actor, target, upload(41))),
  ).rejects.toThrow("40 ảnh");
  expect((await inspectionBundle(pool, actor, target)).images).toHaveLength(40);
});
it("preserves duplicate-source protections for unconfirmed receiving after evidence uploads", async () => {
  const f = await confirmed();
  await tx((db) =>
    appendInspectionImages(
      db,
      actor,
      { kind: "draft", id: f.draft.id },
      upload(),
    ),
  );
  await expect(
    tx((db) => createIncoming(db, actor, { images: [photo()] })),
  ).rejects.toThrow("đã được ghi nhận");
  const d = await tx((db) => createIncoming(db, actor, { images: [] }));
  await expect(
    tx((db) =>
      appendInspectionImages(db, actor, { kind: "draft", id: d.id }, upload()),
    ),
  ).rejects.toThrow("đã thuộc phiếu");
  // A source image may be referenced on another confirmed receipt as extra evidence, without receiving again.
  const latest = await loadOrder(pool, f.order.id),
    direct = await tx((db) =>
      receive(db, actor, f.order.id, randomUUID(), {
        expectedVersion: latest.version,
        date: "2026-10-28",
        note: "",
        lines: [{ itemId: f.order.items[0].id, qty: 1 }],
      }),
    );
  expect(
    (
      await tx((db) =>
        appendInspectionImages(
          db,
          actor,
          { kind: "receipt", id: direct.receiptId },
          upload(),
        ),
      )
    ).added,
  ).toBe(1);
});
it("edits only classification with optimistic concurrency, audited history and original bytes intact", async () => {
  const d = await tx((db) => createIncoming(db, actor, { images: [photo()] })),
    target = { kind: "draft" as const, id: d.id };
  const old = (await inspectionBundle(pool, actor, target)).images[0];
  const saved = await tx((db) =>
    editInspectionMetadata(db, actor, old.id, {
      expectedVersion: old.version,
      inspectionDate: "2026-10-01",
      category: "Biên bản đối soát",
      note: "Đã kiểm",
    }),
  );
  expect(saved).toMatchObject({
    inspectionDate: "2026-10-01",
    category: "Biên bản đối soát",
    note: "Đã kiểm",
    version: old.version + 1,
  });
  expect(saved.uploadedAt).toBe(old.uploadedAt);
  await expect(
    tx((db) =>
      editInspectionMetadata(db, actor, old.id, {
        expectedVersion: old.version,
        inspectionDate: "2026-10-02",
        category: "Khác",
        note: "",
      }),
    ),
  ).rejects.toThrow("đã thay đổi");
  expect(
    (
      await pool.query("SELECT bytes FROM incoming_goods_images WHERE id=$1", [
        old.id,
      ])
    ).rows[0].bytes.toString("base64"),
  ).toBe(photo().data);
  expect(
    (
      await pool.query(
        "SELECT * FROM activity_logs WHERE action='inspection.image.classify'",
      )
    ).rowCount,
  ).toBe(1);
  await expect(
    pool.query("DELETE FROM incoming_goods_images WHERE id=$1", [old.id]),
  ).rejects.toThrow("append-only");
  await expect(
    pool.query("UPDATE incoming_goods_images SET name='changed' WHERE id=$1", [
      old.id,
    ]),
  ).rejects.toThrow("append-only");
});
it("filters by time, source, supplier, product, color and order; paginates without truncating totals", async () => {
  const f = await confirmed(),
    target = { kind: "draft" as const, id: f.draft.id };
  await tx((db) =>
    appendInspectionImages(
      db,
      actor,
      target,
      upload(1, { inspectionDate: "2026-09-30" }),
    ),
  );
  await tx((db) =>
    appendInspectionImages(
      db,
      actor,
      target,
      upload(2, { inspectionDate: "2026-10-01" }),
    ),
  );
  await tx((db) =>
    appendInspectionImages(
      db,
      actor,
      target,
      upload(3, { inspectionDate: "2026-10-02", category: "Phiếu giao hàng" }),
    ),
  );
  const all = await inspectionArchive(pool, actor, { pageSize: 1, page: 2 });
  expect(all.total).toBe(3);
  expect(all.images).toHaveLength(1);
  expect(all.slips).toBe(1);
  expect(all.months).toEqual([
    { month: "2026-10", count: 2 },
    { month: "2026-09", count: 1 },
  ]);
  expect(
    (await inspectionArchive(pool, actor, { month: "2026-10" })).total,
  ).toBe(2);
  expect(
    (
      await inspectionArchive(pool, actor, {
        from: "2026-09-30",
        to: "2026-10-01",
      })
    ).total,
  ).toBe(2);
  expect(
    (await inspectionArchive(pool, actor, { search: "ghi tay" })).total,
  ).toBe(3);
  expect(
    (
      await inspectionArchive(pool, actor, {
        search: f.order.code,
        supplier: "primtex",
      })
    ).total,
  ).toBe(3);
  expect(
    (
      await inspectionArchive(pool, actor, {
        search: "MIU37",
        category: "Phiếu giao hàng",
        state: "confirmed",
        source: "manual",
      })
    ).total,
  ).toBe(1);
  await expect(
    inspectionArchive(pool, actor, { from: "2026-10-01", to: "2026-09-30" }),
  ).rejects.toThrow();
});
it("restricts drafts and writes to owner/admin, lets read roles see confirmed evidence", async () => {
  const f = await confirmed();
  await tx((db) =>
    appendInspectionImages(
      db,
      actor,
      { kind: "draft", id: f.draft.id },
      upload(),
    ),
  );
  const d = await tx((db) => createIncoming(db, actor, { images: [photo(1)] }));
  const viewer = { id: randomUUID(), name: "Viewer", role: "Viewer" },
    warehouse = {
      id: randomUUID(),
      name: "Other warehouse",
      role: "Warehouse Operator",
    };
  for (const u of [viewer, warehouse])
    await pool.query(
      "INSERT INTO users(id,tenant_key,open_id,name,role) VALUES($1::uuid,'test',$1::text,$2,$3)",
      [u.id, u.name, u.role],
    );
  expect((await inspectionArchive(pool, viewer, {})).total).toBe(1);
  expect(
    (await inspectionBundle(pool, viewer, { kind: "draft", id: f.draft.id }))
      .images[0].canWrite,
  ).toBe(false);
  await expect(
    inspectionBundle(pool, viewer, { kind: "draft", id: d.id }),
  ).rejects.toThrow("Không tìm thấy");
  await expect(
    tx((db) =>
      appendInspectionImages(
        db,
        warehouse,
        { kind: "draft", id: f.draft.id },
        upload(2),
      ),
    ),
  ).rejects.toThrow("Chỉ người lập");
  await expect(
    tx((db) =>
      appendInspectionImages(
        db,
        viewer,
        { kind: "draft", id: f.draft.id },
        upload(2),
      ),
    ),
  ).rejects.toThrow("Chỉ người lập");
  await pool.query("UPDATE users SET disabled=true WHERE id=$1", [actor.id]);
  await expect(
    tx((db) =>
      appendInspectionImages(
        db,
        actor,
        { kind: "draft", id: f.draft.id },
        upload(2),
      ),
    ),
  ).rejects.toThrow("Chỉ người lập");
});
it("migration preserves legacy records byte-for-byte and records unknown photo upload time honestly", async () => {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("CREATE SCHEMA synthetic_pre_evidence");
    await db.query("SET LOCAL search_path=synthetic_pre_evidence");
    const names = (await readdir(new URL("../migrations/", import.meta.url)))
      .filter((n) => n.endsWith(".sql"))
      .sort();
    for (const name of names.filter((n) => n < "015"))
      await db.query(
        await readFile(
          new URL("../migrations/" + name, import.meta.url),
          "utf8",
        ),
      );
    await db.query(
      "INSERT INTO users(id,tenant_key,open_id,name,role) VALUES($1,'test','legacy',$2,'Administrator')",
      [actor.id, actor.name],
    );
    const f = await fixture(db),
      r = await receive(db, actor, f.order.id, randomUUID(), {
        expectedVersion: 1,
        date: "2026-09-10",
        note: "Legacy receipt",
        lines: [{ itemId: f.order.items[0].id, qty: 10 }],
      });
    const d = randomUUID(),
      imageId = randomUUID();
    await db.query(
      "INSERT INTO incoming_goods_drafts(id,actor_id,form,state,result) VALUES($1,$2,$3,'confirmed',$4)",
      [
        d,
        actor.id,
        JSON.stringify({ date: "2026-09-10", note: "original", rows: [] }),
        JSON.stringify({ receipts: [r], received: 10 }),
      ],
    );
    await db.query(
      "INSERT INTO incoming_goods_images VALUES($1,$2,'legacy.png','image/png','legacyhash',$3)",
      [imageId, d, png],
    );
    const snapshot = async () => ({
      draft: (await db.query("SELECT * FROM incoming_goods_drafts")).rows,
      receipts: (await db.query("SELECT * FROM production_receipts")).rows,
      items: (await db.query("SELECT * FROM production_receipt_items")).rows,
      order: await loadOrder(db, f.order.id),
      stock: (await db.query("SELECT * FROM inventory_snapshots")).rows,
      image: (
        await db.query(
          "SELECT id,draft_id,name,mime,sha256,bytes FROM incoming_goods_images",
        )
      ).rows,
    });
    const before = await snapshot();
    await db.query(
      await readFile(
        new URL("../migrations/015_inspection_archive.sql", import.meta.url),
        "utf8",
      ),
    );
    expect(await snapshot()).toEqual(before);
    const old = (await inspectionBundle(db, actor, { kind: "draft", id: d }))
      .images[0];
    expect(old).toMatchObject({
      uploadedAt: null,
      version: 0,
      dateSource: "receipt",
      inspectionDate: "2026-09-10",
    });
    const classified = await editInspectionMetadata(db, actor, imageId, {
      expectedVersion: 0,
      inspectionDate: "2026-09-11",
      category: "Phiếu kiểm hàng",
      note: "Legacy classification",
    });
    expect(classified.uploadedAt).toBeNull();
    expect(await snapshot()).toEqual(before);
  } finally {
    await db.query("ROLLBACK");
    db.release();
  }
});
it("HTTP authenticates archive, protects CSRF and roles, serves original bytes with safe download and old order links", async () => {
  const server = makeApp().listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    expect((await fetch(base + "/api/inspection-archive")).status).toBe(401);
    const login = await fetch(base + "/auth/dev", {
        method: "POST",
        headers: { Origin: process.env.PUBLIC_URL! },
      }),
      cookie = login.headers.get("set-cookie")!.split(";")[0];
    await login.arrayBuffer();
    const me = await (
        await fetch(base + "/api/me", { headers: { Cookie: cookie } })
      ).json(),
      headers = {
        Cookie: cookie,
        Origin: process.env.PUBLIC_URL!,
        "Content-Type": "application/json",
        "X-CSRF-Token": me.csrf,
      };
    const owner = { ...actor, id: me.user.id };
    const d = await tx((db) => createIncoming(db, owner, { images: [] }));
    const url = base + `/api/inspection-archive/targets/draft/${d.id}/images`;
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: { ...headers, "X-CSRF-Token": "bad" },
          body: JSON.stringify(upload()),
        })
      ).status,
    ).toBe(403);
    const added = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(upload()),
    });
    expect(added.status).toBe(201);
    const value = await added.json(),
      id = value.images[0].id;
    const raw = await fetch(
      base + `/api/inspection-archive/images/${id}?download=1`,
      { headers },
    );
    expect(raw.status).toBe(200);
    expect(raw.headers.get("content-disposition")).toContain("attachment;");
    expect(Buffer.from(await raw.arrayBuffer()).toString("base64")).toBe(
      photo().data,
    );
    expect(
      (await fetch(base + `/api/incoming/${d.id}/images/${id}`, { headers }))
        .status,
    ).toBe(200);
    await pool.query("UPDATE users SET role='Viewer' WHERE id=$1", [
      me.user.id,
    ]);
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(upload(1)),
        })
      ).status,
    ).toBe(403);
    expect(
      (await fetch(base + "/api/inspection-archive", { headers })).status,
    ).toBe(200);
  } finally {
    await new Promise<void>((r, e) => server.close((x) => (x ? e(x) : r())));
  }
});
