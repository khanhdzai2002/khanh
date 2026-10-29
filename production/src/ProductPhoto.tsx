import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageIcon, X } from "lucide-react";
import { productFor, type ProductProfile } from "../shared/product-profiles";
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
}: {
  products: ProductProfile[];
  sku: string;
}) {
  const [open, setOpen] = useState(false),
    [broken, setBroken] = useState(false);
  const product = productFor(products, sku),
    src = product?.imageUrl;
  useEffect(() => {
    setBroken(false);
  }, [src]);
  if (!src || broken)
    return (
      <span className="product-photo-empty" title={"Chưa có ảnh " + sku}>
        <ImageIcon size={20} />
        <small>Chưa có ảnh</small>
      </span>
    );
  return (
    <>
      <button
        type="button"
        className="product-photo-button"
        aria-label={"Xem ảnh " + sku}
        onClick={() => setOpen(true)}
      >
        <img
          src={src}
          alt={"Ảnh " + sku}
          loading="lazy"
          onError={() => setBroken(true)}
        />
      </button>
      {open && (
        <PhotoViewer src={src} sku={sku} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
