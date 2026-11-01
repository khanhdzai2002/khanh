import { useState } from "react";
import {
  sizes,
  goodsTypes,
  type GoodsType,
  type Variant,
} from "../shared/domain";
import {
  productColorKey,
  type ProductProfile,
} from "../shared/product-profiles";
import type { ProductCatalogResult } from "../shared/product-catalog";
import { send } from "./api";
import { Field, Modal, Notice, type Run } from "./ui";
export function ProductCatalogEditor({
  product,
  initialColor,
  skus,
  run,
  busy,
  onClose,
  onSaved,
}: {
  product?: ProductProfile;
  initialColor?: string;
  skus: Variant[];
  run: Run;
  busy: boolean;
  onClose: () => void;
  onSaved: (result: ProductCatalogResult) => void;
}) {
  const [sku, setSku] = useState(product?.sku || ""),
    [name, setName] = useState(""),
    [colors, setColors] = useState(initialColor || ""),
    [goodsType, setGoodsType] = useState<GoodsType | null>(null),
    [validation, setValidation] = useState("");
  const present = (color: string, size: string) =>
    skus.some(
      (s) =>
        s.sku.toUpperCase() === sku.trim().toUpperCase() &&
        productColorKey(s.color) === productColorKey(color) &&
        s.size === size,
    );
  const [chosen, setChosen] = useState<string[]>(() =>
    initialColor
      ? sizes.filter(
          (s) =>
            !skus.some(
              (v) =>
                v.sku === product?.sku &&
                productColorKey(v.color) === productColorKey(initialColor) &&
                v.size === s,
            ),
        )
      : [...sizes],
  );
  const uniqueColors = [
    ...new Map(
      colors
        .split("\n")
        .map((c) => c.trim())
        .filter(Boolean)
        .map((c) => [productColorKey(c), c]),
    ).values(),
  ];
  const combos = uniqueColors.flatMap((color) =>
      chosen.map((size) => ({ color, size, exists: present(color, size) })),
    ),
    created = combos.filter((c) => !c.exists).length,
    skipped = combos.length - created;
  return (
    <Modal
      title={
        product
          ? initialColor
            ? "Thêm size · " + product.sku + " · " + initialColor
            : "Thêm SKU con · " + product.sku
          : "Thêm sản phẩm và SKU con"
      }
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setValidation("");
          if (
            !sku.trim() ||
            !uniqueColors.length ||
            uniqueColors.length > 100 ||
            !chosen.length
          ) {
            setValidation("Nhập mã, từ 1–100 màu và chọn ít nhất một size.");
            return;
          }
          void (async () => {
            let result: ProductCatalogResult | undefined;
            const ok = await run(async () => {
              result = await send(
                "/api/product-profiles/catalog",
                product
                  ? {
                      mode: "append",
                      productId: product.id,
                      colors: uniqueColors,
                      sizes: chosen,
                    }
                  : {
                      mode: "new",
                      sku,
                      name,
                      goodsType,
                      colors: uniqueColors,
                      sizes: chosen,
                    },
              );
            }, "Đã lưu danh mục sản phẩm");
            if (ok && result) onSaved(result);
          })();
        }}
      >
        <div className="form-grid">
          <Field label="Mã sản phẩm cần tạo">
            <input
              required
              maxLength={90}
              value={sku}
              disabled={busy}
              readOnly={!!product}
              placeholder="MIU15"
              onChange={(e) => setSku(e.target.value.toUpperCase())}
            />
          </Field>
          {!product && (
            <Field label="Tên sản phẩm mới">
              <input
                maxLength={300}
                disabled={busy}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          )}
        </div>
        {!product && (
          <Field label="Loại hàng mặc định sản phẩm mới">
            <select
              disabled={busy}
              value={goodsType || ""}
              onChange={(e) =>
                setGoodsType((e.target.value || null) as GoodsType | null)
              }
            >
              <option value="">Chưa thiết lập</option>
              {goodsTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Màu SKU con — mỗi màu một dòng">
          <textarea
            required
            readOnly={!!initialColor}
            disabled={busy}
            maxLength={20000}
            value={colors}
            placeholder={"Đen\nXám tiêu đậm"}
            onChange={(e) => setColors(e.target.value)}
          />
        </Field>
        <fieldset disabled={busy} className="catalog-size-options">
          <legend>Chọn size tạo SKU</legend>
          {sizes.map((size) => (
            <label key={size}>
              <input
                aria-label={"Tạo SKU size " + size}
                type="checkbox"
                checked={chosen.includes(size)}
                onChange={(e) =>
                  setChosen(
                    e.target.checked
                      ? [...chosen, size]
                      : chosen.filter((s) => s !== size),
                  )
                }
              />
              {size}
            </label>
          ))}
        </fieldset>
        <div className="catalog-preview">
          <strong>
            {created} SKU mới · {skipped} SKU đã có sẽ giữ nguyên
          </strong>
          {uniqueColors.slice(0, 100).map((color) => (
            <div key={productColorKey(color)}>
              <b>{color}</b>
              <div>
                {sizes
                  .filter((s) => chosen.includes(s))
                  .map((size) => (
                    <span
                      className={
                        "catalog-size-chip " +
                        (present(color, size) ? "existing" : "new")
                      }
                      key={size}
                    >
                      {size} · {present(color, size) ? "Đã có" : "Tạo mới"}
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
        <Notice>
          SKU mới mặc định Mở bán, chưa nhập tồn và chưa có số bán. SKU đã có
          giữ nguyên số liệu, ảnh và lịch sử; thao tác này chỉ bổ sung SKU còn
          thiếu.
        </Notice>
        {validation && (
          <div role="alert" className="form-error">
            {validation}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Đóng, không lưu
          </button>
          <button
            className="primary"
            disabled={
              busy ||
              !sku.trim() ||
              !uniqueColors.length ||
              !chosen.length ||
              uniqueColors.length > 100
            }
          >
            {product ? "Bổ sung SKU còn thiếu" : "Tạo sản phẩm và SKU"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
