// Read-only local inspection of an operator-supplied file. Never writes to a DB.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { readWorkbookRows } from "../server/xlsx-reader";
import { describeSalesFile, isDataRow } from "../shared/sales-file";
import { parseSalesRow } from "../shared/sales";
import { salesMatrix } from "../shared/sales-matrix";
const filename = process.argv[2];
if (!filename)
  throw Error(
    "Truyền đường dẫn XLSX/CSV cần kiểm tra; không gửi token hoặc mật khẩu.",
  );
const bytes = await fs.readFile(filename);
if (bytes.length > 10e6) throw Error("Tối đa 10 MB.");
const start = Date.now();
const workbook = filename.toLowerCase().endsWith(".xlsx")
  ? await readWorkbookRows(bytes)
  : null;
const rows =
  workbook?.rows ||
  parse(bytes.toString("utf8"), {
    columns: true,
    bom: true,
    trim: true,
    skip_empty_lines: true,
  });
const metadata = describeSalesFile(path.basename(filename), rows);
const summary: Record<string, number> = {
  single: 0,
  combo: 0,
  excluded: 0,
  unknown: 0,
};
const parsed = [];
let errors = 0;
for (const r of rows)
  if (isDataRow(r)) {
    try {
      const row = parseSalesRow(r, "read-only-local");
      summary[row.kind] += row.qty;
      parsed.push(row);
    } catch {
      errors++;
    }
  }
const products = salesMatrix(parsed.filter((r) => r.kind === "single"));
const sum = products.reduce((n, p) => n + p.qty, 0);
if (sum !== summary.single) throw Error("Tổng ma trận không khớp sản phẩm lẻ.");
console.log(
  JSON.stringify(
    {
      mode: "read-only, no database writes",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      metadata,
      source: workbook?.source,
      summary,
      errors,
      products: products.length,
      skuCount: products.reduce(
        (n, p) =>
          n +
          new Set(p.variants.map((v) => JSON.stringify([v.color, v.size])))
            .size,
        0,
      ),
      matrixTotal: sum,
      ms: Date.now() - start,
    },
    null,
    2,
  ),
);
if (errors) process.exitCode = 1;
