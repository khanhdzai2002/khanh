# Bằng chứng kiểm thử và phạm vi xác nhận

## Đã chạy trên môi trường hiện tại

- Node.js 24.19.0, npm 11.9.0, PostgreSQL 17 trong Docker; migrations 001–005.
- `npm run build`: TypeScript và Vite build thành công. Tailwind biên dịch cục bộ; không cần CDN giao diện V9.
- `npm ci` theo lockfile chạy lại thành công. Sau cài lại, đã khởi động lại Vite để làm mới dependency optimization (server đang chạy trước đó trả 504 cho cache cũ), rồi xác minh login/logout DEV và API trả 401 sau logout.
- `npm test`: **119 tests passed, 9 files**, không có test skip. 23 tests domain, 45 tests integration PostgreSQL/HTTP và 18 tests Lark mock/security, 10 tests cấu hình origin/callback, 3 tests lọc log 2 tests SDK/web OAuth với transport giả lập 7 tests bootstrap Administrator và 11 tests quản lý thành viên.
- Công thức: một test đối chiếu 400 đầu vào với chính hàm calc V9 trích nguyên văn, kiểm tra need/sale/raw/target/cover/flag. Có test riêng ví dụ 60, làm tròn, ngày chờ opt-in, thiếu tồn, bất thường và bốn vòng đời.
- Giao dịch: nhiều màu/size, nhận 300+450+250 từ 1.000; chặn vượt nhận; idempotency đồng thời; sửa sau nhận, không giảm dưới đã nhận, không đổi SKU/xóa dòng nhận; revision trước/sau; hai người sửa cùng version; xóa/khôi phục; hủy và reopen; giữ mã đã dùng; trigger bất biến.
- Import: CSV và XLSX thật, preview chưa ghi báo cáo, confirm lặp, replace giữ nguồn cũ, append bỏ trùng và khóa khi thiếu line ID, bỏ ngày xuất chưa đủ, chuyển bán giữ tồn/inbound/vòng đời/test. JSON V9: phát hiện trùng/số nhận lệch, giữ tồn unknown, không seed sales cũ; nhập lệnh đã xóa có 2 biên nhận và nguồn editLog, nhập bản nháp giữ trạng thái.
- HTTP: anonymous 401; Origin/CSRF 403; Viewer/Warehouse bị chặn sửa; export Excel đọc ngược bằng ExcelJS xác nhận ma trận XS…2XL.
- Lark **mock** (bao gồm PKCE, callback đồng thời, provider lỗi, provider từ chối và error redirect an toàn): thiếu cấu hình 503, state sai/hết hạn/replay bị chặn, tenant sai bị chặn, người mới Viewer với danh tính riêng; production từ chối DEV_AUTH=true. Không dùng credential thật trong test.

## Kiểm tra trình duyệt

Chromium hệ thống + Python Playwright, locale vi-VN, múi giờ Việt Nam. Smoke dùng backend cổng 3002 trỏ database `_test`, frontend cổng 5175; tách khỏi ứng dụng phát triển/database chính.

Đã trực tiếp thao tác: đăng nhập DEV được gắn nhãn → thêm SKU → sửa số bán/tồn/inbound → chọn Tăng trưởng → đề xuất 60 → chọn vào lệnh → lưu Nháp → nhận 30, hiển thị 50% → sửa số đặt thành 80, giữ nhận 30 → xem revision → tải Excel → xóa mềm → khôi phục. Không có JavaScript page errors. Kiểm tra dashboard ở 1440px và 390px; mobile không có tràn ngang toàn trang, bảng có vùng cuộn riêng.

Lần chạy smoke đầu dừng ở assertion dùng locator không duy nhất cho lý do sửa (cùng xuất hiện trong revision và audit); đây là lỗi locator của bài kiểm tra. Các thao tác trước đó đã thành công. Đã đổi locator sang summary của revision và tiếp tục xác nhận export/xóa/khôi phục/mobile. Không mô tả lần chạy đầu là vượt qua toàn bộ.

