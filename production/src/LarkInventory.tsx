import { useEffect, useState } from "react";
import { api, send } from "./api";
import { Field, Notice, Modal, type Run } from "./ui";
import { sizes } from "../shared/domain";
import { type InventorySource } from "../shared/lark-inventory";
const defaults: InventorySource = {
  url: "",
  mapping: {
    sku: "Mã sản phẩm",
    color: "Màu",
    date: "Ngày kiểm",
    sizes: { XS: "", S: "S", M: "M", L: "L", XL: "XL", "2XL": "XXL" },
  },
  blankAsZero: true,
  createMissing: false,
};
export function LarkInventory({ run, busy }: { run: Run; busy: boolean }) {
  const [source, setSource] = useState(defaults),
    [version, setVersion] = useState(0),
    [fields, setFields] = useState<string[]>([]),
    [dirty, setDirty] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<any>(null);
  useEffect(() => {
    void api("/api/lark/inventory/source")
      .then((value) => {
        if (value) {
          const { version, updatedAt, ...config } = value;
          setSource(config);
          setVersion(version);
        }
        setReady(true);
      })
      .catch((e) => setError(e.message));
  }, []);
  const change = (value: InventorySource) => {
    setSource(value);
    setDirty(true);
    setPreview(null);
  };
  function select(
    label: string,
    value: string,
    update: (v: string) => void,
    optional = false,
  ) {
    return (
      <Field label={label}>
        <select
          disabled={busy}
          value={value}
          onChange={(e) => update(e.target.value)}
        >
          <option value="">
            {optional ? "Không có size này" : "Chọn cột"}
          </option>
          {[...new Set([...fields, value].filter(Boolean))].map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </Field>
    );
  }
  return (
    <section className="panel padded">
      <h2>Kết nối tồn kho Lark Base</h2>
      <p>
        Đọc tồn theo mã sản phẩm → màu → size. PostgreSQL lưu bản tồn đã xác
        nhận cùng lịch sử và người thực hiện.
      </p>
      <Notice>
        Chỉ đọc Lark, không ghi ngược. Chỉ cập nhật tồn thực tế và ngày/nguồn
        tồn; giữ nguyên hàng đang về, doanh số, trạng thái vòng đời và lệnh sản
        xuất. Chưa có đồng bộ tự động theo lịch.
      </Notice>
      {error && <Notice>{error}</Notice>}
      <Field label="Link bảng tồn kho (có table và view)">
        <input
          disabled={busy || !ready}
          value={source.url}
          placeholder="https://…larksuite.com/wiki/…?table=tbl…&view=vew…"
          onChange={(e) => {
            change({ ...source, url: e.target.value });
            setFields([]);
          }}
        />
      </Field>
      <button
        disabled={busy || !ready || !source.url}
        onClick={() =>
          void run(async () => {
            const result = await send("/api/lark/inventory/fields", {
              url: source.url,
            });
            const names: string[] = result.fields.map((f: any) => f.name);
            setFields(names);
            const find = (value: string, candidates: string[]) =>
              names.includes(value)
                ? value
                : names.find((n) =>
                    candidates.includes(
                      n.trim().toLowerCase().replace(/^#\s*/, ""),
                    ),
                  ) || value;
            change({
              ...source,
              mapping: {
                sku: find(source.mapping.sku, ["mã sản phẩm", "mã sp"]),
                color: find(source.mapping.color, ["màu"]),
                date: find(source.mapping.date, ["ngày kiểm"]),
                sizes: Object.fromEntries(
                  sizes.map((size) => [
                    size,
                    find(
                      source.mapping.sizes[size],
                      size === "2XL" ? ["xxl", "2xl"] : [size.toLowerCase()],
                    ),
                  ]),
                ) as InventorySource["mapping"]["sizes"],
              },
            });
          }, "Đã đọc tên cột; hãy kiểm tra ánh xạ rồi lưu nguồn")
        }
      >
        Đọc danh sách cột
      </button>
      <div className="form-grid">
        {select("Cột mã sản phẩm", source.mapping.sku, (sku) =>
          change({ ...source, mapping: { ...source.mapping, sku } }),
        )}
        {select("Cột màu", source.mapping.color, (color) =>
          change({ ...source, mapping: { ...source.mapping, color } }),
        )}
        {select("Cột ngày kiểm", source.mapping.date, (date) =>
          change({ ...source, mapping: { ...source.mapping, date } }),
        )}
        {sizes.map((size) => (
          <div key={size}>
            {select(
              `Tồn size ${size}`,
              source.mapping.sizes[size],
              (name) =>
                change({
                  ...source,
                  mapping: {
                    ...source.mapping,
                    sizes: { ...source.mapping.sizes, [size]: name },
                  },
                }),
              true,
            )}
          </div>
        ))}
      </div>
      <Field label="Ô size để trống">
        <select
          disabled={busy}
          value={source.blankAsZero ? "zero" : "skip"}
          onChange={(e) =>
            change({ ...source, blankAsZero: e.target.value === "zero" })
          }
        >
          <option value="skip">Bỏ qua — giữ tồn trong ứng dụng</option>
          <option value="zero">Tồn bằng 0 — sẽ ghi tồn về 0</option>
        </select>
      </Field>
      <Field label="SKU chưa có trong danh mục">
        <select
          disabled={busy}
          value={source.createMissing ? "create" : "skip"}
          onChange={(e) =>
            change({ ...source, createMissing: e.target.value === "create" })
          }
        >
          <option value="skip">Bỏ qua, chỉ cập nhật SKU đã có</option>
          <option value="create">Tạo SKU còn thiếu ở trạng thái Mở bán</option>
        </select>
      </Field>
      <p>
        Chỉ lấy ngày kiểm mới nhất của từng mã–màu trong view đã chọn. Trùng
        dòng ở ngày mới nhất sẽ bị chặn. Tồn Lark cũ hơn tồn trong ứng dụng được
        bỏ qua. Tổng số lượng, tồn hôm qua và nhập mới không cộng thêm vào các
        cột size.
      </p>
      <div className="actions">
        <button
          disabled={busy || !ready || (!dirty && version > 0)}
          onClick={() =>
            void run(async () => {
              const saved = await send("/api/lark/inventory/source", {
                source,
                version,
              });
              setVersion(saved.version);
              setDirty(false);
              setPreview(null);
            }, "Đã lưu nguồn và ánh xạ tồn kho; chưa cập nhật tồn")
          }
        >
          Lưu cấu hình nguồn
        </button>
        <button
          className="primary"
          disabled={busy || !ready || dirty || !version}
          onClick={() =>
            void run(
              async () =>
                setPreview(await send("/api/lark/inventory/preview", {})),
              "Đã đọc tồn Lark; chưa cập nhật dữ liệu",
            )
          }
        >
          Đọc tồn & xem trước
        </button>
      </div>
      {dirty && (
        <p>
          Lưu cấu hình trước khi đọc tồn. Khi đổi link hoặc ánh xạ, hãy đọc lại
          danh sách cột.
        </p>
      )}
      {preview && (
        <Modal
          title="Kiểm tra tồn kho từ Lark"
          onClose={() => setPreview(null)}
        >
          <p>
            Đã đọc {preview.readRows} dòng trong view · {preview.count} SKU đủ
            điều kiện cập nhật/tạo. Thời điểm đọc:{" "}
            {new Date(preview.fetchedAt).toLocaleString("vi-VN", {
              timeZone: "Asia/Ho_Chi_Minh",
            })}
            .
          </p>
          {preview.warnings.map((warning: string) => (
            <Notice key={warning}>{warning}</Notice>
          ))}
          {preview.errors.length > 0 && (
            <div className="error-list">
              {preview.errors.slice(0, 50).map((e: string, i: number) => (
                <p key={i}>{e}</p>
              ))}
              <strong>{preview.errors.length} lỗi — chưa thể cập nhật</strong>
            </div>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Mã SP</th>
                  <th>Màu</th>
                  <th>Size</th>
                  <th>Ngày kiểm</th>
                  <th>Tồn hiện tại</th>
                  <th>Tồn Lark</th>
                  <th>Xử lý</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 200).map((row: any, i: number) => (
                  <tr key={i}>
                    <td>{row.sku}</td>
                    <td>{row.color}</td>
                    <td>{row.size}</td>
                    <td>{row.date}</td>
                    <td>{row.previous ?? "Chưa nhập"}</td>
                    <td>{row.stock}</td>
                    <td>
                      {
                        {
                          update: "Cập nhật",
                          create: "Tạo SKU",
                          unknown: "Bỏ qua: chưa có SKU",
                          older: "Bỏ qua: tồn cũ",
                        }[row.action as string]
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.rows.length > 200 && (
            <p>
              Hiển thị 200/{preview.rows.length} SKU. Xác nhận áp dụng tất cả
              SKU đủ điều kiện.
            </p>
          )}
          <Notice>
            Xác nhận thay thế số tồn bằng số Lark đã xem trước, không cộng dồn.
            Bản xem trước có hiệu lực 15 phút; không phản ánh thay đổi trên Lark
            sau thời điểm đọc. Nếu ứng dụng đã có thay đổi SKU, bạn cần xem
            trước lại.
          </Notice>
          <button
            className="primary"
            disabled={busy || preview.errors.length > 0 || !preview.count}
            onClick={() =>
              void run(async () => {
                await send(`/api/lark/inventory/${preview.id}/confirm`, {});
              }, "Đã cập nhật tồn kho và lưu lịch sử").then((ok) => {
                if (ok) setPreview(null);
              })
            }
          >
            Xác nhận cập nhật {preview.count} SKU
          </button>
        </Modal>
      )}
    </section>
  );
}
