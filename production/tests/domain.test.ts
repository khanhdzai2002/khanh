import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import {
  forecast,
  skuSchema,
  defaultPolicy,
  policySchema,
  can,
} from "../shared/domain";
import {
  parseSalesRow,
  rates,
  shiftDay,
  classifyVariation,
} from "../shared/sales";
const row = (patch: Record<string, unknown> = {}) =>
  skuSchema.parse({
    sku: "TEST01",
    color: "Cam",
    size: "S",
    health: "Tăng trưởng",
    day1: 20,
    day2: 20,
    stock: 30,
    inbound: 10,
    ...patch,
  });
describe("Công thức V9", () => {
  it("đúng 60, không cộng 3 ngày chờ mặc định", () =>
    expect(forecast(row()).need).toBe(60));
  it("chỉ cộng ngày chờ khi chủ động bật", () =>
    expect(forecast(row(), { ...defaultPolicy, includeLead: true }).need).toBe(
      120,
    ));
  it("ceil nhu cầu rồi làm tròn bội", () =>
    expect(
      forecast(row({ day1: 1.1, day2: 2.2, stock: 0, inbound: 0 }), {
        ...defaultPolicy,
        roundTo: 6,
      }).need,
    ).toBe(12));
  it("Mở bán không trừ tồn và không làm tròn bội", () =>
    expect(
      forecast(row({ health: "Mở bán", pilotQty: 7, stock: 1000 }), {
        ...defaultPolicy,
        roundTo: 10,
      }).need,
    ).toBe(7));
  it.each(["Giảm sút", "Xả kho"])("%s luôn dừng gối", (health) =>
    expect(forecast(row({ health })).need).toBe(0),
  );
  it("thiếu tồn khác tồn bằng 0", () => {
    expect(forecast(row({ stock: null }))).toMatchObject({
      need: 0,
      flag: "unknown",
    });
    expect(forecast(row({ stock: 0 })).need).toBe(90);
  });
  it("ngày bất thường dùng tốc độ chuẩn nhập tay", () =>
    expect(forecast(row({ abnormal: true, manualRate: 4 })).need).toBe(0));
  it("chính sách sai khóa đề xuất kể cả test", () =>
    expect(
      forecast(row({ health: "Mở bán", pilotQty: 100 }), {
        ...defaultPolicy,
        roundTo: 0,
      }),
    ).toMatchObject({ need: 0, flag: "invalid" }));
  it("không tự đổi vòng đời khi tăng doanh số", () =>
    expect(forecast(row({ health: "Mở bán", day1: 1, day2: 200 })).need).toBe(
      0,
    ));
  it("từ chối số âm và chính sách ngoài giới hạn", () => {
    expect(() => row({ stock: -1 })).toThrow();
    expect(
      policySchema.safeParse({ ...defaultPolicy, targetDays: 46 }).success,
    ).toBe(false);
  });
  it("đối chiếu 400 đầu vào với chính hàm calc trích từ V9", () => {
    const source = readFileSync(
      new URL("./fixtures/v9-calc.js.txt", import.meta.url),
      "utf8",
    );
    for (let n = 0; n < 400; n++) {
      const s = row({
        health: ["Mở bán", "Tăng trưởng", "Giảm sút", "Xả kho"][n % 4],
        stock: n % 9 === 0 ? null : n % 43,
        inbound: n % 8,
        day1: (n % 25) / 2,
        day2: (n % 37) / 2,
        abnormal: n % 3 === 0,
        manualRate: n % 19,
        pilotQty: n % 53,
      });
      const p = {
        ...defaultPolicy,
        roundTo: (n % 5) + 1,
        includeLead: n % 7 === 0,
        safeDays: n % 3,
      };
      const result = forecast(s, p);
      const original = vm.runInNewContext(source + ";calc(r)", {
        r: { ...s, stock: s.stock ?? 0, stockKnown: s.stock !== null },
        num: (x: unknown) => Math.max(0, Number(x) || 0),
        fmt: (x: number) => String(x),
        stageOf: (r: any) => r.health,
        policyCheck: () => ({
          valid: true,
          c: p,
          effectiveDays:
            p.targetDays + p.safeDays + (p.includeLead ? p.leadDays : 0),
        }),
      });
      expect(result.need).toBe(original.need);
      expect(result.sale).toBe(original.sale);
      expect(result.raw).toBe(original.raw);
      expect(result.target).toBe(original.target);
      expect(result.cover).toBe(original.cover);
      expect(result.flag).toBe(original.flag);
    }
  });
});
describe("Bán hàng và phân quyền", () => {
  const sale = (patch: Record<string, string> = {}) =>
    parseSalesRow(
      {
        "Order ID": "synthetic-1",
        "Order Status": "Đã hoàn tất",
        "Created Time": "14/10/2026 10:00:00",
        Quantity: "5",
        "Sku Quantity of return": "1",
        "Product Name": "Áo MIU66",
        Variation: "Trắng phối đen, M (<50kg)",
        ...patch,
      },
      "synthetic-line",
    );
  it("tính sản phẩm lẻ sau trừ số trả, không đếm đơn", () =>
    expect(sale()).toMatchObject({
      qty: 4,
      sku: "MIU66",
      color: "Trắng (phối tay đen)",
      size: "M",
      date: "2026-10-14",
      kind: "single",
    }));
  it.each(["Đã hủy", "Unpaid", "Returned"])("loại trạng thái %s", (status) =>
    expect(sale({ "Order Status": status }).kind).toBe("excluded"),
  );
  it("giữ combo riêng, không nhân về một SKU", () =>
    expect(
      sale({
        Variation: "2 ÁO (Trắng + Đen), M",
        Quantity: "10",
        "Sku Quantity of return": "0",
      }),
    ).toMatchObject({ kind: "combo", qty: 10 }));
  it("giữ dòng không rõ mã để đối soát", () =>
    expect(sale({ "Product Name": "không mã" }).kind).toBe("unknown"));
  it("chuẩn hóa alias XXL công khai", () =>
    expect(classifyVariation("MIU01", "Nâu scl, XXL")[1]).toBe("2XL"));
  it("TB không bao gồm ngày xuất chưa trọn vẹn", () => {
    const result = rates(
      [
        { date: "2026-10-13", qty: 10 },
        { date: "2026-10-14", qty: 30 },
        { date: "2026-10-15", qty: 5000 },
      ],
      "2026-10-14",
    );
    expect(result.r2).toBe(20);
    expect(result.r7).toBe(40 / 7);
  });
  it("ngưỡng tín hiệu V9 độc lập vòng đời", () =>
    expect(rates([{ date: "2026-10-14", qty: 20 }], "2026-10-14").signal).toBe(
      "Tăng trưởng",
    ));
  it("đúng lịch qua cuối tháng", () =>
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28"));
  it("vai trò warehouse không được sửa lệnh; viewer không được ghi", () => {
    expect(can("Warehouse Operator", "receive")).toBe(true);
    expect(can("Warehouse Operator", "order")).toBe(false);
    expect(can("Viewer", "plan")).toBe(false);
    expect(can("Manager", "order")).toBe(false);
  });
});