Bản build cũng đã được Node phục vụ với NODE_ENV=production, DEV_AUTH=false và origin HTTPS thử nghiệm: trang đăng nhập render, không có nút DEV, health 200, dữ liệu anonymous 401, không lỗi JavaScript. Đây là smoke local, không phải deploy HTTPS thật. Đã kiểm tra các giá trị secret backend cục bộ không xuất hiện trong assets frontend được build.

`tests/serve-smoke.ts` chuẩn bị lại database test trước khi mở backend smoke. Lệnh này **xóa dữ liệu trong database _test**; không chạy song song `npm test` hoặc với dữ liệu cần giữ. Browser smoke đã chạy thủ công bằng công cụ trong phiên; chưa được đóng gói thành suite CI Playwright tự động.

## Chuẩn bị Railway

Đã kiểm tra APP_BASE_URL, domain Railway do nền tảng cấp, từ chối origin cũ xung đột, callback cùng origin; health anonymous trên `/health` và `/api/health`, database lỗi trả 503 không lộ thông tin kết nối. Chưa có Project/URL Railway, chưa kiểm tra HTTPS hoặc OAuth live. Docker build đã tải được base image nhưng bị kẹt tại npm ci; kiểm tra độc lập fetch npm registry trong container trả TypeError. Đã dừng build bị chặn. Build npm trên host thành công; chưa xác minh Docker image hoàn chỉnh hoặc việc Railway chấp nhận railway.json.

## Chẩn đoán lỗi Lark OAuth

Khi provider thất bại, log `Lark OAuth failed` chỉ chứa stage (token_exchange hoặc user_info), HTTP status, mã provider dạng số và mã OAuth/network thuộc allowlist. Không log error message, response body, request config/header, code đăng nhập, token hoặc App Secret. User_info trả lỗi được phân loại 502 thay vì gán nhầm thành tenant sai; kiểm tra tenant vẫn bắt buộc khi đã có danh tính hợp lệ.

Đã kiểm tra SDK 1.76.0 thực với Axios adapter giả lập: client_id/client_secret, redirect_uri, PKCE verifier đi vào request đổi code; user_info dùng đúng user Bearer token; cả hai giữ timeout 15 giây và maxRedirects=0. Đây là kiểm tra contract cục bộ, không gọi API thật hoặc chứng minh app/secret/quyền trong tenant đã đúng. Cần log đã lọc từ deployment thực để chẩn đoán lỗi provider.

## Phân biệt tenant mismatch và tài khoản bị khóa

Backend dùng tenant key đã trim khoảng trắng đầu/cuối (giữ nguyên chữ hoa/thường) cho đối chiếu và CLI bootstrap. Giá trị có dấu nháy hoặc khoảng trắng bên trong trả lỗi cấu hình rõ, không âm thầm đổi tổ chức. Callback tách tenant_mismatch và account_disabled; UI hiển thị lý do cụ thể và nơi cấu hình. Log từ chối chỉ có reason và fingerprint SHA256 rút gọn của tenant; không log key thô, tên hoặc open_id.

Tests xác minh tenant khác vẫn 403 và không tạo người dùng, redirect lỗi cụ thể, tenant có whitespace ngoài vẫn vào đúng Viewer, tài khoản disabled vẫn bị chặn và không có session đăng nhập. Không tự bật tài khoản, không bỏ tenant check hoặc tin tenant đầu tiên. Tenant key sai thực tế trên Railway vẫn cần người quản trị nhập đúng data.tenant_key của tổ chức công ty; Codex không có quyền đọc/sửa Railway Variables. Chromium đã kiểm tra cả hai thông báo, xóa query lỗi và bố cục 390px không tràn, không lỗi JavaScript. Lần mở đầu trùng lúc Vite tối ưu dependency và tự reload nên assertion thiếu thông báo; sau khi cache ổn định, chạy lại cả hai trường hợp thành công. Không ghi nghiệp vụ trong kiểm tra giao diện.

