# Kết nối Lark và triển khai COMS-FLOW

> Quyết định mới: dùng Railway và URL miễn phí Railway; không triển khai tên miền riêng. Làm theo [RAILWAY_DEPLOY.md](RAILWAY_DEPLOY.md). Phần VPS/tên miền dưới đây chỉ là phương án cũ, không phải cấu hình đang triển khai.


Tên miền người dùng cung cấp: `comsmiu.vn`. Cấu hình dự kiến dùng subdomain `production.comsmiu.vn`. Chưa có thông tin hosting, DNS hoặc credential Lark trong môi trường này; **các URL dưới đây là cấu hình dự kiến, chưa phải ứng dụng đã triển khai**. Chưa sửa DNS hay website tại tên miền gốc.

| Mục trong Lark | Giá trị dự kiến sau triển khai |
| --- | --- |
| Web App Homepage — desktop | `https://production.comsmiu.vn` |
| Web App Homepage — mobile | `https://production.comsmiu.vn` |
| Security Settings → Redirect URL | `https://production.comsmiu.vn/auth/callback` |
| Trusted/Security domain, nếu console yêu cầu hostname | `production.comsmiu.vn` |

Không dùng localhost, IP nội bộ, liên kết tệp mã nguồn hoặc nút mở môi trường làm Homepage của Lark. URL truy cập chính cần hosting HTTPS hoạt động.

## 1. Chuẩn bị hosting

Khi bổ sung hosting, cần tên nhà cung cấp, máy chủ/dịch vụ được phép triển khai, quyền triển khai và xác nhận subdomain. Credential máy chủ/App Secret nhập bằng cơ chế an toàn của nhà cung cấp, không gửi qua chat.

Hệ thống cần Node.js 24, PostgreSQL 17 trung tâm và HTTPS. Có thể dùng Docker Compose + Caddy trên VPS, hoặc nền tảng chạy Node/Docker với database managed. App bind `0.0.0.0` trong production và nhận PORT từ hosting. Session nằm trong PostgreSQL, không cần sticky session giữa các lần khởi động. Domain không được suy từ Host header do người gọi gửi.

## 2. Cấu hình backend

Trên hosting, đặt các biến sau qua secret manager hoặc `.env.production` có quyền file 600:

```dotenv
NODE_ENV=production
DEV_AUTH=false
PUBLIC_URL=https://production.comsmiu.vn
LARK_REDIRECT_URI=https://production.comsmiu.vn/auth/callback
LARK_APP_ID=<App ID của Custom App>
LARK_APP_SECRET=<App Secret, chỉ backend>
LARK_TENANT_KEY=<tenant_key tổ chức đã xác minh>
SESSION_SECRET=<chuỗi ngẫu nhiên đủ mạnh, tối thiểu 32 ký tự>
DATABASE_URL=<kết nối PostgreSQL thực>
```

Đây là mẫu tên biến, không phải credential có thể dùng trực tiếp. LARK_TENANT_KEY là định danh tenant, khác App ID. Lấy từ quản trị Lark hoặc trường `tenant_key` của kết quả user_info trong API Explorer với tài khoản thuộc tổ chức, không tự chấp nhận tenant đầu tiên đăng nhập.

LARK_REDIRECT_URI có thể bỏ trống để backend tự lấy PUBLIC_URL + `/auth/callback`. Nếu khai báo phải khớp chính xác; khác host/path/query sẽ khóa đăng nhập. PUBLIC_URL là origin, không có path/query hoặc thông tin đăng nhập. Secret không có tên VITE_* và không đưa vào import.meta.env/frontend. App Secret chỉ dùng trong yêu cầu HTTPS tới API tài khoản Lark.

Nếu dùng hosting managed, đặt biến trực tiếp trong dashboard; `.env.production` không tự được Node đọc. Với Compose, `env_file` đưa các biến vào process. Với systemd, dùng EnvironmentFile hoặc secret injection tương ứng. Biến được nền tảng inject có ưu tiên hơn file cục bộ.

## 3. Triển khai HTTPS bằng VPS/Docker khi có máy chủ

Từ `production/`, sao chép `.env.production.example` sang `.env.production`, điền giá trị thật và mật khẩu PostgreSQL. DATABASE_URL dùng hostname `postgres` trong mạng Compose; mật khẩu phải URL-encode nếu có ký tự đặc biệt. File này không được commit.

Thiết lập DNS A/AAAA của `production.comsmiu.vn` tới máy chủ và mở cổng 80/443. Không thay bản ghi root `comsmiu.vn` nếu root đang phục vụ website khác. Caddy cấp/gia hạn chứng chỉ HTTPS khi domain và cổng đã đúng.

```bash
chmod 600 .env.production
npm run deployment:check -- .env.production
docker compose --env-file .env.production -f compose.https.yaml config --quiet
docker compose --env-file .env.production -f compose.https.yaml up -d --build
```

File Compose chạy PostgreSQL → migration một lần → app → Caddy HTTPS. Database/app không publish cổng ra Internet; chỉ Caddy mở 80/443. Không chạy `down -v` với dữ liệu cần giữ. Không dùng `docker compose config` thiếu `--quiet` trong log công khai vì có thể in secret đã nội suy.

Kiểm tra cấu hình tĩnh thành công chưa chứng minh OAuth hay HTTPS hoạt động. Khi deployment thực hoàn tất, kiểm tra health, trang đăng nhập và DNS/chứng chỉ từ bên ngoài; lúc đó mới bàn giao URL Homepage đã xác minh. Hướng dẫn backup/restore xem DEPLOYMENT.md.

