import { useState } from "react";
import { ChevronDown, ChevronRight, ArrowRight, Layers3 } from "lucide-react";
import { sizes } from "../shared/domain";
import { trendSignal } from "../shared/sales";
import type { SalesProduct, MatrixVariant } from "../shared/sales-matrix";
import { Empty, fmt } from "./ui";
export function SalesMatrix({
  products,
  busy,
  writable,
  onVariant,
  onTransfer,
  readOnly = false,
}: {
  products: SalesProduct[];
  readOnly?: boolean;
  busy: boolean;
  writable: boolean;
  onVariant: (variant: MatrixVariant) => void;
  onTransfer: (rows: MatrixVariant[]) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [limit, setLimit] = useState(10);
  const total = products.reduce((n, p) => n + p.qty, 0);
  return (
    <section
      className="sales-products"
      aria-label="Thống kê mã sản phẩm theo màu và size"
    >
      <div className="sales-matrix-toolbar">
        <div>
          <h2>Số lượng bán theo mã sản phẩm</h2>
          <p>
            {readOnly
              ? "Sản phẩm lẻ hợp lệ trong kỳ; combo và đơn bị loại không cộng vào ma trận."
              : "Mỗi mã có ma trận màu × size. Bấm số lượng để xem tồn và dự báo SKU."}
          </p>
        </div>
        <div className="actions">
          <button
            onClick={() =>
              setExpanded(
                Object.fromEntries(products.map((p) => [p.sku, true])),
              )
            }
          >
            Mở tất cả mã
          </button>
          <button
            onClick={() =>
              setExpanded(
                Object.fromEntries(products.map((p) => [p.sku, false])),
              )
            }
          >
            Thu gọn
          </button>
        </div>
      </div>
      {!products.length && (
        <Empty>
          Không có sản phẩm lẻ phù hợp bộ lọc. Combo và đơn bị loại có mục đối
          soát riêng.
        </Empty>
      )}
      {products.slice(0, limit).map((p, index) => {
        const open = expanded[p.sku] ?? index === 0;
        const max = Math.max(
          1,
          ...p.colors.flatMap((c) => Object.values(c.sizeTotals)),
        );
        return (
          <article className="sales-product-card" key={p.sku}>
            <div className="sales-product-heading">
              <button
                className="sales-product-toggle"
                aria-expanded={open}
                aria-controls={`matrix-${p.sku}`}
                onClick={() => setExpanded({ ...expanded, [p.sku]: !open })}
              >
                {open ? <ChevronDown size={19} /> : <ChevronRight size={19} />}
                <span className="sales-product-code">{p.sku}</span>
                <span className="sales-product-description">
                  {p.colors.length} màu · {p.variants.length} SKU{" "}
                  <span>{p.name}</span>
                </span>
              </button>
              <div className="sales-product-stat">
                <strong>{fmt(p.qty)}</strong>
                <small>
                  sản phẩm · {fmt(total ? (p.qty / total) * 100 : 0)}% kỳ xem
                </small>
              </div>
              {!readOnly && (
                <span className="badge orange">
                  Xu hướng: {trendSignal(p.r2, p.r7)}
                </span>
              )}
              {writable && (
                <button
                  disabled={busy}
                  onClick={() => onTransfer(p.variants)}
                  aria-label={`Chuyển ${p.sku} sang dự báo`}
                >
                  Dự báo mã <ArrowRight size={14} />
                </button>
              )}
            </div>
            {open && (
              <div id={`matrix-${p.sku}`}>
                <div className="table-scroll sales-size-matrix" tabIndex={0}>
                  <table aria-label={`Số lượng theo màu và size ${p.sku}`}>
                    <thead>
                      <tr>
                        <th>Màu / phối màu</th>
                        {sizes.map((s) => (
                          <th key={s}>{s}</th>
                        ))}
                        <th>Tổng màu</th>
                        <th>Tỷ trọng trong mã</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.colors.map((c) => (
                        <tr key={c.color}>
                          <td className="color-cell">
                            <strong>{c.color}</strong>
                            <span className="sales-share-bar">
                              <i
                                style={{ width: `${(c.qty / p.qty) * 100}%` }}
                              />
                            </span>
                          </td>
                          {sizes.map((size) => {
                            const qty = c.sizeTotals[size];
                            return (
                              <td
                                className="sales-heat-cell"
                                key={size}
                                style={
                                  qty
                                    ? {
                                        backgroundColor: `rgba(238,116,31,${0.06 + (0.25 * qty) / max})`,
                                      }
                                    : undefined
                                }
                              >
                                {qty && readOnly ? (
                                  <b>{fmt(qty)}</b>
                                ) : qty ? (
                                  <button
                                    aria-label={`Xem ${p.sku} ${c.color} ${size}: ${fmt(qty)} sản phẩm`}
                                    onClick={() =>
                                      onVariant(
                                        c.variants.find(
                                          (v) => v.size === size,
                                        )!,
                                      )
                                    }
                                  >
                                    {fmt(qty)}
                                  </button>
                                ) : (
                                  <span className="muted">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="sales-row-total">{fmt(c.qty)}</td>
                          <td>{fmt((c.qty / p.qty) * 100)}%</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th>TỔNG {p.sku}</th>
                        {sizes.map((s) => (
                          <th key={s}>{fmt(p.sizeTotals[s])}</th>
                        ))}
                        <th>{fmt(p.qty)}</th>
                        <th>100%</th>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <p className="sales-matrix-scroll-hint">
                  Vuốt ngang bảng để xem đủ các size và tổng số lượng.
                </p>
                {!readOnly && (
                  <div className="sales-product-foot">
                    <span>
                      <Layers3 size={14} /> TB 2 ngày:{" "}
                      <b>{fmt(p.r2)} sp/ngày</b>
                    </span>
                    <span>
                      TB 7 ngày: <b>{fmt(p.r7)} sp/ngày</b>
                    </span>
                    <small>
                      Tốc độ từ ngày trọn vẹn; tín hiệu bán không tự đổi vòng
                      đời.
                    </small>
                  </div>
                )}
              </div>
            )}
          </article>
        );
      })}
      {products.length > limit && (
        <button onClick={() => setLimit(limit + 10)}>
          Xem thêm {Math.min(10, products.length - limit)} mã (
          {products.length - limit} mã còn lại)
        </button>
      )}
    </section>
  );
}
