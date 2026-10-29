import { useState } from "react";
import { Search, ImagePlus, Pencil } from "lucide-react";
import { goodsTypes, type GoodsType } from "../shared/domain";
import { type ProductProfile } from "../shared/product-profiles";
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
    [editing, setEditing] = useState<ProductProfile | null>(null);
  const rows = products.filter(
    (p) =>
      normalizeLabel(p.sku + " " + p.name).includes(normalizeLabel(search)) &&
      (!type || (type === "missing" ? !p.goodsType : p.goodsType === type)) &&
      (!missing || !p.imageUrl),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">DANH MỤC NHẬN DIỆN</div>
          <h1>Thiết lập sản phẩm</h1>
          <p>
            Ảnh và loại hàng mặc định theo mã, dùng chung cho mọi màu và size.
          </p>
        </div>
      </div>
      <div className="mini-kpis">
        <div>
          <small>Mã sản phẩm</small>
          <strong>{products.length}</strong>
        </div>
        <div>
          <small>Đã có ảnh</small>
          <strong>{products.filter((p) => p.imageUrl).length}</strong>
        </div>
        <div>
          <small>Chưa có ảnh</small>
          <strong>{products.filter((p) => !p.imageUrl).length}</strong>
        </div>
        <div>
          <small>Chưa chọn loại hàng</small>
          <strong>{products.filter((p) => !p.goodsType).length}</strong>
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
              placeholder="Tìm mã, tên sản phẩm…"
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
            Chưa có ảnh
          </label>
        </div>
        {rows.length ? (
          <div className="product-profile-grid">
            {rows.map((p) => (
              <article key={p.id} className="product-profile-card">
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
                    onClick={() => setEditing(p)}
                  >
                    <Pencil size={15} />
                    Thiết lập
                  </button>
                )}
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
          key={editing.id}
          product={editing}
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
  busy,
  run,
  onClose,
}: {
  product: ProductProfile;
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
  const src = image?.uri || (!removeImage ? product.imageUrl : null);
  return (
    <Modal title={"Thiết lập " + product.sku} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (uploading || busy) return;
          void run(
            () =>
              send(
                "/api/product-profiles/" + product.id,
                {
                  expectedVersion: product.version,
                  goodsType,
                  ...(image
                    ? { image: { name: image.name, data: image.data } }
                    : {}),
                  removeImage,
                },
                "PUT",
              ),
            "Đã lưu ảnh và loại hàng " + product.sku,
          ).then((ok) => {
            if (ok) onClose();
          });
        }}
      >
        <div className="product-profile-preview">
          {src ? (
            <img src={src} alt={"Ảnh xem trước " + product.sku} />
          ) : (
            <>
              <ImagePlus size={36} />
              <p>Chưa có ảnh sản phẩm</p>
            </>
          )}
        </div>
        <Field label={"Chọn ảnh cho " + product.sku}>
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
        {src && (
          <button
            type="button"
            disabled={busy || uploading}
            onClick={() => {
              setImage(null);
              setRemove(true);
            }}
          >
            Gỡ ảnh
          </button>
        )}
        {removeImage && product.imageUrl && (
          <button
            type="button"
            disabled={busy || uploading}
            onClick={() => setRemove(false)}
          >
            Giữ ảnh đang lưu
          </button>
        )}
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
        <p>
          Loại mặc định được gợi ý khi thêm sản phẩm vào lệnh mới. Loại hàng đã
          lưu trong lệnh cũ giữ nguyên; ảnh nhận diện hiển thị theo thiết lập
          hiện tại.
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
            Lưu thiết lập sản phẩm
          </button>
        </div>
      </form>
    </Modal>
  );
}
