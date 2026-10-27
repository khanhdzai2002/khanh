import { Fragment, useState } from "react";
import { sizes, type ProductionOrder } from "../shared/domain";
import { incomingOrders, type IncomingRow } from "../shared/incoming-goods";
import {
  incomingMatrix,
  withIncomingGroups,
  type IncomingMatrixLine,
} from "../shared/incoming-matrix";
import { fmt } from "./ui";
export type MatrixVariant = {
  id: string;
  sku: string;
  color: string;
  size: string;
};
export function newIncomingLine(
  bagGroupId: string,
  bag: string,
  sku = "",
  color = "",
  variants: MatrixVariant[] = [],
): IncomingRow[] {
  const lineGroupId = crypto.randomUUID();
  return sizes.map((size) => ({
    id: crypto.randomUUID(),
    bagGroupId,
    lineGroupId,
    bag,
    sku,
    color,
    size,
    qty: 0,
    variantId:
      variants.find(
        (v) => v.sku === sku && v.color === color && v.size === size,
      )?.id || null,
    orderId: null,
    remember: false,
    allocationMode: "auto",
    excessOrderId: null,
  }));
}
export function IncomingBagTable({
  rows,
  variants,
  orders,
  supplier,
  includeDrafts,
  includePaused,
  disabled,
  onChange,
  onOrder,
}: {
  rows: IncomingRow[];
  variants: MatrixVariant[];
  orders: ProductionOrder[];
  supplier?: string;
  includeDrafts?: boolean;
  includePaused?: boolean;
  disabled: boolean;
  onChange: (rows: IncomingRow[]) => void;
  onOrder: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [customSku, setCustomSku] = useState<Record<string, boolean>>({}),
    [customColor, setCustomColor] = useState<Record<string, boolean>>({});
  const grouped = withIncomingGroups(rows),
    bags = incomingMatrix(grouped);
  const codes = [...new Set(variants.map((v) => v.sku))].sort((a, b) =>
    a.localeCompare(b, "vi"),
  );
  const updateLine = (
    line: IncomingMatrixLine,
    fn: (r: IncomingRow) => IncomingRow,
  ) => {
    const ids = new Set(Object.values(line.cells).map((r) => r.id));
    onChange(grouped.map((r) => (ids.has(r.id) ? fn(r) : r)));
  };
  const patchCell = (
    line: IncomingMatrixLine,
    size: (typeof sizes)[number],
    patch: Partial<IncomingRow>,
  ) => {
    const old = line.cells[size];
    if (old) {
      onChange(
        grouped.map((r) =>
          r.id === old.id ? { ...r, ...patch, remember: false } : r,
        ),
      );
      return;
    }
    const base = Object.values(line.cells)[0];
    const row = {
      ...base,
      id: crypto.randomUUID(),
      size,
      qty: 0,
      variantId:
        variants.find(
          (v) =>
            v.sku === line.sku && v.color === line.color && v.size === size,
        )?.id || null,
      orderId: null,
      excessOrderId: null,
      ...patch,
      remember: false,
    };
    onChange([...grouped, row]);
  };
  return (
    <div className="table-scroll">
      <table className="incoming-table incoming-matrix">
        <thead>
          <tr>
            {[
              "Mã trên phiếu",
              "Màu trên phiếu",
              ...sizes,
              "Tổng",
              "Lệnh nhận",
              "Thao tác",
            ].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bags.map((bag, bagIndex) => (
            <Fragment key={bag.id}>
              <tr className="incoming-bag-header">
                <td colSpan={9}>
                  <div className="incoming-bag-bar">
                    <label>
                      Bao số{" "}
                      <input
                        aria-label={`Số bao nhóm ${bagIndex + 1}`}
                        value={bag.label}
                        maxLength={80}
                        disabled={disabled}
                        onChange={(e) =>
                          onChange(
                            grouped.map((r) =>
                              r.bagGroupId === bag.id
                                ? { ...r, bag: e.target.value }
                                : r,
                            ),
                          )
                        }
                      />
                    </label>
                    <span>
                      {bag.lines.length} dòng màu ·{" "}
                      <b>
                        {fmt(
                          bag.lines.reduce(
                            (n, l) =>
                              n +
                              Object.values(l.cells).reduce(
                                (s, r) => s + (r.qty || 0),
                                0,
                              ),
                            0,
                          ),
                        )}{" "}
                        sản phẩm
                      </b>
                    </span>
                    <button
                      disabled={disabled}
                      onClick={() =>
                        onChange([
                          ...grouped,
                          ...newIncomingLine(bag.id, bag.label),
                        ])
                      }
                    >
                      Thêm mã / màu vào bao {bag.label || bagIndex + 1}
                    </button>
                    <button
                      disabled={disabled}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Bỏ toàn bộ dòng hàng của bao ${bag.label || bagIndex + 1} khỏi phiếu nháp?`,
                          )
                        )
                          onChange(
                            grouped.filter((r) => r.bagGroupId !== bag.id),
                          );
                      }}
                    >
                      Bỏ bao
                    </button>
                  </div>
                </td>
              </tr>
              {bag.lines.map((line, lineIndex) => {
                const label = `bao ${bag.label || bagIndex + 1} dòng ${lineIndex + 1}`;
                const cells = Object.values(line.cells);
                const colors = [
                  ...new Set(
                    variants
                      .filter((v) => v.sku === line.sku)
                      .map((v) => v.color),
                  ),
                ].sort((a, b) => a.localeCompare(b, "vi"));
                const total = cells.reduce((n, r) => n + (r.qty || 0), 0);
                const allAuto = cells.every((r) => r.allocationMode === "auto");
                const allUnmatched = cells.every(
                  (r) => r.allocationMode === "unmatched",
                );
                const freeSku =
                    customSku[line.id] ||
                    (!!line.sku && !codes.includes(line.sku)),
                  freeColor =
                    customColor[line.id] ||
                    (!!line.color && !colors.includes(line.color));
                const unresolved =
                  !line.sku ||
                  !line.color ||
                  cells.some(
                    (r) =>
                      r.qty === null ||
                      ((r.qty || 0) > 0 &&
                        r.allocationMode !== "auto" &&
                        r.allocationMode !== "unmatched" &&
                        !r.orderId),
                  );
                const show = !!expanded[line.id];
                const pick = (sku: string, color: string) =>
                  updateLine(line, (r) => ({
                    ...r,
                    sku,
                    color,
                    variantId:
                      variants.find(
                        (v) =>
                          v.sku === sku &&
                          v.color === color &&
                          v.size === r.size,
                      )?.id || null,
                    orderId: null,
                    excessOrderId: null,
                    remember: false,
                  }));
                return (
                  <Fragment key={line.id}>
                    <tr
                      className={`incoming-matrix-line ${unresolved ? "incoming-unresolved" : ""}`}
                    >
                      <td className="incoming-child">
                        <span aria-hidden="true">↳</span>
                        <select
                          aria-label={`Mã ${label}`}
                          value={freeSku ? "__custom__" : line.sku}
                          disabled={disabled}
                          onChange={(e) => {
                            if (e.target.value === "__custom__") {
                              setCustomSku((s) => ({ ...s, [line.id]: true }));
                              pick("", "");
                            } else {
                              setCustomSku((s) => ({ ...s, [line.id]: false }));
                              pick(e.target.value, "");
                            }
                          }}
                        >
                          <option value="">Chọn mã sản phẩm</option>
                          <option value="__custom__">
                            Nhập mã chưa có trên app…
                          </option>
                          {line.sku && !codes.includes(line.sku) && (
                            <option value={line.sku}>
                              {line.sku} — chọn lại mã
                            </option>
                          )}
                          {codes.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                        {freeSku && (
                          <input
                            aria-label={`Mã nhập tay ${label}`}
                            maxLength={90}
                            placeholder="Mã sản phẩm thực nhận"
                            value={line.sku}
                            disabled={disabled}
                            onChange={(e) =>
                              pick(e.target.value.toUpperCase(), line.color)
                            }
                          />
                        )}
                      </td>
                      <td>
                        <select
                          aria-label={`Màu ${label}`}
                          value={freeColor ? "__custom__" : line.color}
                          disabled={disabled || !line.sku}
                          onChange={(e) => {
                            if (e.target.value === "__custom__") {
                              setCustomColor((s) => ({
                                ...s,
                                [line.id]: true,
                              }));
                              pick(line.sku, "");
                            } else {
                              setCustomColor((s) => ({
                                ...s,
                                [line.id]: false,
                              }));
                              pick(line.sku, e.target.value);
                            }
                          }}
                        >
                          <option value="">Chọn màu của mã</option>
                          <option value="__custom__">
                            Nhập màu chưa có trên app…
                          </option>
                          {line.color && !colors.includes(line.color) && (
                            <option value={line.color}>
                              {line.color} — chọn lại màu
                            </option>
                          )}
                          {colors.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                        {freeColor && (
                          <input
                            aria-label={`Màu nhập tay ${label}`}
                            maxLength={200}
                            placeholder="Tên màu thực nhận"
                            value={line.color}
                            disabled={disabled}
                            onChange={(e) => pick(line.sku, e.target.value)}
                          />
                        )}
                      </td>
                      {sizes.map((size) => {
                        const cell = line.cells[size];
                        const available = variants.some(
                          (v) =>
                            v.sku === line.sku &&
                            v.color === line.color &&
                            v.size === size,
                        );
                        return (
                          <td key={size} className="incoming-size-cell">
                            <input
                              aria-label={`${size} ${label}`}
                              type="number"
                              min="0"
                              max="1000000"
                              step="1"
                              disabled={disabled}
                              value={cell?.qty || ""}
                              placeholder="0"
                              title={
                                available
                                  ? "Để trống tính là 0"
                                  : "Vẫn nhập được; chưa có SKU/lệnh tương ứng sẽ lưu Chưa đối chiếu lệnh sau xác nhận"
                              }
                              onChange={(e) =>
                                patchCell(line, size, {
                                  qty:
                                    e.target.value === ""
                                      ? 0
                                      : Number(e.target.value),
                                })
                              }
                            />
                            {cell?.qty === null && (
                              <small className="orange-text">
                                Chưa kiểm tra
                              </small>
                            )}
                            {(cell?.qty || 0) > 0 && !cell?.variantId && (
                              <small className="orange-text">
                                Chưa có SKU/lệnh
                              </small>
                            )}
                          </td>
                        );
                      })}
                      <td className="incoming-line-total">{fmt(total)}</td>
                      <td>
                        <select
                          aria-label={`Cách nhận ${label}`}
                          value={
                            allAuto
                              ? "auto"
                              : allUnmatched
                                ? "unmatched"
                                : "manual"
                          }
                          disabled={disabled}
                          onChange={(e) => {
                            updateLine(line, (r) => ({
                              ...r,
                              allocationMode: e.target.value as
                                "auto" | "manual" | "unmatched",
                              orderId:
                                e.target.value === "manual" ? r.orderId : null,
                              excessOrderId: null,
                            }));
                            if (e.target.value === "manual")
                              setExpanded((s) => ({ ...s, [line.id]: true }));
                          }}
                        >
                          <option value="auto">Tự động cộng dồn</option>
                          <option value="unmatched">Chưa đối chiếu lệnh</option>
                          <option value="manual">
                            Chọn lệnh theo từng size
                          </option>
                        </select>
                        <button
                          aria-expanded={show}
                          onClick={() =>
                            setExpanded((s) => ({
                              ...s,
                              [line.id]: !s[line.id],
                            }))
                          }
                        >
                          Lệnh / giao dư theo size
                        </button>
                      </td>
                      <td>
                        <button
                          disabled={disabled}
                          onClick={() =>
                            onChange([
                              ...grouped,
                              ...newIncomingLine(
                                bag.id,
                                bag.label,
                                line.sku,
                                "",
                                variants,
                              ),
                            ])
                          }
                        >
                          Thêm màu cùng mã
                        </button>
                        <button
                          disabled={disabled}
                          onClick={() => {
                            const ids = new Set(cells.map((r) => r.id));
                            onChange(grouped.filter((r) => !ids.has(r.id)));
                          }}
                        >
                          Bỏ dòng màu
                        </button>
                      </td>
                    </tr>
                    {show && (
                      <tr className="incoming-size-details">
                        <td colSpan={9}>
                          <div className="incoming-size-order-grid">
                            {sizes.map((size) => {
                              const cell = line.cells[size];
                              if (!cell) return null;
                              const options = incomingOrders(
                                orders,
                                cell.variantId,
                              ).filter(
                                (o) => !supplier || o.supplier === supplier,
                              );
                              return (
                                <div key={size}>
                                  <strong>
                                    Size {size} · {fmt(cell.qty || 0)} sản phẩm
                                  </strong>
                                  <select
                                    aria-label={`Lệnh ${size} ${label}`}
                                    value={
                                      cell.allocationMode === "auto"
                                        ? "auto"
                                        : cell.allocationMode === "unmatched"
                                          ? "unmatched"
                                          : cell.orderId || ""
                                    }
                                    disabled={disabled}
                                    onChange={(e) =>
                                      patchCell(line, size, {
                                        allocationMode:
                                          e.target.value === "auto"
                                            ? "auto"
                                            : e.target.value === "unmatched"
                                              ? "unmatched"
                                              : "manual",
                                        orderId: ["auto", "unmatched"].includes(
                                          e.target.value,
                                        )
                                          ? null
                                          : e.target.value || null,
                                        excessOrderId: null,
                                      })
                                    }
                                  >
                                    <option value="">Chọn lệnh thủ công</option>
                                    <option value="auto">
                                      Tự động cộng dồn
                                    </option>
                                    <option value="unmatched">
                                      Chưa đối chiếu lệnh
                                    </option>
                                    {options.map((o) => {
                                      const i = o.items.find(
                                        (i) => i.variantId === cell.variantId,
                                      )!;
                                      return (
                                        <option key={o.id} value={o.id}>
                                          {o.code} · {o.supplier} · còn{" "}
                                          {Math.max(0, i.qty - i.received)}
                                        </option>
                                      );
                                    })}
                                  </select>
                                  {cell.orderId && (
                                    <button
                                      onClick={() => onOrder(cell.orderId!)}
                                    >
                                      Xem lệnh size {size}
                                    </button>
                                  )}
                                  {cell.allocationMode === "auto" && (
                                    <label>
                                      Nhận phần dư size {size}
                                      <select
                                        aria-label={`Lệnh nhận dư ${size} ${label}`}
                                        value={cell.excessOrderId || ""}
                                        disabled={disabled}
                                        onChange={(e) =>
                                          patchCell(line, size, {
                                            excessOrderId:
                                              e.target.value || null,
                                          })
                                        }
                                      >
                                        <option value="">
                                          Không tự gán hàng dư
                                        </option>
                                        {options
                                          .filter(
                                            (o) =>
                                              (includeDrafts ||
                                                o.status !== "Nháp") &&
                                              (includePaused ||
                                                o.status !== "Tạm dừng"),
                                          )
                                          .map((o) => (
                                            <option key={o.id} value={o.id}>
                                              {o.code} · {o.supplier}
                                            </option>
                                          ))}
                                      </select>
                                    </label>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>TỔNG PHIẾU</td>
            {sizes.map((size) => (
              <td key={size}>
                {fmt(
                  rows
                    .filter((r) => r.size === size)
                    .reduce((n, r) => n + (r.qty || 0), 0),
                )}
              </td>
            ))}
            <td>{fmt(rows.reduce((n, r) => n + (r.qty || 0), 0))}</td>
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
