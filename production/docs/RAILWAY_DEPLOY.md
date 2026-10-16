# Railway → COMS-FLOW → LarkSuite

Railway là hosting chính theo quyết định mới. Không cần tên miền riêng hoặc DNS. Giữ **Custom App COMS-FLOW Production Management 1.0.0 đã Released**; chỉ đổi cấu hình của app đó sau khi có URL Railway thật.

## Trạng thái hiện tại

| Thành phần | Đã có | Chưa xác minh |
| --- | --- | --- |
| Frontend | React/TypeScript, tiếng Việt, dashboard, kế hoạch, lệnh, lịch sử, giao nhận, import, responsive | URL Railway bên ngoài |
| Backend | Express, OAuth/PKCE, session PostgreSQL, RBAC, transaction/version/idempotency/audit | Lark thật và proxy Railway |
| Database | PostgreSQL cục bộ, migrations 001–004; database test riêng | Chưa tạo PostgreSQL Railway |
| Nghiệp vụ V9 | Công thức 5 ngày, 4 vòng đời, nhiều màu/size, giao nhiều đợt, sửa/xóa mềm/khôi phục, CSV/XLSX | UAT với nhân viên được phép |
| Deployment | Dockerfile, railway.json, migration pre-deploy, /health | Chưa tạo project hoặc deployment Railway |

Báo cáo nghiệp vụ chi tiết: [V9_FEATURE_MAP.md](../../V9_FEATURE_MAP.md). Base mới chỉ đọc thử 100 bản ghi, chưa có mapping/sync; duyệt Manager tùy chọn chưa triển khai. Nhận hàng không tự cộng tồn. Dữ liệu nhúng V9 không được nhập làm doanh số hiện tại.

Môi trường Codex hiện không có kết nối/quyền Railway hoặc Railway CLI/token để tạo project. Git proxy hiện có hỗ trợ đẩy mã lên GitHub; nhánh bàn giao riêng là **comsflow-railway**, không thay main. Không có URL Railway hoặc Project URL thật để bàn giao lúc này. Không dùng URL minh họa dưới đây như URL đã triển khai.

## Bước 1 — Dùng mã nguồn trực tiếp trên GitHub

Repository: https://github.com/khanhdzai2002/khanh

Nhánh bàn giao: **comsflow-railway**. Không cần tải hoặc upload ZIP.

1. Đăng nhập GitHub, mở https://github.com/khanhdzai2002/khanh/tree/comsflow-railway.
2. Kiểm tra có thư mục `production/`, trong đó có `Dockerfile`, `railway.json`, `package-lock.json`, `server/`, `src/` và `migrations/`. File môi trường chứa secret, node_modules và bản dump database không được đưa lên GitHub.
3. Ở Railway, chọn đúng repository và branch **comsflow-railway**. Không chọn main khi main chưa có mã ERP.
4. Nếu muốn vận hành từ main, mở https://github.com/khanhdzai2002/khanh/compare/main...comsflow-railway → **Create pull request**, xem thay đổi rồi merge. Sau đó mới đổi nhánh Railway theo dõi sang main.

## Bước 2 — Tạo Railway Project và PostgreSQL

1. Mở https://railway.com → **Login** → đăng nhập bằng GitHub của bạn. Chấp thuận quyền tài khoản theo màn hình Railway; không gửi token qua chat.
2. Tại dashboard chọn **New Project → Empty Project** (tên nút có thể đổi theo giao diện). Trong Project Settings, đổi tên thành `comsflow-production-management`.
3. Trong project, chọn **Create / + New → Database → PostgreSQL**. Giữ tên service là **Postgres**, hoặc ghi nhớ tên thật để thay reference ở bước sau.
4. Chờ Postgres chạy thành công. PostgreSQL phải có **volume persistent** gắn với data directory; kiểm tra trong Settings/Volumes. Không xóa/recreate database service hoặc volume khi redeploy web.
5. Chọn **Create / + New → GitHub Repo**, kết nối GitHub và cấp Railway quyền đối với repository `khanhdzai2002/khanh` (chọn đúng repo, không cần cấp mọi repo).
6. Chọn nhánh **comsflow-railway** (hoặc main sau merge), đặt tên web service `comsflow-web`. Nếu lần deploy đầu tự chạy trước khi cấu hình xong và báo lỗi, mở Settings/Variables hoàn thành các bước dưới rồi Redeploy.

## Bước 3 — Cấu hình service web trước khi deploy lại

Trong `comsflow-web → Settings`:

| Thiết lập | Giá trị |
| --- | --- |
| Source repository | khanhdzai2002/khanh |
| Branch | comsflow-railway (hoặc main sau merge) |
| Root Directory | `/production` |
| Config File Path | `/production/railway.json` (đường dẫn từ gốc repository) |
| Builder | Dockerfile; Dockerfile nằm trong root directory đã chọn |
| Pre-deploy Command | `npm run migrate` (đã khai báo trong railway.json) |
| Start Command | `npm start` (đã khai báo) |
| Healthcheck Path | `/health` |
| Healthcheck Timeout | 120 giây |

