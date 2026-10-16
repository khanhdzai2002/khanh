import { useState, useEffect } from "react";
import { Upload, ShieldCheck, Link, Database, Download } from "lucide-react";
import { api, send } from "./api";
import { roles, type Role } from "../shared/domain";
import { Notice, Modal, Empty, Field, vnDate, type Run } from "./ui";
export function SettingsPage({
  run,
  role,
  busy,
}: {
  run: Run;
  role: Role;
  busy: boolean;
}) {
  const [tab, setTab] = useState("setup"),
    [config, setConfig] = useState<any>({}),
    [users, setUsers] = useState<any[]>([]),
    [logs, setLogs] = useState<any[]>([]),
    [preview, setPreview] = useState<any>(null),
    [base, setBase] = useState<any>(null),
    [error, setError] = useState("");
  const admin = role === "Administrator";
  useEffect(() => {
    void api("/auth/config")
      .then(setConfig)
      .catch((e) => setError(e.message));
    if (admin) {
      void api("/api/users")
        .then(setUsers)
        .catch((e) => setError(e.message));
      void api("/api/logs")
        .then(setLogs)
        .catch((e) => setError(e.message));
    }
  }, [admin, tab]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">QUẢN TRỊ ỨNG DỤNG</div>
          <h1>Cấu hình & dữ liệu</h1>
          <p>Danh tính cá nhân, nhật ký bất biến và nguồn dữ liệu rõ ràng.</p>
        </div>
        <span className="badge orange">
          <ShieldCheck size={15} /> {role}
        </span>
      </div>
      <div className="tabs">
        {[
          ["setup", "Tích hợp & môi trường"],
          ["v9", "Nhập dữ liệu V9"],
          ["users", "Phân quyền"],
          ["logs", "Nhật ký"],
        ]
          .filter(([id]) => admin || id === "setup")
          .map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
      </div>
      {error && <Notice>{error}</Notice>}
      {tab === "setup" && (
        <>
          <div className="dashboard-grid">
            <section className="panel padded">
              <Link className="orange-text" />
              <h2>Lark Custom App</h2>
              <span
                className={"badge " + (config.larkConfigured ? "orange" : "")}
              >
                {config.larkConfigured
                  ? "Đã có cấu hình backend — cần kiểm thử thật"
                  : "Chưa cấu hình Lark"}
              </span>
              <p>
                Ứng dụng web riêng, mở từ icon CF trong Lark; không chatbot,
                không Base Extension.
              </p>
              <ol>
                <li>Tạo ứng dụng nội bộ trong Lark Developer Console.</li>
                <li>
                  Bật web app, đặt URL HTTPS và tải icon CF trong bộ mã nguồn.
                </li>
                <li>
                  Khai báo callback <code>/auth/callback</code> đúng origin
                  triển khai.
                </li>
                <li>
                  Cấu hình App ID, App Secret, tenant và redirect URI ở backend.
                </li>
                <li>
                  Cấp phạm vi người dùng và phát hành phiên bản trong tenant.
                </li>
                <li>
                  Đăng nhập bằng tài khoản cá nhân; quản trị viên cấp vai trò.
                </li>
              </ol>
              <Notice>
                Không nhập App Secret tại frontend. Có cấu hình chưa chứng minh
                đăng nhập Lark hoạt động.
              </Notice>
            </section>
            <section className="panel padded">
              <Database className="orange-text" />
              <h2>Dữ liệu và sao lưu</h2>
              <p>
                PostgreSQL là nguồn chuẩn cho lệnh, giao nhận, lịch sử và người
                dùng.
              </p>
              <ul>
                <li>Không tự cập nhật tồn kho khi nhận hàng.</li>
                <li>Hàng đang về nhập tay được trừ đúng một lần.</li>
                <li>Biên nhận, revision và nhật ký không sửa/xóa.</li>
                <li>
                  Sao lưu bằng pg_dump và phục hồi thử trên database riêng.
                </li>
              </ul>
              <p>
                Xem <code>production/README.md</code> và{" "}
                <code>docs/DEPLOYMENT.md</code> trong bộ mã nguồn để cấu hình và
                diễn tập phục hồi.
              </p>
              {admin && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(
                      async () => setBase(await api("/api/lark/base/preview")),
                      "Đã đọc bản xem trước Lark Base",
                    )
                  }
                >
                  <Download size={16} />
                  Đọc thử Lark Base (không ghi)
                </button>
              )}
              {base && (
                <>
                  <Notice>
                    Kết nối chỉ đọc, tối đa 100 bản ghi. Chưa tự đồng bộ/ghi đè.
                    Cần xác nhận ánh xạ và nguồn chuẩn trước khi nhập.
                  </Notice>
                  <pre>{JSON.stringify(base, null, 2)}</pre>
                </>
              )}
            </section>
          </div>
        </>
      )}
      {tab === "v9" && admin && (
        <section className="panel padded">
          <h2>Nhập bản sao lưu JSON V9</h2>
          <p>
            Chọn JSON từ nút “Tải bản sao lưu JSON” trong V9. File HTML là đặc
            tả và dữ liệu lịch sử tham khảo, không phải backup giao dịch.
          </p>
          <Notice>
            Quy trình: xem trước → kiểm tra trùng và đối soát biên nhận → xác
            nhận. Không tự nhập dữ liệu nhúng vào báo cáo hiện tại. Lệnh và số
            đã nhận phải khớp lịch sử giao; dữ liệu không khớp sẽ bị chặn.
          </Notice>
          <label className="button primary">
            <Upload size={16} />
            Chọn bản sao lưu V9
            <input
              type="file"
              hidden
              accept=".json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file)
                  void run(async () => {
                    if (file.size > 10e6) throw Error("File vượt 10 MB");
                    setPreview(
                      await send("/api/imports/v9/preview", {
                        filename: file.name,
                        data: JSON.parse(await file.text()),
                      }),
                    );
                  }, "Đã đọc V9; chưa ghi dữ liệu nghiệp vụ");
              }}
            />
          </label>
          <p>
            Nhật ký và danh tính lịch sử được lưu với nhãn nguồn V9; người nhập
            được ghi riêng. Bản nháp có số lượng được nhập thành lệnh theo
            metadata V9; các dòng nháp số lượng 0 giữ trong nguồn đối soát.
            Snapshot bán hàng cũ chỉ lưu làm lịch sử, không tự thay báo cáo hiện
            tại.
          </p>
        </section>
      )}
      {tab === "users" && admin && (
        <section className="panel">
          <div className="panel-title">
            <h2>Người dùng và vai trò</h2>
          </div>
          <Notice>
            Người đăng nhập Lark lần đầu mặc định Viewer. Chỉ Administrator được
            cấp quyền; không thể gỡ quản trị viên cuối cùng.
          </Notice>
          {users.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Người dùng</th>
                    <th>Vai trò</th>
                    <th>Truy cập</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <UserRow
                      key={u.id + "-" + u.role + "-" + u.disabled}
                      user={u}
                      busy={busy}
                      run={run}
                      reload={async () => setUsers(await api("/api/users"))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Chưa có người dùng.</Empty>
          )}
        </section>
      )}
      {tab === "logs" && admin && (
        <section className="panel">
          <div className="panel-title">
            <h2>200 hoạt động gần nhất</h2>
            <small>Chi tiết sửa lệnh xem trong từng lệnh</small>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Người thực hiện</th>
                  <th>Hành động</th>
                  <th>Đối tượng</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td>{vnDate(l.at)}</td>
                    <td>{l.actor}</td>
                    <td>{l.action}</td>
                    <td>{l.entity_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {preview && (
        <Modal title="Kiểm tra bản sao lưu V9" onClose={() => setPreview(null)}>
          {preview.policy && (
            <div className="revision-grid">
              <div>
                <h3>Chính sách hiện tại</h3>
                <pre>{JSON.stringify(preview.currentPolicy, null, 2)}</pre>
              </div>
              <div>
                <h3>Chính sách từ V9 sẽ áp dụng</h3>
                <pre>{JSON.stringify(preview.policy, null, 2)}</pre>
              </div>
            </div>
          )}
          <div className="mini-kpis">
            {Object.entries(preview.summary).map(([key, v]) => (
              <div key={key}>
                <small>{key}</small>
                <strong>{String(v)}</strong>
              </div>
            ))}
          </div>
          {preview.warnings.map((s: string) => (
            <Notice key={s}>{s}</Notice>
          ))}
          {preview.errors.length > 0 && (
            <div className="error-list">
              {preview.errors.slice(0, 100).map((s: string, i: number) => (
                <p key={i}>{s}</p>
              ))}
              <strong>{preview.errors.length} lỗi — chưa thể nhập</strong>
            </div>
          )}
          <Notice>
            Nếu backup có config, xác nhận cũng áp dụng chính sách tồn kho từ
            backup. Các thao tác nhập thực hiện trong một transaction; lỗi sẽ
            rollback toàn bộ.
          </Notice>
          <button
            className="primary"
            disabled={busy || preview.errors.length > 0}
            onClick={() =>
              void run(
                () => send("/api/imports/v9/" + preview.id + "/confirm", {}),
                "Đã nhập V9 và lưu nguồn đối soát",
              ).then((ok) => {
                if (ok) setPreview(null);
              })
            }
          >
            Xác nhận nhập dữ liệu
          </button>
        </Modal>
      )}
    </>
  );
}
function UserRow({
  user,
  busy,
  run,
  reload,
}: {
  user: any;
  busy: boolean;
  run: Run;
  reload: () => Promise<void>;
}) {
  const [role, setRole] = useState(user.role),
    [disabled, setDisabled] = useState(user.disabled);
  return (
    <tr>
      <td>
        {user.name}
        <small>{user.open_id}</small>
      </td>
      <td>
        <select
          aria-label={"Vai trò " + user.name}
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          {roles.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </td>
      <td>
        <label className="check-label">
          <input
            type="checkbox"
            checked={disabled}
            onChange={(e) => setDisabled(e.target.checked)}
          />
          Vô hiệu hóa
        </label>
      </td>
      <td>
        <button
          disabled={busy || (role === user.role && disabled === user.disabled)}
          onClick={() =>
            void run(async () => {
              await send("/api/users/" + user.id, { role, disabled }, "PUT");
              await reload();
            })
          }
        >
          Lưu quyền
        </button>
      </td>
    </tr>
  );
}
