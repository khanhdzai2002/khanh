import { useState, useEffect } from "react";
import { Upload, ShieldCheck, Link, Database, Download } from "lucide-react";
import { api, send } from "./api";
import { AccountsPage } from "./Accounts";
import { type Role } from "../shared/domain";
import { Notice, Modal, Empty, Field, vnDate, type Run } from "./ui";
export function SettingsPage({
  run,
  role,
  busy,
  onAccounts,
}: {
  run: Run;
  role: Role;
  busy: boolean;
  onAccounts?: () => void;
}) {
  const [tab, setTab] = useState("setup"),
    [config, setConfig] = useState<any>({}),
    [account, setAccount] = useState<any>(null),
    [logs, setLogs] = useState<any[]>([]),
    [preview, setPreview] = useState<any>(null),
    [base, setBase] = useState<any>(null),
    [error, setError] = useState("");
  const admin = role === "Administrator";
  useEffect(() => {
    void api("/api/account")
      .then(setAccount)
      .catch((e) => setError(e.message));
    void api("/auth/config")
      .then(setConfig)
      .catch((e) => setError(e.message));
    if (admin) {
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
              onClick={() =>
                id === "users" && onAccounts ? onAccounts() : setTab(id)
              }
            >
              {label}
            </button>
          ))}
      </div>
      {error && <Notice>{error}</Notice>}
      {tab === "setup" && (
        <>
          <section className="panel padded">
            <h2>Tài khoản & quyền thao tác</h2>
            <p>
              Vai trò hiện tại: <strong>{role}</strong>. Viewer chỉ xem;
              Production Planner tạo/sửa kế hoạch và lệnh; Warehouse Operator
              ghi nhận hàng; Administrator quản trị toàn bộ.
            </p>
            {account && (
              <>
                <Field label="Lark Open ID của tài khoản đang đăng nhập">
                  <input
                    value={account.openId}
                    readOnly
                    aria-label="Lark Open ID của tôi"
                  />
                </Field>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(account.openId);
                    } catch {
                      setError(
                        "Không sao chép tự động được. Hãy chọn và sao chép Open ID trong ô phía trên.",
                      );
                    }
                  }}
                >
                  Sao chép Open ID của tôi
                </button>
                {!account.hasAdministrator && !account.bootstrapUsed ? (
                  <>
                    <Notice>
                      Hệ thống chưa có Administrator. Chủ hệ thống cần chỉ định
                      đúng tài khoản quản trị đầu tiên; nhân viên không được tự
                      nâng quyền.
                    </Notice>
                    <ol>
                      <li>
                        Chủ hệ thống kiểm tra tên tài khoản ở góc trên và sao
                        chép Open ID phía trên.
                      </li>
                      <li>
                        Trong Railway → khanh → Variables, thêm{" "}
                        <code>LARK_INITIAL_ADMIN_OPEN_ID</code> bằng Open ID đã
                        chọn, rồi Deploy.
                      </li>
                      <li>
                        Mở lại trang này bằng đúng tài khoản đó và nhấn nút khởi
                        tạo khi xuất hiện.
                      </li>
                    </ol>
                    {account.bootstrapEligible && (
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await send("/api/admin/bootstrap", {});
                            window.location.reload();
                          }, "Đã khởi tạo Administrator cho tài khoản được chỉ định")
                        }
                      >
                        Khởi tạo Administrator cho tài khoản của tôi
                      </button>
                    )}
                  </>
                ) : (
                  <p>
                    {admin
                      ? "Mở tab Phân quyền để cấp vai trò cho nhân viên."
                      : "Liên hệ Administrator để được cấp Production Planner hoặc quyền phù hợp công việc."}
                  </p>
                )}
              </>
            )}
          </section>
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
        <AccountsPage role={role} busy={busy} run={run} />
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