## 4. Redirect URL trong Lark Security Settings

1. Đăng nhập [Lark Developer Console](https://open.larksuite.com/app), chọn đúng Custom App đã tạo.
2. Mở **Security Settings** (tên menu có thể là 安全设置 tùy ngôn ngữ console).
3. Tìm **Redirect URLs / OAuth Redirect URL**, thêm chính xác `https://production.comsmiu.vn/auth/callback` và lưu. Không chỉ điền domain ở trường này; không thêm `/` cuối callback, query hoặc wildcard.
4. Nếu có mục Trusted/Security Domain riêng, điền hostname `production.comsmiu.vn` theo loại trường mà console yêu cầu.
5. Đảm bảo cùng URL được đặt tại backend qua LARK_REDIRECT_URI/PUBLIC_URL; không sửa callback chỉ ở frontend.

## 5. Web App Homepage và quyền

1. Trong **App Features / Capabilities**, bật **Web App**. App có tên COMS-FLOW PRODUCTION MANAGEMENT và icon `public/cf.svg` (xuất PNG nếu console yêu cầu). Không cần bật Bot hoặc Base Extension.
2. Sau khi hosting hoạt động, đặt Homepage desktop/mobile thành `https://production.comsmiu.vn`.
3. Mở [API Explorer cho user_info](https://open.larksuite.com/api-explorer?project=authen&resource=user_info&apiName=get&version=v1), đối chiếu quyền tối thiểu console yêu cầu. Ứng dụng dùng open_id, name, tenant_key; không xin quyền gửi tin hoặc toàn bộ danh bạ. Nếu tổ chức yêu cầu scope tường minh, khai báo LARK_OAUTH_SCOPES bằng các scope đã được cấp, cách nhau bằng dấu cách.
4. Chọn phạm vi nhân viên được dùng trong **Availability**. Tạo phiên bản, gửi phê duyệt/phát hành nội bộ theo quy trình tenant. Lưu Security Settings hoặc tạo app chưa đồng nghĩa app đã khả dụng cho mọi nhân viên.
5. Lark Base là cấu hình tùy chọn riêng. Không cấp quyền ghi Base hoặc đồng bộ bảng khi chưa có mapping/quyền được xác nhận.

## 6. Kiểm tra đăng nhập thật

Nhấn icon app trong Lark → trang ứng dụng → Đăng nhập bằng Lark → authorize → callback → ERP. OAuth tạo state ngẫu nhiên và PKCE S256, lưu thử đăng nhập 5 phút gắn với session; PostgreSQL chỉ cho tiêu thụ state một lần, kể cả hai callback đồng thời. Token/code không trả về frontend hoặc lưu localStorage. Token exchange không tự retry; Open API có timeout. Người dùng mới mặc định Viewer, tenant khác hoặc tài khoản disabled bị chặn.

Administrator đầu tiên đăng nhập Lark thật trước, sau đó người vận hành có thẩm quyền chạy `npm run admin -- OPEN_ID_DA_XAC_MINH Administrator` trên server để cấp quyền cho đúng người dùng hiện hữu trong tenant đã cấu hình. Các vai trò còn lại cấp tại Cấu hình & dữ liệu → Phân quyền.

Thử hai tài khoản cá nhân: Planner tạo/sửa lệnh, Warehouse nhận hàng, Viewer không ghi được. Giữ nguyên các ca dự báo V9 và kiểm tra một lệnh staging được phép dùng. Không tạo/sửa lệnh thật trong thử nghiệm. Đăng nhập mock trong bộ test không thay thế bước này.

## 7. Chẩn đoán lỗi

| Hiện tượng | Kiểm tra |
| --- | --- |
| Mở web không được | Hosting, DNS và HTTPS đã triển khai chưa; không dùng URL nội bộ của môi trường làm URL công khai |
| Trang hiện ứng dụng đặt xe cũ | Dùng điểm khởi động mới `npm run dev` ở root; app cũ chỉ còn lệnh `legacy:dev` |
| Không kết nối backend / JSON không hợp lệ | Chạy chung API/frontend bằng lệnh root; hosting phải route `/api` và `/auth` tới cùng backend |
| Lark chưa đủ cấu hình | Xem danh sách tên biến thiếu trên trang đăng nhập; không in giá trị secret |
| Redirect mismatch | Kiểm tra URL ở Console và PUBLIC_URL/LARK_REDIRECT_URI giống chính xác |
| State hết hạn/đã dùng | Bắt đầu đăng nhập lại; không refresh hoặc dùng lại URL callback cũ |
| Không có cookie sau callback | HTTPS, cookie Secure/SameSite và reverse proxy X-Forwarded-Proto; callback phải cùng origin Homepage |
| Tài khoản không được phép | tenant_key, phạm vi nhân viên, trạng thái disabled và phiên bản app đã phát hành |
| Provider error | App ID/Secret đúng app, quyền đã duyệt, mạng tới accounts.larksuite.com/open.larksuite.com; không tự retry authorization code cũ |

Với Administrator đã đăng nhập, `/api/lark/status` trả các URL và tên biến cần thiết, không trả App Secret. `npm run deployment:check -- .env.production` kiểm tra cấu hình tĩnh và in URL chính/callback khi đã đủ; không gọi OAuth live hoặc tự thay đổi dữ liệu công ty.
