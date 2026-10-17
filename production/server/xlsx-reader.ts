import JSZip from "jszip";
import { SaxesParser } from "saxes";
import path from "node:path";
import { AppError } from "../shared/domain";

const MAX_XML = 80 * 1024 * 1024;
const local = (name: string) => name.split(":").at(-1)!;
function xmlRead(
  xml: string,
  handlers: {
    open?: (name: string, attrs: Record<string, string>) => void;
    text?: (text: string) => void;
    close?: (name: string) => void;
  },
) {
  if (!xml.trim()) return;
  const parser = new SaxesParser({ xmlns: false });
  parser.on("doctype", () => {
    throw new AppError(400, "Excel có DTD không được hỗ trợ.");
  });
  parser.on("opentag", (tag) =>
    handlers.open?.(local(tag.name), tag.attributes as Record<string, string>),
  );
  parser.on("text", (text) => handlers.text?.(text));
  parser.on("cdata", (text) => handlers.text?.(text));
  parser.on("closetag", (tag) => handlers.close?.(local(tag.name)));
  parser.write(xml).close();
}
export type WorkbookSource = {
  sheet: string;
  headerRow: number;
  repeatedRows: number;
};
export async function readWorkbookRows(
  bytes: Buffer,
): Promise<{ rows: Record<string, string>[]; source: WorkbookSource }> {
  try {
    if (bytes.length > 10e6) throw new AppError(413, "Tối đa 10 MB mỗi file.");
    const zip = await JSZip.loadAsync(bytes);
    const read = async (name: string) => {
      const entry = zip.file(name);
      if (!entry) return "";
      const declared = (entry as any)._data?.uncompressedSize;
      if (declared > MAX_XML)
        throw new AppError(413, "Worksheet quá lớn; chia kỳ hoặc dùng CSV.");
      const value = await entry.async("string");
      if (Buffer.byteLength(value) > MAX_XML)
        throw new AppError(413, "Worksheet quá lớn; chia kỳ hoặc dùng CSV.");
      return value;
    };
    const relationships = new Map<string, string>();
    xmlRead(await read("xl/_rels/workbook.xml.rels"), {
      open(name, a) {
        if (name === "Relationship" && a.TargetMode !== "External") {
          const target = a.Target.startsWith("/")
            ? a.Target.slice(1)
            : path.posix.normalize("xl/" + a.Target);
          if (target.startsWith("xl/worksheets/"))
            relationships.set(a.Id, target);
        }
      },
    });
    const sheets: { name: string; file: string }[] = [];
    let date1904 = false;
    xmlRead(await read("xl/workbook.xml"), {
      open(name, a) {
        if (name === "workbookPr")
          date1904 = a.date1904 === "1" || a.date1904 === "true";
        if (name === "sheet") {
          const file = relationships.get(a["r:id"]);
          if (file) sheets.push({ name: a.name, file });
        }
      },
    });
    if (!sheets.length)
      throw new AppError(400, "Không có worksheet trong Excel.");
    const shared: string[] = [];
    let inText = false,
      sharedValue = "",
      inPhonetic = false;
    xmlRead(await read("xl/sharedStrings.xml"), {
      open(name) {
        if (name === "si") sharedValue = "";
        if (name === "rPh") inPhonetic = true;
        if (name === "t") inText = true;
      },
      text(value) {
        if (inText && !inPhonetic) sharedValue += value;
      },
      close(name) {
        if (name === "t") inText = false;
        if (name === "rPh") inPhonetic = false;
        if (name === "si") shared.push(sharedValue);
      },
    });
    const dateFormats = new Set<number>([
      14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47,
    ]);
    const styles: number[] = [];
    let inCellXfs = false;
    xmlRead(await read("xl/styles.xml"), {
      open(name, a) {
        if (name === "numFmt") {
          const code = (a.formatCode || "").replace(
            /"[^"]*"|\\.|\[[^\]]*\]/g,
            "",
          );
          if (/[ydhs]/i.test(code)) dateFormats.add(Number(a.numFmtId));
        }
        if (name === "cellXfs") inCellXfs = true;
        if (name === "xf" && inCellXfs) styles.push(Number(a.numFmtId || 0));
      },
      close(name) {
        if (name === "cellXfs") inCellXfs = false;
      },
    });
    let fallback:
      { rows: Record<string, string>[]; source: WorkbookSource } | undefined;
    // The supplied export uses hundreds of <row r="N"> fragments, one per cell.
    // Key by the actual cell coordinate so fragments merge without overwriting.
    for (const sheet of sheets.sort(
      (a, b) =>
        Number(b.name === "OrderSKUList") - Number(a.name === "OrderSKUList"),
    )) {
      const rows = new Map<number, Map<number, string>>();
      const seenRows = new Set<number>();
      let repeatedRows = 0,
        rowNumber = 0,
        nextColumn = 1;
      let cell:
        | {
            row: number;
            column: number;
            type: string;
            style: number;
            value: string;
          }
        | undefined;
      let capture = false;
      xmlRead(await read(sheet.file), {
        open(name, a) {
          if (name === "row") {
            rowNumber = Number(a.r) || rowNumber + 1;
            nextColumn = 1;
            if (seenRows.has(rowNumber)) repeatedRows++;
            seenRows.add(rowNumber);
          }
          if (name === "c") {
            const coordinate = /^([A-Z]+)(\d+)$/.exec(a.r || "");
            const column = coordinate
              ? [...coordinate[1]].reduce(
                  (n, c) => n * 26 + c.charCodeAt(0) - 64,
                  0,
                )
              : nextColumn;
            const row = coordinate ? Number(coordinate[2]) : rowNumber;
            if (row > 100002 || column > 256)
              throw new AppError(413, "Tối đa 100.000 dòng và 256 cột.");
            nextColumn = column + 1;
            cell = {
              row,
              column,
              type: a.t || "n",
              style: Number(a.s || 0),
              value: "",
            };
          }
          if (name === "v" || name === "t") capture = true;
        },
        text(value) {
          if (cell && capture) {
            cell.value += value;
            if (cell.value.length > 100000)
              throw new AppError(413, "Một ô Excel quá dài.");
          }
        },
        close(name) {
          if (name === "v" || name === "t") capture = false;
          if (name === "c" && cell) {
            let value =
              cell.type === "s" && cell.value !== ""
                ? shared[Number(cell.value)]
                : cell.value;
            if (value === undefined)
              throw new AppError(400, "Excel tham chiếu chuỗi không hợp lệ.");
            if (
              cell.type === "n" &&
              value &&
              dateFormats.has(styles[cell.style])
            ) {
              const date = new Date(
                Math.round(
                  (Number(value) - (date1904 ? 24107 : 25569)) * 86400000,
                ),
              );
              if (!Number.isFinite(date.getTime()))
                throw new AppError(400, "Ngày Excel không hợp lệ.");
              value = date.toISOString();
            }
            const row = rows.get(cell.row) || new Map<number, string>();
            if (row.has(cell.column) && row.get(cell.column) !== value)
              throw new AppError(
                400,
                `Ô Excel bị ghi hai giá trị khác nhau tại dòng ${cell.row}, cột ${cell.column}.`,
              );
            row.set(cell.column, value);
            rows.set(cell.row, row);
            cell = undefined;
          }
        },
      });
      const sorted = [...rows].sort((a, b) => a[0] - b[0]);
      const header = sorted.slice(0, 50).find(([, cells]) => {
        const values = [...cells.values()].map((v) => v.trim());
        return (
          values.includes("ma_sp") ||
          (values.includes("Order ID") &&
            values.includes("Quantity") &&
            values.includes("Created Time"))
        );
      });
      const chosen =
        header || sorted.find(([, r]) => [...r.values()].some((v) => v.trim()));
      if (!chosen) continue;
      const keys = [...chosen[1]]
        .map(
          ([column, key]) =>
            [column, key.trim().replace(/^\ufeff/, "")] as const,
        )
        .filter(([, key]) => key);
      if (new Set(keys.map(([, key]) => key)).size !== keys.length)
        throw new AppError(400, "Excel có tên cột bị trùng.");
      const records = sorted
        .filter(([n]) => n > chosen[0])
        .map(([, r]) =>
          Object.fromEntries(
            keys.map(([column, key]) => [key, r.get(column) || ""]),
          ),
        )
        .filter((r) => Object.values(r).some((v) => v.trim()));
      const result = {
        rows: records,
        source: { sheet: sheet.name, headerRow: chosen[0], repeatedRows },
      };
      if (header) return result;
      fallback ||= result;
    }
    if (fallback) return fallback;
    throw new AppError(400, "Excel không có dòng dữ liệu.");
  } catch (error) {
    if (error instanceof AppError) throw error;
    const wrapped = new AppError(
      400,
      "Không đọc được cấu trúc Excel. Hãy xuất lại XLSX hoặc dùng CSV.",
    );
    (wrapped as any).cause = error;
    throw wrapped;
  }
}