## Sửa luồng token web và PKCE theo tài liệu chính thức

Log deployment do người dùng cung cấp có HTTP 400, providerCode 20049, invalid_grant ở token_exchange. Tài liệu chính thức xác nhận 20049 là PKCE challenge failed. Đã thay helper SDK trỏ `/oauth/v3/token` bằng endpoint web được tài liệu chỉ định `https://open.larksuite.com/open-apis/authen/v2/oauth/token`. Không khẳng định endpoint cũ là nguyên nhân duy nhất khi chưa thử lại OAuth thật.

Test end-to-end cục bộ mới dùng router/session PostgreSQL thực, SDK HTTP transport thực và provider adapter giả lập: tạo authorize URL, lưu session/verifier, callback với code mới, kiểm tra SHA256(verifier) đúng challenge S256 từ URL, cùng client_id/redirect_uri, đúng endpoint v2/body JSON, user_info Bearer, tạo Viewer cá nhân và chặn callback replay. Cả token và user_info có timeout và chặn redirect. State một lần, PKCE và tenant check được giữ nguyên; không fallback endpoint/retry cùng code. Thử lại trên Railway bằng luồng đăng nhập mới vẫn là bước cần người dùng thực hiện.

## Sửa khởi động khi thiếu migrations trên Railway

`npm start` hiện chờ migration hoàn tất trước khi mở cổng HTTP, bổ sung cho pre-deploy hook để tránh host bỏ qua config-as-code ở monorepo. Migrations giữ transaction/advisory lock và bảng phiên, không seed lệnh hoặc số bán. Kết nối có timeout 10 giây; lỗi khởi động chỉ ghi mã lỗi và hướng dẫn, không ghi URI/password.

Đã thử tiến trình production với PostgreSQL cục bộ trên database tổng hợp mới, tên kết thúc `_test`: ban đầu không có bảng; khởi động tự áp dụng 4 migrations, `/health` 200, API anonymous 401, policy vẫn 5 ngày và không có lệnh. Khởi động lại không áp dụng SQL đã chạy. Trỏ tới cổng database không tồn tại: tiến trình thoát 1 trước khi listen, log không chứa mật khẩu. Database thử riêng đã được xóa sau kiểm tra, không tác động database nghiệp vụ. Integration test xác minh hai migration đồng thời giữ nguyên lệnh/biên nhận đã nhận một phần.

Lỗi báo cho người dùng được tách giữa thiếu bảng (`42P01`) và lỗi kết nối. Chưa có quyền xem Postgres/variables/logs của Railway thực tế để kết luận nguyên nhân ở deployment của người dùng.

## Kiểm tra bản sửa điểm mở web và cấu hình HTTPS

Lệnh mặc định ở root hiện chạy ERP trên Vite 5173 cùng backend 3001; không mở ứng dụng đặt xe cũ. Chromium đã kiểm tra trang đăng nhập hiển thị đúng tên biến Lark còn thiếu, đăng nhập/đăng xuất DEV, dashboard ở desktop và 390px, anonymous `/api/me` trả 401 sau logout và xóa query lỗi đăng nhập khỏi thanh địa chỉ. Không có JavaScript page errors; không tạo hoặc sửa SKU/lệnh trong lần kiểm tra này.

`docker compose --env-file .env.production -f compose.https.yaml config --quiet` thành công với cấu hình tổng hợp tạm thời (đã xóa sau kiểm tra). Caddy 2 validate cấu hình HTTPS thành công bằng hostname dự kiến. Không khởi động dịch vụ công khai, không thay DNS hoặc cấp chứng chỉ trong lần validate. TypeScript kiểm tra cả scripts triển khai. Các kết quả này không chứng minh hosting hoặc OAuth thật đã hoạt động.

