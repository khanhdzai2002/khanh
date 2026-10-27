import type { DB } from "./db";
import { listOrders } from "./service";
import {
  receivingFilters,
  receivingReport,
  type ReceivingEntry,
} from "../shared/receiving-report";
export async function loadReceivingReport(db: DB, raw: unknown) {
  const f = receivingFilters.parse(raw);
  const matched = (
    await db.query(
      `SELECT i.id,r.id AS "receiptId",NULL::uuid AS "draftId",u.name AS actor,to_char(r.date,'YYYY-MM-DD') AS date,COALESCE(r.supplier_snapshot,o.body->>'supplier') AS supplier,i.identity_snapshot->>'sku' AS sku,i.identity_snapshot->>'color' AS color,i.identity_snapshot->>'size' AS size,i.qty,'matched' AS classification,o.id AS "orderId",o.code,'' AS bag,r.note,'' AS reason,COALESCE(o.body->>'deletedAt','')<>'' AS archived FROM production_receipt_items i JOIN production_receipts r ON r.id=i.receipt_id JOIN production_orders o ON o.id=r.order_id JOIN users u ON u.id=r.actor_id WHERE ($1::date IS NULL OR r.date>=$1::date) AND ($2::date IS NULL OR r.date<=$2::date)`,
      [f.from || null, f.to || null],
    )
  ).rows;
  // Supplier is stored in the order body by loadOrder/createOrder. Keep the SQL
  // source independent of drafts so order-detail receipts and old history count once.
  const unmatched = (
    await db.query(
      `SELECT i.id,i.draft_id AS "receiptId",i.draft_id AS "draftId",u.name AS actor,to_char(i.date,'YYYY-MM-DD') AS date,i.supplier,i.sku,i.color,i.size,i.qty,'unmatched' AS classification,NULL::uuid AS "orderId",'' AS code,i.bag,i.note,i.reason,false AS archived FROM incoming_unmatched_items i JOIN users u ON u.id=i.actor_id WHERE ($1::date IS NULL OR i.date>=$1::date) AND ($2::date IS NULL OR i.date<=$2::date)`,
      [f.from || null, f.to || null],
    )
  ).rows;
  return receivingReport(
    [...matched, ...unmatched].map((r) => ({
      ...r,
      supplier: r.supplier || "",
      qty: Number(r.qty),
    })) as ReceivingEntry[],
    await listOrders(db),
    f,
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
      new Date(),
    ),
  );
}
export function receivingCsv(rows: ReceivingEntry[]) {
  const safe = (v: unknown) => {
    let s = String(v ?? "");
    if (/^\s*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  return (
    "\ufeff" +
    [
      [
        "Ngày nhận",
        "Phân loại",
        "Mã",
        "Màu",
        "Size",
        "Số lượng",
        "Nhà xưởng",
        "Lệnh",
        "Bao",
        "Người ghi nhận",
        "Ghi chú",
        "Lý do chưa đối chiếu",
      ],
      ...rows.map((r) => [
        r.date,
        r.classification === "matched"
          ? "Đã đối chiếu lệnh"
          : "Chưa đối chiếu lệnh",
        r.sku,
        r.color,
        r.size,
        r.qty,
        r.supplier,
        r.code,
        r.bag,
        r.actor,
        r.note,
        r.reason,
      ]),
    ]
      .map((r) => r.map(safe).join(","))
      .join("\r\n")
  );
}
