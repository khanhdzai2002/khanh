import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, send, fileBase64 } from "./api";
import { Field, fmt, vnDate } from "./ui";
import {
  inspectionCategories,
  type InspectionImage,
  type InspectionTarget,
  type InspectionBundle,
} from "../shared/inspection-images";
export const inspectionUrl = (id: string) =>
  `/api/inspection-archive/images/${id}`;
export const inspectionSource = {
  manual: "Nhập thủ công",
  json: "Nhập JSON",
  direct: "Nhận tại lệnh",
};
const shortDate = (value: string) =>
  value ? value.split("-").reverse().join("/") : "Chưa ghi";
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(),
  );

export function InspectionViewer({
  image,
  onClose,
}: {
  image: InspectionImage;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [zoom, setZoom] = useState(100),
    [angle, setAngle] = useState(0),
    [ratio, setRatio] = useState(1);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="inspection-viewer"
      aria-label={"Phiếu kiểm: " + image.name}
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
        <div>
          <h2>{image.name}</h2>
          <p>
            {shortDate(image.inspectionDate)} · {image.code}
          </p>
        </div>
        <button type="button" onClick={onClose}>
          Đóng ảnh phiếu
        </button>
      </header>
      <div className="actions">
        <button
          type="button"
          disabled={zoom <= 50}
          onClick={() => setZoom((v) => v - 25)}
        >
          Thu nhỏ
        </button>
        <span>{zoom}%</span>
        <button
          type="button"
          disabled={zoom >= 300}
          onClick={() => setZoom((v) => v + 25)}
        >
          Phóng to
        </button>
        <button type="button" onClick={() => setAngle((v) => (v + 90) % 360)}>
          Xoay 90°
        </button>
        <a className="button" href={inspectionUrl(image.id) + "?download=1"}>
          Tải ảnh gốc
        </a>
      </div>
      <div className="inspection-viewer-canvas">
        <div
          className="incoming-photo-canvas"
          style={{
            width: zoom + "%",
            aspectRatio: angle % 180 ? 1 / ratio : ratio,
          }}
        >
          <img
            src={inspectionUrl(image.id)}
            alt={image.name}
            onLoad={(e) =>
              setRatio(
                e.currentTarget.naturalWidth / e.currentTarget.naturalHeight ||
                  1,
              )
            }
            style={{
              width: (angle % 180 ? ratio * 100 : 100) + "%",
              transform: `translate(-50%, -50%) rotate(${angle}deg)`,
            }}
          />
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
export function InspectionCard({
  image,
  onChanged,
  onOrder,
  onDraft,
}: {
  image: InspectionImage;
  onChanged: () => void;
  onOrder?: (id: string) => void;
  onDraft?: (id: string) => void;
}) {
  const [view, setView] = useState(false),
    [edit, setEdit] = useState(false),
    [date, setDate] = useState(image.inspectionDate),
    [category, setCategory] = useState(image.category),
    [note, setNote] = useState(image.note),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await send(
        inspectionUrl(image.id) + "/metadata",
        {
          expectedVersion: image.version,
          inspectionDate: date,
          category,
          note,
        },
        "PUT",
      );
      setEdit(false);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="inspection-card" data-inspection-image={image.id}>
      <button
        type="button"
        className="inspection-thumbnail"
        onClick={() => setView(true)}
        aria-label={"Xem phiếu " + image.name}
      >
        <img src={inspectionUrl(image.id)} alt={image.name} loading="lazy" />
      </button>
      <div className="inspection-card-body">
        <div className="inspection-card-date">
          <strong>{shortDate(image.inspectionDate)}</strong>
          <span className="badge">{image.category}</span>
        </div>
        <strong className="inspection-filename">{image.name}</strong>
        <p>
          {image.code} · {inspectionSource[image.source]} ·{" "}
          {image.state === "confirmed" ? "Đã ghi nhận" : "Nháp"}
        </p>
        <p>
          {image.supplier || "Chưa ghi nhà xưởng"} ·{" "}
          {image.products.join(", ") || "Chưa có mã sản phẩm"}
        </p>
        <small>
          {image.dateSource === "classified"
            ? "Ngày kiểm đã phân loại"
            : image.dateSource === "json"
              ? "Ngày kiểm từ JSON nguồn"
              : image.dateSource === "receipt"
                ? "Đang dùng ngày nhận hàng — chưa có ngày kiểm riêng"
                : "Đang dùng ngày tạo phiếu — chưa có ngày kiểm riêng"}
        </small>
        <small>
          {image.uploadedAt
            ? `Tải lên: ${vnDate(image.uploadedAt)} · ${image.uploader || ""}`
            : "Ảnh cũ: chưa có giờ tải riêng"}{" "}
          · {fmt(image.byteCount / 1024)} KB
        </small>
        {image.note && <p>{image.note}</p>}
        <div className="actions">
          <a className="button" href={inspectionUrl(image.id) + "?download=1"}>
            Tải ảnh
          </a>
          {image.canWrite && (
            <button
              type="button"
              onClick={() => {
                setDate(image.inspectionDate);
                setCategory(image.category);
                setNote(image.note);
                setEdit(!edit);
              }}
            >
              Phân loại ảnh
            </button>
          )}
          {onDraft && image.canOpenDraft && (
            <button type="button" onClick={() => onDraft(image.target.id)}>
              Mở phiếu nhập
            </button>
          )}
        </div>
        {onOrder && image.orders.length > 0 && (
          <div className="actions">
            {image.orders.map((o) => (
              <button key={o.id} type="button" onClick={() => onOrder(o.id)}>
                {o.code}
              </button>
            ))}
          </div>
        )}
        {edit && (
          <div className="inspection-classify">
            <Field label="Ngày kiểm của ảnh">
              <input
                type="date"
                value={date}
                disabled={busy}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Loại chứng từ của ảnh">
              <select
                value={category}
                disabled={busy}
                onChange={(e) => setCategory(e.target.value as typeof category)}
              >
                {inspectionCategories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Ghi chú ảnh">
              <textarea
                value={note}
                maxLength={1000}
                disabled={busy}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <div className="actions">
              <button
                type="button"
                className="primary"
                disabled={busy || !date}
                onClick={() => void save()}
              >
                Lưu phân loại ảnh
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEdit(false)}
              >
                Đóng phân loại
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {view && (
        <InspectionViewer image={image} onClose={() => setView(false)} />
      )}
    </article>
  );
}

export function InspectionAttachments({
  target,
  defaultDate,
  onChanged,
  disabled = false,
}: {
  target: InspectionTarget;
  defaultDate?: string;
  onChanged?: (bundle: InspectionBundle) => void;
  disabled?: boolean;
}) {
  const [bundle, setBundle] = useState<InspectionBundle | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [files, setFiles] = useState<File[]>([]),
    [date, setDate] = useState(defaultDate || today()),
    [category, setCategory] =
      useState<(typeof inspectionCategories)[number]>("Phiếu kiểm hàng"),
    [note, setNote] = useState("");
  const input = useRef<HTMLInputElement>(null),
    inFlight = useRef(false),
    current = useRef(target.kind + target.id),
    touched = useRef(false);
  current.current = target.kind + target.id;
  const path = `/api/inspection-archive/targets/${target.kind}/${target.id}`;
  useEffect(() => {
    let active = true;
    setBundle(null);
    setError("");
    setMessage("");
    setFiles([]);
    setDate(defaultDate || today());
    setNote("");
    touched.current = false;
    if (input.current) input.current.value = "";
    api<InspectionBundle>(path)
      .then((value) => {
        if (active) setBundle(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [path]);
  useEffect(() => {
    if (!touched.current && defaultDate) setDate(defaultDate);
  }, [defaultDate]);
  const reload = () => {
    void api<InspectionBundle>(path)
      .then((value) => {
        if (current.current === target.kind + target.id) {
          setBundle(value);
          onChanged?.(value);
        }
      })
      .catch((e) => setError(e.message));
  };
  const upload = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    const key = target.kind + target.id;
    try {
      if (
        !files.length ||
        files.length > 4 ||
        files.reduce((n, f) => n + f.size, 0) > 8 * 1024 * 1024
      )
        throw Error("Chọn 1–4 ảnh JPEG/PNG/WebP, tổng tối đa 8 MB mỗi lần");
      const images = await Promise.all(
        files.map(async (f) => ({ name: f.name, data: await fileBase64(f) })),
      );
      const value = await send<
        InspectionBundle & { added: number; skipped: number }
      >(path + "/images", { images, inspectionDate: date, category, note });
      if (current.current === key) {
        setBundle(value);
        setFiles([]);
        setNote("");
        if (input.current) input.current.value = "";
        setMessage(
          `Đã lưu ${value.added} ảnh${value.skipped ? `; ${value.skipped} ảnh đã có được giữ nguyên` : ""}. Số lượng hàng không thay đổi.`,
        );
        onChanged?.(value);
      }
    } catch (e) {
      if (current.current === key) setError((e as Error).message);
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };
  return (
    <section
      className="inspection-attachments"
      aria-label="Ảnh chứng từ của phiếu nhập"
    >
      <h3>
        Ảnh phiếu kiểm đính kèm {bundle ? `(${bundle.images.length})` : ""}
      </h3>
      <p>
        Lưu bổ sung ảnh gốc cho phiếu này, kể cả sau khi ghi nhận. Ảnh và biên
        nhận cũ được giữ nguyên.
      </p>
      {bundle?.canWrite && (
        <details className="inspection-upload" open={!bundle.images.length}>
          <summary>Thêm ảnh phiếu kiểm</summary>
          <fieldset disabled={busy || disabled}>
            <div className="form-grid">
              <Field label="Ngày kiểm trên phiếu">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    touched.current = true;
                    setDate(e.target.value);
                  }}
                />
              </Field>
              <Field label="Loại chứng từ">
                <select
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as typeof category)
                  }
                >
                  {inspectionCategories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Ảnh đính kèm bổ sung">
                <input
                  ref={input}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                />
              </Field>
            </div>
            <Field label="Ghi chú cho nhóm ảnh">
              <textarea
                value={note}
                maxLength={1000}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <p>
              Mỗi lần tối đa 4 ảnh / 8 MB; mỗi phiếu tối đa 40 ảnh / 80 MB. Ngày
              kiểm dùng để phân loại trong Kho ảnh phiếu kiểm.
            </p>
            <button
              type="button"
              className="primary"
              disabled={!files.length || !date}
              onClick={() => void upload()}
            >
              {busy ? "Đang lưu ảnh…" : "Lưu thêm ảnh phiếu kiểm"}
            </button>
          </fieldset>
        </details>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {!bundle && !error && <p>Đang tải ảnh đính kèm…</p>}
      {!!bundle?.images.length && (
        <details className="inspection-attached-list">
          <summary>Xem {bundle.images.length} ảnh đã lưu và phân loại</summary>
          <div className="inspection-grid">
            {bundle.images.map((i) => (
              <InspectionCard key={i.id} image={i} onChanged={reload} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
