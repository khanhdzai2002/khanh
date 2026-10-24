import { useState } from "react";
import {
  pendingProductBreakdown,
  type pendingProduction,
} from "../shared/pending-production";
import { sizes } from "../shared/domain";
import { fmt } from "./ui";
export function PendingProductBreakdown({
  report,
  sku,
  onSources,
  onFilter,
}: {
  report: ReturnType<typeof pendingProduction>;
  sku: string;
  onSources: (key: string, size?: (typeof sizes)[number]) => void;
  onFilter: () => void;
}) {
  const product = pendingProductBreakdown(report, sku);
  const [opened, setOpened] = useState<string[]>(
    () => product?.colors.slice(0, 3).map((c) => c.key) || [],
  );
  if (!product) return null;
  return (
    <div
      className="pending-product-breakdown"
      role="region"
      aria-label={`Chi tiết tỷ trọng ${sku}`}
    >
      <p>
        <b>{fmt(product.pending)} sản phẩm còn chờ</b> · {product.colors.length}{" "}
        màu · {product.orderCount} lệnh duy nhất · {fmt(product.share)}% trong
        bộ lọc.
      </p>
      <small>
        Màu: % trong mã {sku}. Size: % trong từng màu. Bấm số lượng size để xem
        đúng các lệnh còn chờ size đó.
      </small>
      <div className="actions">
        <button onClick={() => setOpened(product.colors.map((c) => c.key))}>
          Mở tất cả màu {sku}
        </button>
        <button onClick={() => setOpened([])}>Thu gọn màu {sku}</button>
        <button onClick={onFilter}>Lọc riêng mã {sku}</button>
      </div>
      {product.colors.map((color) => (
        <div className="pending-color-breakdown" key={color.key}>
          <button
            className="pending-color-toggle"
            aria-expanded={opened.includes(color.key)}
            aria-label={`Chi tiết màu ${sku} ${color.color}`}
            onClick={() =>
              setOpened((v) =>
                v.includes(color.key)
                  ? v.filter((k) => k !== color.key)
                  : [...v, color.key],
              )
            }
          >
            <strong>{color.color}</strong>
            <span>
              {fmt(color.pending)} sp · <b>{fmt(color.shareOfProduct)}% mã</b>
            </span>
            <small>
              {color.sources.length} lệnh ·{" "}
              {opened.includes(color.key) ? "Thu gọn" : "Mở từng size"}
            </small>
          </button>
          {opened.includes(color.key) && (
            <div className="pending-color-content">
              <div className="pending-size-breakdown">
                {color.sizes.map((s) => (
                  <button
                    key={s.size}
                    disabled={!s.pending}
                    aria-label={`Xem lệnh ${sku} ${color.color} size ${s.size}`}
                    onClick={() => onSources(color.key, s.size)}
                  >
                    <b>{s.size}</b>
                    <strong>{fmt(s.pending)} sp</strong>
                    <span>{fmt(s.shareOfColor)}% màu</span>
                    <small>{fmt(s.shareOfProduct)}% mã</small>
                  </button>
                ))}
              </div>
              <p>
                {color.color} chiếm {fmt(color.shareOfProduct)}% của {sku},
                tương đương {fmt(color.shareOfReport)}% tổng còn chờ trong bộ
                lọc.
              </p>
              <button
                aria-haspopup="dialog"
                onClick={() => onSources(color.key)}
              >
                Xem các lệnh {sku} {color.color}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