## Backup / restore đã diễn tập

Đã dùng PostgreSQL `pg_dump --format=custom` và `pg_restore --clean --if-exists --no-owner --exit-on-error` trong container để phục hồi **dữ liệu tổng hợp kiểm thử** từ `comsflow_test` sang `comsflow_restore`. Đối chiếu khớp: 2 lệnh, 2 dòng, 2 biên nhận, 750 sản phẩm đã nhận, 750 đơn vị trong biên nhận, 1 revision. Hash JSON của các biên nhận và revisions giống nguồn. Không phục hồi đè database vận hành. Scripts shell backup/restore đã kiểm tra cú pháp; chúng cần PostgreSQL client trên máy vận hành.

## Chưa được xác minh

Đăng nhập Lark thật; tenant/app publication; mở từ icon desktop/mobile Lark; quyền Base thật và mapping field; deploy HTTPS/Docker image tại hosting; diễn tập phục hồi dữ liệu công ty và đăng nhập sau restore; tải lớn; nhiều replica; phục hồi ở cloud task mới. Không lấy kết quả mock/local làm bằng chứng cho các mục này.

## Chạy lại

Từ `production/`, chuẩn bị `.env.local`, database riêng kết thúc `_test`, chạy `npm ci`, `npm run build`, `npm test`. Runner không tạo database; chỉ cho phép suffix `_test`. Các tests reset dữ liệu test bằng TRUNCATE CASCADE, không thay source hoặc lockfile. Nếu có lỗi, giữ nguyên exit status và kiểm tra output thay vì chỉ nhìn số test cuối cùng.

## Nút thao tác và khởi tạo quyền ban đầu

File V9 gửi lại khớp SHA với bản gốc. 7 tests mới kiểm tra thiếu cấu hình không nâng quyền; sai Open ID/tenant, disabled hoặc đã có admin đều bị chặn; hai yêu cầu đồng thời chỉ một lần thành công/audit; đã tiêu thụ không tái dùng sau hạ quyền; API chỉ đọc danh tính của mình, cần session/CSRF, không nhận target/role từ browser.

Chromium với database tổng hợp `_test` riêng xác minh Administrator/Planner thấy tạo lệnh và thêm SKU, Viewer/Warehouse không tạo được; Viewer thấy cảnh báo đúng quyền và thông tin tài khoản của chính mình; không có nút kích hoạt khi chưa được chủ hosting chỉ định. Mobile 390px không tràn và không lỗi JavaScript. Chỉ đổi role của fixture DEV trong database test để kiểm tra UI, không sửa tài khoản Lark thật hoặc lệnh thật.

Đã bấm nút bootstrap trong Chromium bằng danh tính tổng hợp được cấu hình trên backend test: trước là Viewer, sau request thành công và reload là Administrator; nút tạo lệnh và tab Phân quyền xuất hiện; nút khởi tạo biến mất. Đây không phải cấp quyền cho tài khoản công ty trên Railway.

## Trang Thiết lập tài khoản

107 tests đạt; 11 tests mới kiểm tra tạo 5 vai trò, mặc định quyền hợp lệ/đúng tenant, chặn trùng Open ID và trường ngoài schema, đổi quyền với reason/version/audit, hai người cập nhật cùng version, bảo vệ admin cuối cùng (admin thay thế phải đăng nhập Lark), hai Admin hạ quyền đồng thời, thu hồi session khi khóa, mở lại giữ lịch sử, cách ly tenant và kiểm tra lại actor trong transaction. HTTP tests xác nhận anonymous/Viewer/CSRF bị chặn, Admin thêm và xem lịch sử được. Test Lark bổ sung xác nhận thành viên đã được thêm trước giữ vai trò sau lần đăng nhập đầu, tên được xác minh từ Lark.

