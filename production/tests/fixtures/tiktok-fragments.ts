import JSZip from "jszip";
const escape = (v: string) =>
  v.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
export const syntheticHeaders = [
  "Order ID",
  "Order Status",
  "Cancelation/Return Type",
  "SKU ID",
  "Seller SKU",
  "Product Name",
  "Variation",
  "Quantity",
  "Sku Quantity of return",
  "Created Time",
];
export async function fragmentedWorkbook(
  options: { conflict?: boolean; rows?: string[][] } = {},
) {
  const zip = new JSZip();
  zip.file(
    "xl/workbook.xml",
    '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="OrderSKUList" sheetId="2" r:id="rId2"/></sheets></workbook>',
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    '<Relationships><Relationship Id="rId2" Target="worksheets/sheet2.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/></Relationships>',
  );
  const rows = options.rows || [
    [
      "Platform unique order identifier",
      "Current order status.",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Order created time",
    ],
    [
      "SYNTHETIC-ONE",
      "Completed",
      "",
      "SKU-M",
      "MIU66",
      "Áo MIU66",
      "Trắng phối đen, M",
      "10",
      "0",
      "14/10/2026 10:00:00",
    ],
    [
      "SYNTHETIC-TWO",
      "Completed",
      "",
      "SKU-L",
      "MIU66",
      "Áo MIU66",
      "Trắng phối đen, L",
      "20",
      "0",
      "15/10/2026 09:00:00",
    ],
    [
      "SYNTHETIC-THREE",
      "Đã hủy",
      "",
      "SKU-M",
      "MIU66",
      "Áo MIU66",
      "Trắng phối đen, M",
      "5",
      "0",
      "15/10/2026 09:00:00",
    ],
    [
      "SYNTHETIC-FOUR",
      "Completed",
      "",
      "SKU-SET",
      "MIU66",
      "Áo MIU66",
      "COMBO 2 ÁO, M",
      "3",
      "0",
      "15/10/2026 09:00:00",
    ],
  ];
  const cells = [syntheticHeaders, ...rows].flatMap((r, i) =>
    r.map(
      (value, j) =>
        `<row r="${i + 1}"><c r="${String.fromCharCode(65 + j)}${i + 1}" t="str"><v>${escape(value)}</v></c></row>`,
    ),
  );
  if (options.conflict)
    cells.push(
      '<row r="1"><c r="A1" t="str"><v>CONFLICTING HEADER</v></c></row>',
    );
  zip.file(
    "xl/worksheets/sheet2.xml",
    `<worksheet><sheetData>${cells.join("")}</sheetData></worksheet>`,
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
