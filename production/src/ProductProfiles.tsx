import { useState } from "react";
import { Search, ImagePlus, Pencil } from "lucide-react";
import { goodsTypes, type GoodsType } from "../shared/domain";
import {
  type ProductProfile,
  type ProductColorProfile,
} from "../shared/product-profiles";
import { normalizeLabel } from "../shared/incoming-goods";
import { send } from "./api";
import { Empty, Modal, Field, Notice, type Run } from "./ui";
import { ProductPhoto } from "./ProductPhoto";
async function prepareImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error(
      "Chọn ảnh JPEG, PNG hoặc WebP. HEIC cần chuyển thành ảnh trước.",
    );
  if (file.size > 20 * 1024 * 1024)
    throw Error("Ảnh gốc tối đa 20 MB. Chọn ảnh nhỏ hơn trước khi tải.");
  const source = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(Error("Không đọc được file ảnh"));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () =>
      reject(Error("File không phải ảnh hợp lệ hoặc trình duyệt chưa hỗ trợ"));
    i.src = source;
  });
  if (
    !img.naturalWidth ||
    !img.naturalHeight ||
    img.naturalWidth * img.naturalHeight > 50000000
  )
    throw Error(
      "Ảnh quá lớn hoặc không hợp lệ. Chọn ảnh nhỏ hơn 50 megapixel.",
    );
  const scale = Math.min(
      1,
      1600 / Math.max(img.naturalWidth, img.naturalHeight),
    ),
    canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Trình duyệt chưa hỗ trợ tối ưu ảnh");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let uri = canvas.toDataURL("image/jpeg", 0.85);
  if (uri.length > 2796300) uri = canvas.toDataURL("image/jpeg", 0.65);
  if (uri.length > 2796300)
    throw Error("Ảnh sau tối ưu vẫn quá 2 MB. Chọn ảnh gọn hơn.");
  return {
    name:
      (file.name.replace(/\.[^.]+$/, "").slice(0, 240) || "san-pham") + ".jpg",
    data: uri.split(",")[1],
    uri,
  };
}
export function ProductProfiles({
  products,
  writable,
  busy,
  run,
}: {
  products: ProductProfile[];
  writable: boolean;
  busy: boolean;
  run: Run;
}) {
  const [search, setSearch] = useState(""),
    [type, setType] = useState(""),
    [missing, setMissing] = useState(false),
    [missingColor, setMissingColor] = useState(false),
    [editing, setEditing] = useState<{
      product: ProductProfile;
      color?: ProductColorProfile;
    } | null>(null);
  const rows = products.filter(
    (p) =>
      normalizeLabel(
        p.sku +
          " " +
          p.name +
          " " +
          (p.colors || []).map((c) => c.color).join(" "),
      ).includes(normalizeLabel(search)) &&
      (!type || (type === "missing" ? !p.goodsType : p.goodsType === type)) &&
      (!missing || !p.imageUrl) &&
      (!missingColor || (p.colors || []).some((c) => !c.imageUrl)),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DANH MỤC NHẬN DIỆN</div>
          <h1>Thiết lập sản phẩm</h1>
          <p>
            Ảnh chung theo mã và ảnh riêng theo từng màu; mỗi ảnh màu dùng chung
            cho các size.
          </p>
        </div>
      </div>
      <div className="mini-kpis">
        <div>
          <small>Mã sản phẩm</small>
          <strong>{products.length}</strong>
        </div>
        <div>
          <small>Mã có ảnh chung</small>
          <strong>{products.filter((p) => p.imageUrl).length}</strong>
        </div>
        <div>
          <small>Màu có ảnh riêng</small>
          <strong>
            {
              products.flatMap((p) => p.colors || []).filter((c) => c.imageUrl)
                .length
            }
          </strong>
        </div>
        <div>
          <small>Màu chưa có ảnh riêng</small>
          <strong>
            {
              products.flatMap((p) => p.colors || []).filter((c) => !c.imageUrl)
                .length
            }
          </strong>
        </div>
      </div>
      {!writable && (
        <Notice>
          Bạn có thể xem ảnh và loại hàng. Administrator hoặc Production Planner
          được chỉnh sửa thiết lập.
        </Notice>
      )}
      <section className="panel">
        <div className="toolbar">
          <div className="search">
            <Search size={17} />
            <input
              aria-label="Tìm mã thiết lập sản phẩm"
              placeholder="Tìm mã, tên sản phẩm, màu…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Lọc loại hàng sản phẩm"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">Tất cả loại hàng</option>
            {goodsTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
            <option value="missing">Chưa thiết lập loại</option>
          </select>
          <label>
            <input
              type="checkbox"
              checked={missing}
              onChange={(e) => setMissing(e.target.checked)}
            />{" "}
            Chưa có ảnh chung
          </label>
          <label>
            <input
              type="checkbox"
              checked={missingColor}
              onChange={(e) => setMissingColor(e.target.checked)}
            />{" "}
            Có màu chưa có ảnh riêng
          </label>
        </div>
        {rows.length ? (
          <div className="product-profile-grid">
            {rows.map((p) => (
              <article key={p.id} className="product-profile-card">
                <div className="product-profile-main">
                  <ProductPhoto products={products} sku={p.sku} />
                  <div>
                    <h3>{p.sku}</h3>
                    <p>{p.name || "Chưa có tên mô tả"}</p>
                    <span
                      className={
                        "badge " + (p.goodsType === "In" ? "orange" : "")
                      }
                    >
                      {p.goodsType || "Chưa thiết lập loại"}
                    </span>
                  </div>
                  {writable && (
                    <button
                      disabled={busy}
                      aria-label={"Thiết lập " + p.sku}
                      onClick={() => setEditing({ product: p })}
                    >
                      <Pencil size={15} />
                      Ảnh chung / loại
                    </button>
                  )}
                </div>
                <details
                  className="product-color-photos"
                  open={
                    missingColor ||
                    (!!search &&
                      !normalizeLabel(p.sku + " " + p.name).includes(
                        normalizeLabel(search),
                      ))
                      ? true
                      : undefined
                  }
                >
                  <summary>
                    Ảnh theo màu (
                    {(p.colors || []).filter((c) => c.imageUrl).length}/
                    {(p.colors || []).length} đã có ảnh riêng)
                  </summary>
                  {(p.colors || []).length ? (
                    <div className="product-color-grid">
                      {(p.colors || [])
                        .filter(
                          (c) =>
                            (!missingColor || !c.imageUrl) &&
                            (!search ||
                              normalizeLabel(p.sku + " " + p.name).includes(
                                normalizeLabel(search),
                              ) ||
                              normalizeLabel(c.color).includes(
                                normalizeLabel(search),
                              )),
                        )
                        .map((c) => (
                          <div className="product-color-card" key={c.key}>
                            <ProductPhoto
                              products={products}
                              sku={p.sku}
                              color={c.color}
                            />
                            <div>
                              <strong>{c.color}</strong>
                              <small>
                                {c.imageUrl
                                  ? "Đã có ảnh riêng"
                                  : p.imageUrl
                                    ? "Chưa có ảnh riêng · đang dùng ảnh chung"
                                    : "Chưa có ảnh"}
                              </small>
                            </div>
                            {writable && (
                              <button
                                disabled={busy}
                                aria-label={
                                  "Thiết lập ảnh " + p.sku + " · " + c.color
                                }
                                onClick={() =>
                                  setEditing({ product: p, color: c })
                                }
                              >
                                <ImagePlus size={15} />
                                Ảnh màu
                              </button>
                            )}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p>
                      Chưa có màu trong danh mục. Thêm SKU hoặc lưu lệnh mới để
                      thiết lập ảnh màu.
                    </p>
                  )}
                </details>
              </article>
            ))}
          </div>
        ) : (
          <Empty>
            {products.length
              ? "Không có mã phù hợp bộ lọc."
              : "Chưa có mã sản phẩm. Thêm SKU tại Dự kiến sản xuất hoặc lưu lệnh có mã mới trước."}
          </Empty>
        )}
      </section>
      {editing && (
        <ProfileEditor
          key={editing.product.id + ":" + (editing.color?.key || "common")}
          product={editing.product}
          color={editing.color}
          busy={busy}
          run={run}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
function ProfileEditor({
  product,
  color,
  busy,
  run,
  onClose,
}: {
  product: ProductProfile;
  color?: ProductColorProfile;
  busy: boolean;
  run: Run;
  onClose: () => void;
}) {
  const [goodsType, setType] = useState<GoodsType | null>(product.goodsType),
    [image, setImage] = useState<{
      name: string;
      data: string;
      uri: string;
    } | null>(null),
    [removeImage, setRemove] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const current = color || product,
    label = product.sku + (color ? " · " + color.color : "");
  const src =
    image?.uri ||
    (!removeImage ? current.imageUrl : null) ||
    (color ? product.imageUrl : null);
  return (
    <Modal title={"Thiết lập " + label} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (uploading || busy) return;
          void run(
            () =>
              send(
                "/api/product-profiles/" +
                  product.id +
                  (color ? "/colors" : ""),
                {
                  expectedVersion: current.version,
                  ...(color ? { color: color.color } : { goodsType }),
                  ...(image
                    ? { image: { name: image.name, data: image.data } }
                    : {}),
                  removeImage,
                },
                "PUT",
              ),
            color
              ? "Đã lưu ảnh màu " + label
              : "Đã lưu ảnh và loại hàng " + product.sku,
          ).then((ok) => {
            if (ok) onClose();
          });
        }}
      >
        <div className="product-profile-preview">
          {src ? (
            <img src={src} alt={"Ảnh xem trước " + label} />
          ) : (
            <>
              <ImagePlus size={36} />
              <p>Chưa có ảnh sản phẩm</p>
            </>
          )}
        </div>
        {color && !image && (removeImage || !color.imageUrl) && (
          <Notice>
            {product.imageUrl
              ? "Màu này đang dùng ảnh chung của mã. Tải ảnh để thiết lập ảnh riêng cho đúng màu."
              : "Màu này chưa có ảnh riêng. Chọn ảnh đúng phân loại màu bên dưới."}
          </Notice>
        )}
        <Field label={"Chọn ảnh cho " + label}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy || uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setError("");
              setUploading(true);
              void prepareImage(file)
                .then((v) => {
                  setImage(v);
                  setRemove(false);
                })
                .catch((e) => setError(e.message))
                .finally(() => setUploading(false));
            }}
          />
        </Field>
        <small>
          Ảnh được tối ưu tối đa 1.600 px, lưu JPEG tối đa 2 MB. Bấm Lưu để áp
          dụng.
        </small>
        {uploading && <p role="status">Đang tối ưu ảnh…</p>}
        {(image || (!removeImage && current.imageUrl)) && (
          <button
            type="button"
            disabled={busy || uploading}
            onClick={() => {
              setImage(null);
              setRemove(true);
            }}
          >
            {color ? "Gỡ ảnh riêng" : "Gỡ ảnh"}
          </button>
        )}
        {removeImage && current.imageUrl && (
          <button
            type="button"
            disabled={busy || uploading}
            onClick={() => setRemove(false)}
          >
            Giữ ảnh đang lưu
          </button>
        )}
        {!color && (
          <Field label={"Loại hàng mặc định " + product.sku}>
            <select
              disabled={busy}
              value={goodsType || ""}
              onChange={(e) =>
                setType((e.target.value || null) as GoodsType | null)
              }
            >
              <option value="">Chưa thiết lập</option>
              {goodsTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
        )}
        <p>
          {color
            ? "Ảnh riêng dùng cho đúng mã và màu này ở mọi size. Gỡ ảnh riêng sẽ dùng lại ảnh chung của mã, nếu có."
            : "Loại mặc định được gợi ý khi thêm sản phẩm vào lệnh mới. Loại hàng đã lưu trong lệnh cũ giữ nguyên; ảnh chung được dùng cho màu chưa có ảnh riêng."}
        </p>
        {error && (
          <div className="form-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Đóng, không lưu
          </button>
          <button className="primary" disabled={busy || uploading}>
            {color ? "Lưu ảnh màu" : "Lưu thiết lập sản phẩm"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
