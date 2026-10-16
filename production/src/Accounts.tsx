import { useCallback, useEffect, useState } from "react";
import { UserPlus, RefreshCw, ShieldCheck, Search } from "lucide-react";
import { api, send } from "./api";
import { can, roles, type Role } from "../shared/domain";
import { Empty, Field, Modal, Notice, vnDate, type Run } from "./ui";

type Member = {
  id: string;
  name: string;
  open_id: string;
  role: Role;
  disabled: boolean;
  version: number;
  last_login_at: string | null;
};
const descriptions: Record<Role, string> = {
  Administrator: "Toàn quyền vận hành và quản lý tài khoản.",
  "Production Planner":
    "Quản lý SKU, dự báo, nhập bán hàng, tạo/sửa và khôi phục lệnh.",
  "Warehouse Operator": "Xem lệnh và ghi nhận hàng xưởng giao.",
  Manager: "Xem báo cáo và theo dõi sản xuất. Quy trình phê duyệt chưa bật.",
  Viewer: "Chỉ xem dữ liệu được phép, không ghi hoặc thay đổi quyền.",
};
const memberState = (u: Member) =>
  u.disabled ? "locked" : u.last_login_at ? "active" : "pending";
export function AccountsPage({
  role,
  busy,
  run,
  onSetup,
}: {
  role: Role;
  busy: boolean;
  run: Run;
  onSetup?: () => void;
}) {
  const admin = role === "Administrator";
  const [members, setMembers] = useState<Member[]>([]),
    [history, setHistory] = useState<any[]>([]),
    [account, setAccount] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [tab, setTab] = useState("members"),
    [search, setSearch] = useState(""),
    [roleFilter, setRoleFilter] = useState(""),
    [stateFilter, setStateFilter] = useState(""),
    [editing, setEditing] = useState<Member | "new" | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const own = await api("/api/account");
      setAccount(own);
      if (admin) {
        const [people, events] = await Promise.all([
          api<Member[]>("/api/users"),
          api<any[]>("/api/users/activity"),
        ]);
        setMembers(people);
        setHistory(events);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [admin]);
  useEffect(() => {
    void load();
  }, [load]);
  const filtered = members.filter(
    (u) =>
      (!roleFilter || u.role === roleFilter) &&
      (!stateFilter || memberState(u) === stateFilter) &&
      (!search ||
        `${u.name} ${u.open_id}`
          .toLocaleLowerCase("vi")
          .includes(search.toLocaleLowerCase("vi"))),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">QUẢN TRỊ TRUY CẬP</div>
          <h1>Thiết lập tài khoản</h1>
          <p>Thành viên Lark, vai trò và lịch sử phân quyền của tổ chức.</p>
        </div>
        <div className="actions">
          <button disabled={loading || busy} onClick={() => void load()}>
            <RefreshCw size={16} />
            Tải lại danh sách
          </button>
          {admin && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => setEditing("new")}
            >
              <UserPlus size={16} />
              Thêm thành viên
            </button>
          )}
        </div>
      </div>
      {error && <Notice>{error}</Notice>}
      {!admin && (
        <section className="panel padded">
          <h2>Tài khoản của tôi</h2>
          <p>
            {account?.name} · <strong>{role}</strong>
          </p>
          <Field label="Lark Open ID của tôi">
            <input value={account?.openId || ""} readOnly />
          </Field>
          <Notice>
            Chỉ Administrator được thêm thành viên hoặc thay đổi quyền.{" "}
            {descriptions[role]}
          </Notice>
          {onSetup && (
            <button onClick={onSetup}>
              Xem hướng dẫn quản trị viên đầu tiên
            </button>
          )}
        </section>
      )}
      {admin && (
        <>
          <div className="mini-kpis">
            {[
              ["Thành viên", members.length],
              [
                "Admin được cấp quyền",
                members.filter((u) => u.role === "Administrator" && !u.disabled)
                  .length,
              ],
              [
                "Chưa đăng nhập Lark",
                members.filter((u) => !u.last_login_at && !u.disabled).length,
              ],
              ["Đã khóa", members.filter((u) => u.disabled).length],
            ].map(([name, value]) => (
              <div key={name}>
                <small>{name}</small>
                <strong>{loading ? "—" : value}</strong>
              </div>
            ))}
          </div>
          <div className="tabs">
            {[
              ["members", "Thành viên"],
              ["permissions", "Vai trò & quyền"],
              ["history", "Lịch sử phân quyền"],
            ].map(([id, title]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
              >
                {title}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="loading">
              <p>Đang tải tài khoản…</p>
            </div>
          ) : tab === "members" ? (
            <section className="panel">
              <div className="toolbar">
                <label className="search-box">
                  <Search size={16} />
                  <input
                    aria-label="Tìm thành viên"
                    placeholder="Tìm tên hoặc Open ID…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Lọc vai trò"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <option value="">Tất cả vai trò</option>
                  {roles.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <select
                  aria-label="Lọc trạng thái tài khoản"
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="active">Đã đăng nhập Lark</option>
                  <option value="pending">Chưa đăng nhập Lark</option>
                  <option value="locked">Đã khóa</option>
                </select>
              </div>
              <Notice>
                Thêm ở đây là cấp quyền trong COMS-FLOW cho một danh tính Lark
                đã có. Chọn đúng Open ID của nhân viên; ứng dụng chưa gửi lời
                mời hoặc tạo tài khoản trong Lark. Nhân viên có thể đăng nhập
                COMS-FLOW lần đầu với quyền Viewer, rồi bạn thiết lập quyền ngay
                trong danh sách. Open ID phải thuộc đúng ứng dụng Lark đang kết
                nối.
              </Notice>
              {filtered.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Thành viên / Open ID</th>
                        <th>Vai trò</th>
                        <th>Truy cập</th>
                        <th>Lần đăng nhập Lark gần nhất</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <strong>
                              {u.name}
                              {u.id === account?.id ? " (Tôi)" : ""}
                            </strong>
                            <small className="account-identifier">
                              {u.open_id}
                            </small>
                          </td>
                          <td>
                            <span className="badge">{u.role}</span>
                          </td>
                          <td>
                            <span
                              className={
                                "badge " + (u.disabled ? "red" : "orange")
                              }
                            >
                              {u.disabled
                                ? "Đã khóa"
                                : u.last_login_at
                                  ? "Đang hoạt động"
                                  : "Chưa đăng nhập Lark"}
                            </span>
                          </td>
                          <td>{vnDate(u.last_login_at || "")}</td>
                          <td>
                            <button
                              disabled={busy}
                              onClick={() => setEditing(u)}
                            >
                              Thiết lập quyền
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty>Không có thành viên phù hợp bộ lọc.</Empty>
              )}
            </section>
          ) : tab === "permissions" ? (
            <RoleMatrix />
          ) : (
            <section className="panel">
              <div className="panel-title">
                <h2>200 thay đổi quyền gần nhất</h2>
              </div>
              {history.length ? (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Thời gian</th>
                        <th>Người thực hiện</th>
                        <th>Thành viên</th>
                        <th>Thay đổi</th>
                        <th>Lý do / nguồn</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id}>
                          <td>{vnDate(h.at)}</td>
                          <td>{h.actor}</td>
                          <td>{h.member}</td>
                          <td>
                            {h.details.before?.role ||
                              (h.action === "user.create"
                                ? "Thêm mới"
                                : "Không có snapshot")}{" "}
                            → {h.details.after?.role || h.details.role || "—"}
                            <small>
                              {h.details.after?.disabled === true
                                ? "Khóa truy cập"
                                : h.details.before?.disabled === true
                                  ? "Mở lại truy cập"
                                  : ""}
                            </small>
                          </td>
                          <td>
                            {h.details.reason ||
                              (h.action === "user.create"
                                ? "Thêm thành viên vào COMS-FLOW"
                                : "Khởi tạo quyền qua người vận hành")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty>Chưa có thay đổi quyền.</Empty>
              )}
            </section>
          )}
        </>
      )}
      {!admin && <RoleMatrix />}
      {editing && (
        <MemberEditor
          member={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            const selected = editing;
            const ok = await run(
              async () => {
                if (selected === "new") await send("/api/users", body);
                else await send("/api/users/" + selected.id, body, "PUT");
                if (selected !== "new" && selected.id === account?.id) {
                  window.location.reload();
                  return;
                }
                setEditing(null);
                await load();
              },
              selected === "new"
                ? "Đã thêm thành viên vào COMS-FLOW. Chưa gửi lời mời Lark."
                : "Đã cập nhật quyền truy cập",
            );
            return ok;
          }}
        />
      )}
    </>
  );
}
function RoleMatrix() {
  const actions = [
    ["read", "Xem dữ liệu"],
    ["plan", "SKU, dự báo, bán hàng"],
    ["order", "Tạo/sửa lệnh"],
    ["receive", "Ghi nhận hàng"],
    ["archive", "Xóa mềm/khôi phục"],
    ["admin", "Quản lý tài khoản"],
  ];
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>
          <ShieldCheck size={17} /> Vai trò & quyền
        </h2>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Vai trò</th>
              {actions.map(([id, title]) => (
                <th key={id}>{title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r}>
                <td>
                  <strong>{r}</strong>
                  <small>{descriptions[r]}</small>
                </td>
                {actions.map(([id]) => (
                  <td key={id}>{can(r, id) ? "Có" : "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function MemberEditor({
  member,
  busy,
  onClose,
  onSave,
}: {
  member: Member | "new";
  busy: boolean;
  onClose: () => void;
  onSave: (body: unknown) => Promise<boolean>;
}) {
  const creating = member === "new";
  const [name, setName] = useState(creating ? "" : member.name),
    [openId, setOpenId] = useState(""),
    [role, setRole] = useState<Role>(creating ? "Viewer" : member.role),
    [disabled, setDisabled] = useState(creating ? false : member.disabled),
    [reason, setReason] = useState("");
  const changed =
    creating || role !== member.role || disabled !== member.disabled;
  return (
    <Modal
      title={
        creating
          ? "Thêm thành viên Lark vào COMS-FLOW"
          : "Thiết lập quyền thành viên"
      }
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(
            creating
              ? { name, openId, role }
              : { role, disabled, expectedVersion: member.version, reason },
          );
        }}
      >
        <div className="form-grid">
          <Field label="Tên thành viên">
            <input
              required
              maxLength={200}
              value={name}
              readOnly={!creating}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Lark Open ID">
            <input
              required
              value={creating ? openId : member.open_id}
              readOnly={!creating}
              maxLength={256}
              onChange={(e) => setOpenId(e.target.value)}
              placeholder="Sao chép từ tài khoản Lark đúng nhân viên"
            />
          </Field>
          <Field label="Vai trò">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {roles.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          {!creating && (
            <Field label="Truy cập">
              <select
                value={disabled ? "locked" : "active"}
                onChange={(e) => setDisabled(e.target.value === "locked")}
              >
                <option value="active">Cho phép đăng nhập</option>
                <option value="locked">Khóa tài khoản</option>
              </select>
            </Field>
          )}
          {!creating && (
            <Field label="Lý do thay đổi">
              <textarea
                required
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ví dụ: Phân công phụ trách kế hoạch sản xuất"
              />
            </Field>
          )}
        </div>
        <Notice>
          {descriptions[role]}{" "}
          {creating
            ? "Thành viên phải đăng nhập bằng đúng tài khoản Lark. Tên sẽ được cập nhật từ Lark khi đăng nhập."
            : "Không thể khóa hoặc hạ quyền quản trị viên cuối cùng. Khóa tài khoản sẽ thu hồi các phiên đang đăng nhập."}
        </Notice>
        {role === "Administrator" && (
          <Notice>
            Administrator có toàn quyền dữ liệu, giao nhận và phân quyền nhân
            viên. Chỉ cấp cho người được công ty ủy quyền.
          </Notice>
        )}
        <div className="modal-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Hủy
          </button>
          <button
            className="primary"
            type="submit"
            disabled={
              busy || !changed || (!creating && reason.trim().length < 3)
            }
          >
            {creating ? "Thêm thành viên" : "Lưu thiết lập"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