Chromium đã thao tác thêm thành viên tổng hợp, đổi Planner→Manager, khóa, mở lại thành Viewer, đọc lý do trong audit, xem ma trận, chặn hạ admin cuối cùng bằng 409, kiểm tra 390px không tràn; sau đổi role fixture sang Viewer chỉ còn hồ sơ của mình, API danh sách thành viên trả 403. Không có page errors. Lần smoke đầu dừng ở locator get_by_label của select; đã đổi sang combobox theo accessible name rồi chạy đầy đủ thành công. Dữ liệu và tài khoản đều ở database tổng hợp _test, không thay đổi tài khoản công ty trên Railway.

Đã diễn tập khởi động production trên database thử trống: 5 migrations tự áp dụng, health 200, anonymous 401, restart không lặp SQL đã áp dụng và database không kết nối khiến app thoát trước listen với log đã lọc. Không cần thêm quyền đọc danh bạ Lark cho chức năng này.


## Hồi quy thao tác V9 — 17/10/2026

119 tests đạt, không skip. Build TypeScript/Vite được chạy lại sau bản sửa. [V9_ACTION_FIXES.md](V9_ACTION_FIXES.md) ghi từng vấn đề và hành vi mới.

Chạy browser smoke trên dữ liệu tổng hợp riêng, theo thứ tự (không chạy đồng thời npm test):

```bash
# Terminal 1, thư mục production; script xóa và tạo lại dữ liệu _test.
node --import tsx tests/serve-smoke.ts
# Terminal 2, cùng thư mục.
API_TARGET=http://127.0.0.1:3002 node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5175 --strictPort
# Terminal 3; cần Python playwright và Chromium /usr/bin/chromium.
python tests/browser-workflow.py
python tests/browser-sales.py
```

Các script không cài Playwright vào runtime ứng dụng và không chạy trong npm test/CI mặc định. Không đổi địa chỉ sang deployment thật. Chạy lại từ đầu cần khởi động lại serve-smoke để tạo lại database thử.

Browser core đã xác minh lập lệnh từ danh mục trống; thêm hai màu và size mới trong ma trận; lưu; nhận hai đợt; chặn nhận quá; sửa/thêm màu sau nhận; revision; tải Excel/CSV; gọi in và kiểm tra mã lệnh trong chế độ print; dialog lý do hủy/mở lại/xóa/khôi phục; nhập tồn/test; chọn SKU vào lệnh. Cố ý làm request refresh thất bại sau POST thành công: form đóng và cảnh báo tải lại, không nhân đôi lệnh. Kiểm tra lỗi mã trùng xuất hiện trong dialog và giữ giá trị nhập. Responsive 390px.

Browser sales đã xác minh import CSV thực bằng file input, preview chưa ghi, xác nhận báo cáo, loại số đơn hủy và tách combo, nhập tồn/đang về/vòng đời ngay trong báo cáo, file export theo bộ lọc và có phân loại combo. Chuyển mã MIU66 đang lọc không tạo mã MIU37 ngoài bộ lọc; giữ stock=30, inbound=10, lifecycle=Tăng trưởng. Bán 10+30 trên hai ngày cho đề xuất 60 theo mặc định 5 ngày. Thêm SKU nhiều màu/size và đặt lại/lưu policy V9 được bấm qua UI.

Đã chạy lại browser quản trị tài khoản sau sửa nhãn Field: thêm thành viên, đổi vai trò, khóa/mở, nhật ký, chặn hạ admin cuối, ma trận quyền, 390px và Viewer bị chặn danh sách API. Tất cả danh tính/dữ liệu đều tổng hợp trong _test.

Trong quá trình phát triển có các lần smoke dừng do locator revision không duy nhất hoặc đọc session trước khi đăng nhập xong; đã sửa chờ/locator và chạy lại. Việc truy cập trường Nhà xưởng sau khi có datalist cũng phát hiện label chứa options; đã sửa liên kết label-control trong component Field và kiểm tra lại. Không coi các lần dừng đó là toàn bộ bài smoke đã đạt.
