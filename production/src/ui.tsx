import type { ReactNode } from "react";
import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  createContext,
  useContext,
  useRef,
  useEffect,
} from "react";
import { X, PackageOpen, AlertTriangle } from "lucide-react";
export const ActionFeedback = createContext({
  error: "",
  busy: false,
  clearError: () => {},
});
export const fmt = (n: number) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(n);
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <PackageOpen size={38} />
      <strong>Chưa có dữ liệu</strong>
      <p>{children}</p>
    </div>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice">
      <AlertTriangle size={17} />
      <span>{children}</span>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const feedback = useContext(ActionFeedback);
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = () => {
    if (!feedback.busy) onClose();
  };
  useEffect(() => {
    feedback.clearError();
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current
      ?.querySelector<HTMLElement>("button,input,select,textarea,a[href]")
      ?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = [
        ...(dialog.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        ) || []),
      ].filter((e) => e.offsetParent !== null);
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) close.current();
      }}
    >
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"modal " + (wide ? "wide" : "")}
      >
        <header>
          <h2>{title}</h2>
          <button
            type="button"
            aria-label="Đóng"
            disabled={feedback.busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {feedback.error && (
          <div className="dialog-feedback" role="alert">
            {feedback.error}
          </div>
        )}
        {children}
      </section>
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const generated = useId();
  const nodes = Children.toArray(children);
  const control = nodes.find(
    (node) =>
      isValidElement(node) &&
      typeof node.type === "string" &&
      ["input", "select", "textarea"].includes(node.type),
  );
  const id = isValidElement<{ id?: string }>(control)
    ? control.props.id || generated
    : generated;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {nodes.map((node) =>
        node === control && isValidElement<{ id?: string }>(node)
          ? cloneElement(node, { id })
          : node,
      )}
    </div>
  );
}
export const vnDate = (value: string) =>
  value
    ? new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
    : "—";
export const localTime = (value: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(value))
    .replace(" ", "T");
export type Run = (
  task: () => Promise<unknown>,
  success?: string,
) => Promise<boolean>;
