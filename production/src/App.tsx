import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  ClipboardList,
  Factory,
  History,
  Trash2,
  ChartNoAxesCombined,
  Settings,
  Menu,
  RefreshCw,
  LogOut,
  ArrowUpRight,
  Boxes,
  PackageCheck,
  Clock,
  ChevronRight,
} from "lucide-react";
import { api, send, setCsrf } from "./api";
import { fmt, Empty, Notice, type Run } from "./ui";
import {
  can,
  forecast,
  totals,
  type Variant,
  type Policy,
  type ProductionOrder,
  type Role,
} from "../shared/domain";
import { Planning } from "./Planning";
import { Orders } from "./Orders";
import { Sales } from "./Sales";
import { SettingsPage } from "./Settings";
export type Snapshot = {
  skus: Variant[];
  orders: ProductionOrder[];
  policy: Policy;
  policyVersion: number;
};
const pages = [
  { id: "dashboard", name: "Tổng quan", icon: LayoutDashboard },
  { id: "planning", name: "Dự kiến sản xuất", icon: ClipboardList },
  { id: "orders", name: "Gối lệnh sản xuất", icon: Factory },
  { id: "history", name: "Lịch sử & giao nhận", icon: History },
  { id: "sales", name: "Phân tích bán hàng", icon: ChartNoAxesCombined },
  { id: "archived", name: "Lệnh đã xóa", icon: Trash2 },
  { id: "settings", name: "Cấu hình & dữ liệu", icon: Settings },
];
export default function App() {
  const [user, setUser] = useState<{
      id: string;
      name: string;
      role: Role;
    } | null>(null),
    [loading, setLoading] = useState(true),
    [data, setData] = useState<Snapshot | null>(null),
    [config, setConfig] = useState<any>({}),
    [page, setPage] = useState("dashboard"),
    [menu, setMenu] = useState(false),
    [error, setError] = useState(() => {
      const messages: Record<string, string> = {
        not_configured:
          "Backend chưa đủ cấu hình Lark. Hãy bổ sung biến môi trường theo hướng dẫn kết nối.",
        access_denied:
          "Tài khoản không thuộc tổ chức được phép hoặc đã bị khóa.",
        tenant_mismatch:
          "Tổ chức Lark không khớp cấu hình. Hãy dùng tài khoản thuộc đúng công ty; quản trị viên cần kiểm tra LARK_TENANT_KEY trong Railway → khanh → Variables bằng data.tenant_key của tổ chức công ty.",
        account_disabled:
          "Tài khoản đã bị vô hiệu hóa trong COMS-FLOW. Liên hệ Administrator để kiểm tra và mở lại nếu được phép.",
        login_expired:
          "Phiên đăng nhập đã hết hạn, đã dùng hoặc bạn chưa chấp thuận đăng nhập. Hãy thử lại.",
        provider_error:
          "Lark chưa xác thực được đăng nhập. Kiểm tra App ID, App Secret, Redirect URL và quyền ứng dụng.",
        login_failed:
          "Đăng nhập chưa hoàn tất. Hãy thử lại hoặc liên hệ quản trị viên.",
      };
      const url = new URL(location.href),
        code = url.searchParams.get("login_error");
      if (code) {
        url.searchParams.delete("login_error");
        window.history.replaceState(
          null,
          "",
          url.pathname + url.search + url.hash,
        );
      }
      return code ? messages[code] || messages.login_failed : "";
    }),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [draftFrom, setDraftFrom] = useState<Variant[]>([]),
    [development, setDevelopment] = useState(false);
  const refresh = useCallback(async () => {
    const [snapshot, orders] = await Promise.all([
      api<Snapshot>("/api/dashboard"),
      api<ProductionOrder[]>("/api/orders"),
    ]);
    setData({ ...snapshot, orders });
  }, []);
  const boot = useCallback(async () => {
    setLoading(true);
    try {
      setConfig(await api("/auth/config"));
      const me = await api("/api/me");
      setCsrf(me.csrf);
      setUser(me.user);
      setDevelopment(me.development);
      await refresh();
    } catch (e) {
      if (!(e instanceof Error && e.message === "Cần đăng nhập"))
        setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [refresh]);
  useEffect(() => {
    void boot();
  }, [boot]);
  const run: Run = async (task, message = "Đã lưu thay đổi") => {
    setBusy(true);
    setError("");
    try {
      await task();
      await refresh();
      setToast(message);
      setTimeout(() => setToast(""), 4000);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const navigate = (id: string) => {
    setPage(id);
    setMenu(false);
    setError("");
  };
  const logout = async () => {
    setBusy(true);
    setError("");
    try {
      await send("/auth/logout", {});
      setUser(null);
      setData(null);
      setSelected([]);
      setDraftFrom([]);
      setCsrf("");
      setToast("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (loading)
    return (
      <div className="loading">
        <img src="/cf.svg" alt="CF" />
        <p>Đang kết nối COMS-FLOW…</p>
      </div>
    );
  if (!user)
    return (
      <div className="login">
        <img src="/cf.svg" alt="CF" />
        <small>COMS-FLOW</small>
        <h1>Production Management</h1>
        <p>Quản trị đặt hàng · Gối hàng · Sản xuất</p>
        {error && <Notice>{error}</Notice>}
        <a
          className={
            "button primary " + (!config.larkConfigured ? "disabled" : "")
          }
          href="/auth/login"
        >
          Đăng nhập bằng Lark <ArrowUpRight size={16} />
        </a>
        {!config.larkConfigured && (
          <Notice>
            Lark chưa được cấu hình đầy đủ.{" "}
            {config.missing?.length
              ? `Backend thiếu: ${config.missing.join(", ")}. `
              : ""}
            {config.configurationError ||
              "Quản trị viên cần bổ sung cấu hình trong môi trường backend."}
          </Notice>
        )}
        {error && (
          <button
            onClick={() => {
              setError("");
              void boot();
            }}
          >
            Thử kết nối lại
          </button>
        )}
        {config.devAuth && (
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await send("/auth/dev", {});
                await boot();
              }, "Đã mở môi trường phát triển")
            }
          >
            Đăng nhập DEV (dữ liệu thử nghiệm)
          </button>
        )}
        <small>Ứng dụng nội bộ · Dữ liệu tập trung · Múi giờ Việt Nam</small>
      </div>
    );
  if (!data)
    return (
      <div className="login">
        <Notice>{error || "Không thể tải dữ liệu"}</Notice>
        <button onClick={() => void boot()}>Thử lại</button>
      </div>
    );
  const planner = can(user.role, "plan");
  return (
    <div className="app">
      <aside className={menu ? "open" : ""}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("dashboard");
          }}
        >
          <img src="/cf.svg" alt="CF" />
          <div>
            COMS-FLOW<small>PRODUCTION MANAGEMENT</small>
          </div>
        </a>
        <div className="nav-label">KHÔNG GIAN VẬN HÀNH</div>
        <nav>
          {pages.map((p) => (
            <button
              key={p.id}
              className={page === p.id ? "active" : ""}
              onClick={() => navigate(p.id)}
            >
              <p.icon size={19} />
              {p.name}
              {p.id === "history" && (
                <span className="nav-count">
                  {
                    data.orders.filter(
                      (o) => !o.deletedAt && totals(o).pending > 0,
                    ).length
                  }
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" /> PostgreSQL · Dữ liệu tập trung
          <small>Giờ vận hành: Việt Nam (UTC+7)</small>
        </div>
      </aside>
      <div className="workspace">
        <div className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu"
              aria-label="Mở điều hướng"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={20} />
            </button>
            <span>Không gian sản xuất</span>
            <ChevronRight size={14} />
            <strong>{pages.find((p) => p.id === page)?.name}</strong>
          </div>
          <div className="user-bar">
            <button
              title="Tải lại dữ liệu"
              aria-label="Tải lại dữ liệu"
              disabled={busy}
              onClick={() => void run(refresh, "Đã cập nhật dữ liệu")}
            >
              <RefreshCw size={16} />
            </button>
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <div>
              {user.name}
              <small>{user.role}</small>
            </div>
            <button
              aria-label="Đăng xuất"
              disabled={busy}
              onClick={() => void logout()}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
        <main aria-busy={busy}>
          {development && (
            <div className="dev-banner">
              MÔI TRƯỜNG PHÁT TRIỂN · Danh tính DEV không phải đăng nhập Lark ·
              Không nhập dữ liệu sản xuất thật
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Đóng thông báo">
                ×
              </button>
            </div>
          )}
          {toast && (
            <div className="toast" role="status">
              <PackageCheck size={18} />
              {toast}
            </div>
          )}
          {busy && (
            <div className="working" role="status">
              Đang xử lý…
            </div>
          )}
          {page === "dashboard" && (
            <Dashboard data={data} selected={selected} navigate={navigate} />
          )}
          {page === "planning" && (
            <Planning
              data={data}
              selected={selected}
              setSelected={setSelected}
              run={run}
              busy={busy}
              writable={planner}
              createOrder={() => {
                setDraftFrom(
                  data.skus.filter(
                    (s) =>
                      selected.includes(s.id) &&
                      forecast(s, data.policy).need > 0,
                  ),
                );
                navigate("orders");
              }}
            />
          )}
          {["orders", "history", "archived"].includes(page) && (
            <Orders
              data={data}
              page={page}
              actor={user}
              run={run}
              busy={busy}
              seed={draftFrom}
              clearSeed={() => setDraftFrom([])}
            />
          )}
          {page === "sales" && (
            <Sales
              run={run}
              writable={planner}
              busy={busy}
              navigate={navigate}
            />
          )}
          {page === "settings" && (
            <SettingsPage run={run} role={user.role} busy={busy} />
          )}
        </main>
        <footer className="app-footer">
          COMS-FLOW · Production Management{" "}
          <span>Chỉ quản trị đặt hàng, gối hàng và sản xuất</span>
        </footer>
      </div>
    </div>
  );
}
function Dashboard({
  data,
  selected,
  navigate,
}: {
  data: Snapshot;
  selected: string[];
  navigate: (s: string) => void;
}) {
  const [supplier, setSupplier] = useState(""),
    [sku, setSku] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const orders = data.orders.filter(
    (o) =>
      !o.deletedAt &&
      (!supplier || o.supplier === supplier) &&
      (!sku || o.items.some((i) => i.sku === sku)) &&
      (!from ||
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Ho_Chi_Minh",
        }).format(new Date(o.time)) >= from) &&
      (!to ||
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Ho_Chi_Minh",
        }).format(new Date(o.time)) <= to),
  );
  const skus = data.skus.filter((s) => !sku || s.sku === sku),
    today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date()),
    overdue = orders.filter(
      (o) => o.delivery && o.delivery < today && totals(o).pending > 0,
    ),
    priority = skus
      .map((s) => ({ ...s, result: forecast(s, data.policy) }))
      .filter((s) => s.result.need > 0)
      .sort((a, b) => b.result.need - a.result.need);
  const metrics = [
    {
      label: "Mã sản phẩm / SKU",
      value: new Set(skus.map((s) => s.sku)).size + " / " + skus.length,
      note: "Danh mục đang quản lý",
      icon: Boxes,
    },
    {
      label: "Tồn kho đã khai báo",
      value: fmt(skus.reduce((n, s) => n + (s.stock || 0), 0)),
      note: skus.filter((s) => s.stock === null).length + " SKU chưa nhập tồn",
      icon: PackageCheck,
    },
    {
      label: "Đề xuất gối hàng",
      value: fmt(priority.reduce((n, s) => n + s.result.need, 0)),
      note: "Theo chính sách và vòng đời",
      icon: ClipboardList,
    },
    {
      label: "Đã chọn sản xuất",
      value: fmt(
        skus
          .filter((s) => selected.includes(s.id))
          .reduce((n, s) => n + forecast(s, data.policy).need, 0),
      ),
      note: "Lựa chọn trong phiên hiện tại",
      icon: Factory,
    },
    {
      label: "Tổng đặt xưởng",
      value: fmt(orders.reduce((n, o) => n + totals(o).placed, 0)),
      note: "Lệnh hoạt động theo bộ lọc",
      icon: Factory,
    },
    {
      label: "Xưởng đã giao",
      value: fmt(orders.reduce((n, o) => n + totals(o).received, 0)),
      note: "Không tự cộng vào tồn kho",
      icon: PackageCheck,
    },
    {
      label: "Xưởng còn nợ",
      value: fmt(orders.reduce((n, o) => n + totals(o).pending, 0)),
      note:
        orders.filter((o) => totals(o).pending > 0).length +
        " lệnh chưa giao đủ",
      icon: Clock,
    },
    {
      label: "Lệnh quá hạn",
      value: String(overdue.length),
      note: "Còn chờ và đã quá ngày hẹn",
      icon: Clock,
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">TỔNG QUAN VẬN HÀNH</div>
          <h1>Bức tranh sản xuất</h1>
          <p>Theo dõi nhu cầu, tiến độ xưởng và những việc cần ưu tiên.</p>
        </div>
        <button className="primary" onClick={() => navigate("planning")}>
          Mở kế hoạch sản xuất <ArrowUpRight size={16} />
        </button>
      </div>
      <div className="filterbar">
        <label>
          Mã sản phẩm
          <select value={sku} onChange={(e) => setSku(e.target.value)}>
            <option value="">Tất cả mã</option>
            {[...new Set(data.skus.map((s) => s.sku))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Nhà xưởng
          <select
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
          >
            <option value="">Tất cả xưởng</option>
            {[...new Set(data.orders.map((o) => o.supplier))].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Từ ngày lệnh
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          Đến ngày lệnh
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <div className="kpis">
        {metrics.map((m, i) => (
          <section className={"kpi " + (i === 2 ? "accent" : "")} key={m.label}>
            <div>
              {m.label}
              <m.icon size={19} />
            </div>
            <strong>{m.value}</strong>
            <small>{m.note}</small>
          </section>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Ưu tiên gối hàng</h2>
              <p>Nhu cầu theo SKU · Không bao gồm sản phẩm dừng gối</p>
            </div>
            <button onClick={() => navigate("planning")}>Xem kế hoạch →</button>
          </div>
          {priority.length ? (
            <div className="ranking">
              {priority.slice(0, 6).map((s, i) => (
                <div key={s.id}>
                  <span className="rank">{String(i + 1).padStart(2, "0")}</span>
                  <div className="rank-info">
                    <strong>
                      {s.sku} <small>{s.size}</small>
                    </strong>
                    <span>{s.color}</span>
                    <div className="bar">
                      <i
                        style={{
                          width:
                            (s.result.need / priority[0].result.need) * 100 +
                            "%",
                        }}
                      />
                    </div>
                  </div>
                  <b>
                    {fmt(s.result.need)} <small>sp</small>
                  </b>
                </div>
              ))}
            </div>
          ) : (
            <Empty>Thêm SKU và dữ liệu bán hàng để bắt đầu lập kế hoạch.</Empty>
          )}
        </section>
        <section className="panel">
          <div className="panel-title">
            <div>
              <h2>Cảnh báo giao hàng</h2>
              <p>Các lệnh quá hạn còn chờ xưởng giao</p>
            </div>
            <span className="badge red">{overdue.length} lệnh</span>
          </div>
          {overdue.length ? (
            <div className="alerts">
              {overdue.map((o) => (
                <button key={o.id} onClick={() => navigate("history")}>
                  <div>
                    <strong>{o.code}</strong>
                    <span>
                      {o.supplier} · Hẹn {o.delivery}
                    </span>
                  </div>
                  <b>{fmt(totals(o).pending)} sp</b>
                </button>
              ))}
            </div>
          ) : (
            <Empty>Không có lệnh quá hạn trong phạm vi đang xem.</Empty>
          )}
        </section>
      </div>
      <Notice>
        Ngày mục tiêu {data.policy.targetDays} ·{" "}
        {data.policy.includeLead ? "Có" : "Không"} cộng ngày chờ · An toàn{" "}
        {data.policy.safeDays} · Bội số {data.policy.roundTo}. Bộ lọc ngày/xưởng
        áp dụng cho lệnh; chỉ số tồn và dự báo thể hiện dữ liệu hiện tại theo mã
        sản phẩm.
      </Notice>
    </>
  );
}