Nếu Settings đã hiển thị các mục lấy từ config-as-code thì giữ chúng, tránh override khác với file. Không đặt lệnh Vite/npm run dev cho production. Dockerfile build React, Node phục vụ assets + `/api` + `/auth` trên cùng origin. Node nghe `0.0.0.0:$PORT`; Railway cấp PORT. HTTPS do Railway xử lý ở public edge, không cần Caddy hay compose.https.yaml trên Railway.

Trong `comsflow-web → Variables → New Variable` hoặc **Raw Editor**, thêm:

| Biến | Cách điền |
| --- | --- |
| DATABASE_URL | Chọn **Add Reference** từ Postgres → DATABASE_URL; biểu thức thường là `${{Postgres.DATABASE_URL}}`, dùng tên service thật |
| NODE_ENV | `production` |
| DEV_AUTH | `false` |
| HOST | `0.0.0.0` |
| SESSION_SECRET | Tạo bằng password manager, chuỗi ngẫu nhiên ít nhất 32 ký tự, khuyến nghị 64; chỉ lưu Railway |

Không cần điền App Secret để đạt mục tiêu đầu tiên là mở trang đăng nhập. Thiếu Lark sẽ hiển thị thông báo rõ và khóa nút đăng nhập; không mở dữ liệu nội bộ. Không bật DEV_AUTH để vượt qua bước cấu hình.

Không copy PUBLIC_URL cũ hoặc `.env.local` lên Railway. Chưa có URL thật thì chưa tự bịa APP_BASE_URL. Chưa cần LARK_REDIRECT_URI. Dữ liệu production không được lưu trong filesystem container; mọi nghiệp vụ/session nằm PostgreSQL.

## Bước 4 — Generate Domain, lấy URL thật và deploy

1. Mở `comsflow-web → Settings → Networking → Public Networking → Generate Domain`. Nếu Railway hỏi target port, dùng cổng ứng dụng đang nghe trong Deploy Logs/PORT; không dùng cổng Vite 5173. Railway hỗ trợ PORT do nền tảng cấp.
2. **Sao chép nguyên URL HTTPS Railway thực sự hiển thị**, có đuôi `.up.railway.app`. Đây mới là URL dùng cho các bước tiếp theo; file này không dự đoán tên domain.
3. Trong Variables, đặt **APP_BASE_URL = URL HTTPS vừa sao chép**, không có đường dẫn hoặc query. Bỏ PUBLIC_URL cũ nếu có. Nếu đặt cả PUBLIC_URL và APP_BASE_URL thì chúng phải cùng origin. Có thể giữ LARK_REDIRECT_URI trống để tự suy callback.
4. `RAILWAY_PUBLIC_DOMAIN` do nền tảng cấp cũng được backend hỗ trợ khi chưa có URL tường minh; app không lấy origin từ Host header. Nếu domain chỉ được cấp sau khi deployment đầu thành công, tạo domain rồi lưu APP_BASE_URL và redeploy; không đổi sang một domain tưởng tượng để lách cấu hình.
5. Bấm **Deploy / Apply Changes**, mở **Deployments → deployment mới → View Logs**. Kiểm tra build React, pre-deploy migrations và `COMS-FLOW API listening on port ...`. Migration có transaction và advisory lock, không seed dữ liệu công ty. `npm start` cũng chờ migrations xong trước khi mở cổng, phòng trường hợp Railway chưa nạp pre-deploy hook. Migration thất bại phải sửa trước khi chạy app.
6. Khi trạng thái **Active/Success**, mở URL đó trong cửa sổ ẩn danh. Phải thấy trang **COMS-FLOW**, không phải ứng dụng đặt xe.
7. Mở thêm đường dẫn `/health` trên cùng URL: phải trả `{"ok":true}`. `/api/skus` khi chưa đăng nhập phải trả 401. Health chỉ xác nhận database/schema khả dụng, không chứng minh OAuth hoạt động.

Nếu deploy báo thiếu APP_BASE_URL, quay lại Networking → Generate Domain và Variables như trên. Nếu báo database: kiểm tra reference DATABASE_URL, Postgres đang chạy và pre-deploy log. Nếu build chạy Vite development/ứng dụng cũ: kiểm tra Root Directory và nhánh code. Không in `DATABASE_URL`, authorization code hoặc App Secret vào logs/screenshot gửi hỗ trợ.

**Dừng xác nhận tại đây nếu mới chỉ đạt trang đăng nhập.** Gửi Project URL từ thanh địa chỉ dashboard và URL public thật qua chat được; không gửi credential. Codex có thể tiếp tục kiểm tra URL công khai sau đó.

