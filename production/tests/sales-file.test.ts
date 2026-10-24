import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { readWorkbookRows } from "../server/xlsx-reader";
import { readFileRows, inspectSales } from "../server/imports";
import { describeSalesFile } from "../shared/sales-file";
import { parseSalesRow } from "../shared/sales";
import { salesMatrix } from "../shared/sales-matrix";
import {
  fragmentedWorkbook,
  syntheticHeaders,
} from "./fixtures/tiktok-fragments";
it("đọc Excel có từng ô trong các row lặp cùng số như file mẫu, không mất tiêu đề", async () => {
  const bytes = await fragmentedWorkbook();
  const result = await readWorkbookRows(bytes);
  expect(Object.keys(result.rows[0])).toEqual(syntheticHeaders);
  expect(result.source).toMatchObject({ sheet: "OrderSKUList", headerRow: 1 });
  expect(result.source.repeatedRows).toBeGreaterThan(0);
  const description = describeSalesFile(
    "Tất cả đơn hàng-2026-10-15-10_41 (1).xlsx",
    result.rows,
  );
  expect(description).toMatchObject({
    dataRows: 4,
    periodStart: "2026-10-14",
    periodEnd: "2026-10-15",
    exportedAt: "2026-10-15T03:41:00.000Z",
    stableKeys: true,
  });
  const rows = result.rows.slice(1).map((r, i) => parseSalesRow(r, String(i)));
  expect(rows.map((r) => r.kind)).toEqual([
    "single",
    "single",
    "excluded",
    "combo",
  ]);
  expect(
    rows.filter((r) => r.kind === "single").reduce((n, r) => n + r.qty, 0),
  ).toBe(30);
});
it("ô bị lặp với hai giá trị khác nhau bị chặn thay vì âm thầm ghi đè", async () => {
  await expect(
    readWorkbookRows(await fragmentedWorkbook({ conflict: true })),
  ).rejects.toThrow("hai giá trị");
});
it("xlsx chuẩn, shared strings/rich text và ngày kiểu số vẫn đọc đúng", async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Orders");
  sheet.addRow(syntheticHeaders);
  sheet.addRow([
    "SYNTHETIC-EXCEL",
    "Completed",
    "",
    "SKU-M",
    "MIU66",
    { richText: [{ text: "Áo " }, { text: "MIU66" }] },
    "Trắng phối đen, M",
    12,
    0,
    new Date("2026-10-14T03:00:00Z"),
  ]);
  sheet.getCell("J2").numFmt = "dd/mm/yyyy hh:mm:ss";
  const rows = await readFileRows(
    "synthetic.xlsx",
    Buffer.from(await wb.xlsx.writeBuffer()),
  );
  expect(rows[0]["Product Name"]).toBe("Áo MIU66");
  expect(rows[0]["Created Time"]).toBe("2026-10-14T03:00:00.000Z");
  expect(parseSalesRow(rows[0], "synthetic")).toMatchObject({
    date: "2026-10-14",
    qty: 12,
    kind: "single",
  });
});
it("tìm header sau các dòng mô tả và đúng worksheet, không coi trang bìa là dữ liệu", async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Bìa").addRow(["SYNTHETIC report"]);
  const s = wb.addWorksheet("Data");
  s.addRow(["SYNTHETIC thông tin"]);
  s.addRow(syntheticHeaders);
  s.addRow([
    "SYNTHETIC",
    "Completed",
    "",
    "SKU",
    "MIU66",
    "Áo MIU66",
    "Đen, M",
    1,
    0,
    "2026-10-14",
  ]);
  const result = await readWorkbookRows(
    Buffer.from(await wb.xlsx.writeBuffer()),
  );
  expect(result.source).toMatchObject({ sheet: "Data", headerRow: 2 });
  expect(result.rows).toHaveLength(1);
});
it("CSV cũng nhận diện kỳ tự động, thiếu cột được giải thích rõ, không đoán thời điểm xuất", async () => {
  const csv =
    syntheticHeaders.join(",") +
    '\nSYNTHETIC,Completed,,SKU,MIU66,Áo MIU66,"Đen, M",1,0,2026-10-14';
  expect(await inspectSales("synthetic.csv", Buffer.from(csv))).toMatchObject({
    periodStart: "2026-10-14",
    periodEnd: "2026-10-14",
    exportedAt: null,
    dataRows: 1,
  });
  await expect(
    inspectSales("bad.csv", Buffer.from("ma_sp,qty\nMIU66,1")),
  ).rejects.toThrow("thiếu Order ID");
});
it("XML/ZIP hỏng hoặc DTD bị từ chối với thông báo an toàn", async () => {
  await expect(readWorkbookRows(Buffer.from("not-a-zip"))).rejects.toThrow(
    "Không đọc được",
  );
  const zip = await JSZip.loadAsync(await fragmentedWorkbook());
  zip.file(
    "xl/workbook.xml",
    '<!DOCTYPE workbook [<!ENTITY x "unsafe">]><workbook/>',
  );
  await expect(
    readWorkbookRows(await zip.generateAsync({ type: "nodebuffer" })),
  ).rejects.toThrow("DTD");
});
it("ma trận nhóm theo mã → màu → size, sắp bán nhiều trước và tổng các tầng khớp nhau", () => {
  const products = salesMatrix([
    { sku: "MIU66", color: "Trắng", size: "S", qty: 10, r2: 5, r7: 2 },
    { sku: "miu66", color: "trắng", size: "M", qty: 20, r2: 10, r7: 3 },
    { sku: "MIU66", color: "Đen", size: "L", qty: 7, r2: 3.5, r7: 1 },
    { sku: "MIU37", color: "Cam", size: "XL", qty: 4 },
    { sku: "UNKNOWN", color: "Combo", size: "CHƯA RÕ SIZE", qty: 99 },
  ]);
  expect(products.map((p) => p.sku)).toEqual(["MIU66", "MIU37"]);
  const p = products[0];
  expect(p).toMatchObject({
    qty: 37,
    r2: 18.5,
    r7: 6,
    sizeTotals: { S: 10, M: 20, L: 7, XL: 0 },
  });
  expect(p.colors[0]).toMatchObject({ color: "Trắng", qty: 30 });
  expect(p.colors.reduce((n, c) => n + c.qty, 0)).toBe(p.qty);
  expect(Object.values(p.sizeTotals).reduce((n, q) => n + q, 0)).toBe(p.qty);
});
