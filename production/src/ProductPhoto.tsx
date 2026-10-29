import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageIcon, X } from "lucide-react";
import {
  productPhotoFor,
  type ProductProfile,
} from "../shared/product-profiles";
function PhotoViewer({
  src,
  sku,
  onClose,
}: {
  src: string;
  sku: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="product-photo-dialog"
      aria-label={"Ảnh sản phẩm " + sku}
      onKeyDown={(e) => e.stopPropagation()}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        <h2>{sku}</h2>
        <button type="button" aria-label="Đóng ảnh sản phẩm" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <img src={src} alt={"Ảnh sản phẩm " + sku} />
    </dialog>,
    document.body,
  );
}
export function ProductPhoto({
  products,
  sku,
  color,
}: {
  products: ProductProfile[];
  sku: string;
  color?: string;
}) {
  const [open, setOpen] = useState(false),
    [broken, setBroken] = useState(false);
  const photo = productPhotoFor(products, sku, color),
    src = photo.url,
    label = sku + (color ? " · " + color : "");
  useEffect(() => {
    setBroken(false);
  }, [src]);
  if (!src || broken)
    return (
      <span className="product-photo-empty" title={"Chưa có ảnh " + label}>
        <ImageIcon size={20} />
        <small>Chưa có ảnh</small>
      </span>
    );
  return (
    <>
      <button
        type="button"
        className="product-photo-button"
        aria-label={"Xem ảnh " + label}
        title={
          color
            ? (photo.source === "color"
                ? "Ảnh riêng: "
                : "Đang dùng ảnh chung: ") + label
            : "Ảnh chung: " + sku
        }
        data-photo-source={photo.source}
        onClick={() => setOpen(true)}
      >
        <img
          src={src}
          alt={"Ảnh " + label}
          loading="lazy"
          onError={() => setBroken(true)}
        />
        {color && photo.source === "common" && (
          <span className="product-photo-fallback">Ảnh chung</span>
        )}
      </button>
      {open && (
        <PhotoViewer src={src} sku={label} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
