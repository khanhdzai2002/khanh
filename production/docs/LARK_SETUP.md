# Thiết lập Lark Custom App

Người dùng đã tạo Lark Custom App. Xem [hướng dẫn Railway và cập nhật app 1.0.1](RAILWAY_DEPLOY.md). Chưa có credential/tenant/hosting thực trong phiên này. Mã đăng nhập đã viết và có test mock; Codex chưa truy cập hoặc phát hành app trong Lark Developer Console. Không coi mock hay cấu hình mẫu là tích hợp thật.

## Tài liệu chính thức đã kiểm tra

Ngày 16/10/2026 đã đọc trực tiếp bản Markdown trên Lark Developer:

- [Hướng dẫn đăng nhập web](https://open.larksuite.com/document/common-capabilities/sso/web-application-end-user-consent/guide).
- [Lấy authorization code, gồm PKCE S256](https://open.larksuite.com/document/common-capabilities/sso/api/obtain-oauth-code).
- [Đổi code lấy user_access_token và bảng mã lỗi](https://open.larksuite.com/document/uAjLw4CM/ukTMukTMukTM/authentication-management/access-token/get-user-access-token).

Cặp endpoint chính thức cho luồng web là `https://accounts.larksuite.com/open-apis/authen/v1/authorize` và `https://open.larksuite.com/open-apis/authen/v2/oauth/token`. Bản sửa dùng `server/lark-oauth.ts` gọi endpoint token v2 bằng SDK HTTP transport, có code_verifier/redirect_uri/client_id/client_secret, timeout 15 giây, không redirect hoặc retry code. Lấy danh tính vẫn dùng Node SDK 1.76.0, `AppType.SelfBuild`, `Domain.Lark`, `authen.userInfo.get` và `withUserAccessToken`.

Helper `client.accessToken.retrieveByAuthorizationCode` của SDK hiện gửi tới `/oauth/v3/token`; phiên bản tích hợp trước đã dùng helper đó. Không tiếp tục dùng helper cho luồng web này, không thử lại cùng code trên endpoint khác. Không dùng token API v1 cũ và không bỏ PKCE để né lỗi. Theo tài liệu, 20049 là **PKCE code challenge failed**, khác lỗi Secret (20002), code hết hạn (20004), redirect mismatch (20071).

Các trang HTML trước đây chỉ trả SPA; đường dẫn đầy đủ có hậu tố `.md` nay đã truy cập và đọc được. Đích API vẫn chỉ `accounts.larksuite.com` và `open.larksuite.com`. Kiểm thử HTTP giả lập chưa chứng minh OAuth trên tenant thực đã thành công.

## Tạo ứng dụng

1. Người quản trị tenant mở Developer Console, tạo **Custom App / ứng dụng nội bộ**. Đặt tên **COMS-FLOW PRODUCTION MANAGEMENT** và tải icon `public/cf.svg` (có thể chuyển thành PNG nếu console yêu cầu). App có icon riêng trong danh sách ứng dụng Lark sau khi cấu hình khả dụng và phát hành.
2. Bật khả năng **Web App**. Đặt URL desktop/mobile tới origin HTTPS của ứng dụng. Dùng cùng ứng dụng responsive cho hai thiết bị. Không bật chatbot hoặc tạo Base Extension.
3. Cấu hình redirect URL chính xác `https://hostname-của-công-ty/auth/callback`; thêm domain bảo mật theo màn hình console hiện hành. Kiểm tra URL webapp mở được từ thiết bị dùng Lark.
4. Lấy App ID, App Secret và tenant_key xác minh của tổ chức. Cấp các biến `LARK_APP_ID`, `LARK_APP_SECRET`, `LARK_TENANT_KEY` (và tùy chọn `LARK_REDIRECT_URI`, mặc định PUBLIC_URL + /auth/callback) ở backend qua secret manager hoặc `.env.local` có quyền truy cập giới hạn. Không gửi secret qua chat, không tạo biến frontend VITE_* cho secret.
5. Đặt PUBLIC_URL chính xác origin giao diện, NODE_ENV=production, DEV_AUTH=false, SESSION_SECRET đủ mạnh và DATABASE_URL cho PostgreSQL trung tâm. Thiết lập HTTPS trước khi bật cookie Secure.
6. Tại phần quyền, dùng API Explorer chính thức cho `authen.user_info.get` và cấp mức thông tin danh tính cần thiết mà console yêu cầu. Ứng dụng chỉ dùng open_id, name và tenant_key; không yêu cầu email/mobile/danh bạ toàn công ty. Không cấp quyền gửi tin vì ứng dụng chưa có tính năng gửi.
7. Đặt phạm vi khả dụng cho nhân viên cần dùng, tạo phiên bản và thực hiện quy trình phát hành/phê duyệt nội bộ. Mã nguồn hoặc draft môi trường không tự làm bước publication này.

Tên menu/quyền có thể khác theo phiên bản và tenant; lấy tên scope thực tế từ console/API Explorer, không tự cấp danh sách scope rộng để thử. Nếu tenant dùng cơ chế SSO/webview khác, cần xác thực lại authorization endpoint và chính sách cookie/CSP trên thiết bị thật. Mã hiện chuyển hướng tới `accounts.larksuite.com/open-apis/authen/v1/authorize` cho authorization code; trao đổi token dùng endpoint v2 với SDK HTTP transport nêu trên. Test live là điều kiện bàn giao tích hợp.

## Đăng nhập và cấp Administrator đầu tiên

Nhấn icon app → giao diện đăng nhập → Lark authorize → callback backend xác minh state gắn với session một lần, hạn 5 phút, và tenant. State được tiêu thụ nguyên tử trong PostgreSQL để chặn callback đồng thời; OAuth dùng PKCE S256 và client_id/response_type=code. Backend dùng timeout 15 giây, không retry đổi authorization code và không theo redirect khi gửi credential. Backend lấy user info, tạo người dùng Viewer, đổi session ID và lưu session PostgreSQL. Access token không được trả về frontend hoặc lưu vào localStorage; chỉ dùng tại backend để đọc danh tính.

Người quản trị đầu tiên đăng nhập bằng Lark thật trước. Người vận hành máy chủ có thẩm quyền lấy đúng open_id đã ghi và chạy trong thư mục `production/`:

```bash
npm run admin -- OPEN_ID_DA_XAC_MINH Administrator
```

Lệnh chỉ cập nhật người dùng đã tồn tại trong LARK_TENANT_KEY được cấu hình, không tạo tài khoản kỹ thuật chung. Nhật ký ghi đây là thao tác bootstrap qua CLI. Sau đó Administrator có thể cấp các vai trò trong Cấu hình & dữ liệu → Phân quyền. Không dùng open_id hoặc key giả để báo đã tích hợp thành công.

## Lark Base — phạm vi hiện tại và nguồn chuẩn

Khi cần kiểm tra Base, cấp thêm `LARK_BASE_APP_TOKEN` và `LARK_BASE_TABLE_ID`; cấp quyền đọc records đúng bảng trong console và chia sẻ Base cho app theo quy định của tenant. Adapter chỉ gọi `bitable.appTableRecord.list`, tối đa 100 bản ghi, có retry hữu hạn cho lỗi mạng tạm thời/rate limit. Chỉ Administrator bấm “Đọc thử Lark Base”; không tự chạy ở startup. Không có API ghi Base trong ứng dụng hiện tại.

Ánh xạ sau là hợp đồng dự kiến để người phụ trách xác nhận, chưa áp dụng lên bảng thật:

| Dữ liệu | Khóa/field cần ánh xạ | Nguồn chuẩn mặc định |
| --- | --- | --- |
| Sản phẩm | record_id ngoài, product_code, product_name | PostgreSQL cho đến khi xác nhận Base là nguồn danh mục |
| SKU | product_code + color + size; ngoại lệ chuẩn hóa được rà soát | PostgreSQL |
| Tồn | sku key, on_hand, snapshot_at, source, external_snapshot_id | Snapshot nhập tay/import trong PostgreSQL; chỉ đổi nguồn sau xác nhận |
| Bán ngày | sku key, sales_date, units, source_report_id | Import TikTok đã đối soát; không trộn cả hai nguồn cho cùng kỳ |
| Lệnh/nhận/revision | UUID giao dịch trong PostgreSQL | Luôn PostgreSQL; Base không ghi đè giao dịch |

Cần cung cấp tên bảng/field, kiểu field, timezone, khóa ngoài, chiều đồng bộ và nguồn chuẩn trước khi triển khai mapping/import. Không suy field từ tiêu đề giống nhau; không tự cập nhật tồn khi nhận hàng. Chưa có đồng bộ Base tự động hoặc push báo cáo trong phiên bản này.

## Kiểm tra thật trước khi xác nhận hoàn thành

Mở từ icon trên Lark desktop và mobile; đăng nhập hai tài khoản cá nhân; thử Viewer bị chặn ghi, Planner tạo/sửa, Warehouse nhận; hai người sửa cùng version phải có 409. Kiểm tra logout, tài khoản disabled, tenant sai, hết state và session hết hạn. Kiểm tra thao tác với dữ liệu staging được cho phép, không dùng lệnh thật. Khi các bước này hoàn tất mới xác nhận app mở/đăng nhập/phân quyền trên Lark hoạt động.