## Bước 5 — Bật đăng nhập trong Custom App Lark hiện hữu

Sau khi URL Railway mở được:

1. Mở https://open.larksuite.com/app → chọn **COMS-FLOW Production Management**, đúng app 1.0.0 đã Released. Không tạo app mới.
2. Lấy App ID/App Secret từ **Credentials & Basic Info**; nhập trực tiếp vào `comsflow-web → Variables` dưới tên **LARK_APP_ID**, **LARK_APP_SECRET**. Không nhập vào frontend, GitHub hoặc chat.
3. Thêm **LARK_TENANT_KEY** là tenant tổ chức đã xác minh (khác App ID). Dùng quản trị Lark hoặc API Explorer user_info với tài khoản tổ chức; không tự tin tenant đầu tiên đăng nhập.
4. Callback là **URL Railway thật + `/auth/callback`**. Có thể để LARK_REDIRECT_URI trống; nếu khai báo phải khớp chính xác callback trên. Không thêm `/` cuối callback.
5. Trong **Security Settings → Redirect URLs**, thêm callback trên và Save. Nếu có trường trusted/security domain riêng, điền hostname Railway thật, không điền domain cũ. Đối chiếu quyền tối thiểu của API user_info với [API Explorer](https://open.larksuite.com/api-explorer?project=authen&resource=user_info&apiName=get&version=v1); không xin quyền gửi tin hoặc toàn bộ danh bạ. Scope tường minh, nếu tenant yêu cầu, đặt bằng LARK_OAUTH_SCOPES với các scope đã cấp.
6. **App Features → Web App → Web app configurations**: thay Desktop Homepage cũ bằng **URL Railway HTTPS thật**. Mobile Homepage dùng cùng URL responsive. Chọn mở bên trong Lark nếu console hỗ trợ, Save; xác minh webview thực tế ở bước kiểm thử. Không đoán frame/cookie policy khi chưa thử trên thiết bị thật.
7. Nếu thay đổi cần phát hành, mở **Version Management & Release → Create Version**, đặt **1.0.1**, ghi chú “Chuyển hosting Railway và cập nhật Homepage/OAuth callback”, kiểm tra phạm vi nhân viên, Submit/Release theo quy trình tenant.
8. Deploy lại web sau khi lưu Variables, rồi mở từ **Lark Workplace**. Người dùng mới mặc định Viewer. Administrator đầu tiên cần đăng nhập Lark thật, sau đó người vận hành có thẩm quyền chạy `npm run admin -- OPEN_ID_DA_XAC_MINH Administrator` qua shell/CLI thực thi **trong môi trường service Railway**. Dùng shell/SSH của Railway nếu được plan hỗ trợ; không chạy npm run admin trên máy khác với DATABASE_URL phát triển. Không cấp quyền qua tài khoản kỹ thuật chung.

OAuth có PKCE, state TTL 5 phút tiêu thụ một lần trong PostgreSQL, tenant check, HttpOnly/Secure/SameSite cookies và session rotation. Không lưu token ở localStorage. Lark desktop/mobile đăng nhập thật vẫn là bước xác minh bắt buộc.

## Bước 6 — Kiểm thử nghiệm thu và dữ liệu bền vững

Dùng môi trường staging hoặc dữ liệu tổng hợp được phép, không sửa lệnh sản xuất thật:

- URL ngoài mở được, chứng chỉ HTTPS hợp lệ, frontend tải không lỗi; `/health` 200, anonymous API 401.
- Hai nhân viên đăng nhập riêng qua icon Lark, không lặp redirect; logout hoạt động. Viewer không ghi được, Planner tạo/sửa, Warehouse nhận.
- Tạo SKU test: bán 20/ngày, tồn 30, đang về 10, Tăng trưởng → đề xuất 60 với policy mặc định. Mở bán dùng test; Giảm sút/Xả kho 0; chưa nhập tồn khóa đề xuất Growth.
- Lệnh 1.000, nhận 300 rồi 450 → còn 250, tiến độ 75%; không nhận vượt. Không tự cộng tồn. Sửa giữ số nhận/audit; xóa mềm rồi khôi phục.
- Reload, logout/login, bấm **Redeploy** web service với cùng Postgres rồi kiểm tra dữ liệu test và lịch sử vẫn còn. Không xóa database/volume.
- Thử import file tổng hợp CSV/XLSX, combo cần đối soát không quy về một SKU; tồn/vòng đời không bị ghi đè khi chuyển số bán.
- Chỉ đánh dấu hoàn thành khi các kiểm tra ngoài và OAuth thật đã đạt. 88 tests cục bộ không thay thế nghiệm thu này.

## Backup và giám sát

Trước khi dùng thật, trong Postgres service mở **Backups / Volume Backups** (nếu plan hỗ trợ), bật lịch hằng ngày và chính sách giữ phù hợp; theo dõi lần backup thành công. Diễn tập restore vào service/database riêng, không đè production. Nếu plan không có backup lịch, cần thiết lập job pg_dump và kho lưu trữ bền vững được công ty cho phép trước go-live; script `scripts/backup.sh` chỉ là công cụ, chưa tự tạo backup schedule.

Bản dump để trên filesystem tạm của web sẽ mất khi redeploy. Không coi redeploy hoặc volume đơn lẻ là backup. Không gửi dữ liệu công ty ra dịch vụ lưu trữ khác khi chưa được phép. Trước migration lớn phải có backup và quy trình rollback/restore đã kiểm tra.

Build Logs/Deploy Logs trong service dùng để xem lỗi build/start; Postgres có logs riêng. Giữ secret/code/token khỏi logs; không bật HTTP access log ghi toàn bộ query callback. `/health` chỉ là readiness endpoint; Railway deploy health check không phải giám sát uptime liên tục. Dùng monitoring của Railway hoặc dịch vụ được công ty chấp thuận nếu cần cảnh báo ngoài giờ.

## Chi phí và cập nhật sau này

Domain `.up.railway.app` và HTTPS không yêu cầu mua domain. Railway vẫn tính phí plan và tài nguyên web, PostgreSQL, volume, network/backup; không cam kết miễn phí vận hành. Dự trù ban đầu **10–25 USD/tháng** cho tải nhẹ là ước tính ngân sách, không phải báo giá hoặc mức trần. Xem https://railway.com/pricing và **Billing/Usage** trong tài khoản để biết giá/credit/trial hiện hành; đặt cảnh báo ngân sách nếu có. Không tạo gói trả phí thay bạn trong phiên này.

Sau khi sửa chức năng: kiểm tra test/build → commit/PR trên GitHub → merge nhánh Railway theo dõi → Railway tự build/migrate/deploy nếu Autodeploys bật. Kiểm tra Settings → Source đúng repo/branch và không tắt Autodeploys. Kiểm tra deployment mới + `/health` + một smoke thao tác staging. Giữ nguyên web service/domain/Postgres, không tạo project mới cho mỗi lần sửa. Code rollback không tự rollback database migration; xem kế hoạch restore trước khi hạ version.

## Tài liệu chính thức và giới hạn kiểm tra

- https://docs.railway.com/guides/monorepo
- https://docs.railway.com/reference/config-as-code
- https://docs.railway.com/guides/public-networking
- https://docs.railway.com/guides/pre-deploy-command
- https://docs.railway.com/guides/healthchecks
- https://docs.railway.com/guides/backups

Trang Railway/docs và JSON schema trả 403 qua mạng của workspace trong phiên chuẩn bị này. Tên menu cần đối chiếu với dashboard thực tế; cấu hình trên chưa được Railway server chấp nhận hoặc triển khai. Nếu giao diện khác, gửi nguyên văn lỗi/ảnh không chứa secret để điều chỉnh; không bỏ bước cấu hình root directory, migration hay health check.

## Khi trang đăng nhập báo provider error

Sau khi deployment mới hoạt động, đăng nhập lại đúng một lần, mở Deploy Logs và tìm `Lark OAuth failed`. Ghi nhận stage, httpStatus, providerCode, oauthError, transportCode; các trường đã được lọc để không chứa bí mật. `token_exchange` lỗi ở bước đổi code, `user_info` lỗi khi đọc danh tính/quyền. Không suy từ thông báo frontend rằng chắc chắn Secret sai; đối chiếu mã lỗi cụ thể. Không dán cả request/response OAuth hoặc biến môi trường để hỗ trợ.

## Khi OAuth thành công nhưng tài khoản bị từ chối

Bản mới tách rõ hai lý do:

- `tenant_mismatch`: đăng nhập đúng tổ chức công ty. Trong Lark API Explorer chọn đúng app và tài khoản công ty, gọi User Info để lấy **data.tenant_key**, rồi nhập trực tiếp vào Railway → khanh → Variables → LARK_TENANT_KEY và Deploy. Không dùng App ID, Enterprise ID/display_id hoặc tenant_access_token. Không lấy tenant của người dùng ngoài công ty để mở truy cập. Khoảng trắng đầu/cuối được trim, dấu nháy và khoảng trắng bên trong phải sửa lại.
- `account_disabled`: Administrator kiểm tra trạng thái user trong COMS-FLOW và chỉ mở lại khi được phép. Backend không tự mở khóa hoặc nâng quyền.

Có thể xác nhận reason trong Deploy Logs bằng `Lark access denied`. Fingerprint trong log chỉ phục vụ so sánh, **không phải tenant key để nhập cấu hình**. Không cần đổi Secret hoặc callback khi lỗi đã ở bước tenant check.
