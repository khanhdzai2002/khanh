# Bằng chứng kiểm thử và phạm vi xác nhận

## Đã chạy trên môi trường hiện tại

- Node.js 24.19.0, npm 11.9.0, PostgreSQL 17 trong Docker; migrations 001–005.
- `npm run build`: TypeScript và Vite build thành công. Tailwind biên dịch cục bộ; không cần CDN giao diện V9.
- `npm ci` theo lockfile chạy lại thành công. Sau cài lại, đã khởi động lại Vite để làm mới dependency optimization (server đang chạy trước đó trả 504 cho cache cũ), rồi xác minh login/logout DEV và API trả 401 sau logout.
- `npm test`: **200 tests passed, 16 files**, không có test skip. 23 tests domain, 51 tests integration PostgreSQL/HTTP và 18 tests Lark mock/security, 10 tests cấu hình origin/callback, 3 tests lọc log 2 tests SDK/web OAuth với transport giả lập 7 tests bootstrap Administrator và 11 tests quản lý thành viên và 7 tests đọc file/ma trận bán hàng, 18 tests tồn kho Lark Base, 9 tests đối soát hàng đang về và 11 tests báo cáo tỷ trọng sản phẩm và 11 tests danh sách/biểu đồ chờ sản xuất và 10 tests trạng thái hàng loạt/màu ưu tiên và 9 tests ngừng size cũ.
- Công thức: một test đối chiếu 400 đầu vào với chính hàm calc V9 trích nguyên văn, kiểm tra need/sale/raw/target/cover/flag. Có test riêng ví dụ 60, làm tròn, ngày chờ opt-in, thiếu tồn, bất thường và bốn vòng đời.
- Giao dịch: nhiều màu/size, nhận 300+450+250 từ 1.000; cho nhận vượt số đặt và nhận tiếp sau đủ hàng; còn chờ tính riêng SKU; tiến độ có thể trên 100%; idempotency đồng thời; sửa sau nhận, không giảm dưới đã nhận, không đổi SKU/xóa dòng nhận; revision trước/sau; hai người sửa cùng version; xóa/khôi phục; hủy và reopen; giữ mã đã dùng; trigger bất biến.
- Import: CSV và XLSX thật, preview chưa ghi báo cáo, confirm lặp, replace giữ nguồn cũ, append bỏ trùng và khóa khi thiếu line ID, bỏ ngày xuất chưa đủ, chuyển bán giữ tồn/inbound/vòng đời/test. JSON V9: phát hiện trùng/số nhận lệch, giữ tồn unknown, không seed sales cũ; nhập lệnh đã xóa có 2 biên nhận và nguồn editLog, nhập bản nháp giữ trạng thái.
- HTTP: anonymous 401; Origin/CSRF 403; Viewer/Warehouse bị chặn sửa; export Excel đọc ngược bằng ExcelJS xác nhận ma trận S/M/L/XL.
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


## XLSX mẫu và ma trận báo cáo — 17/10/2026

132 tests đạt trong 10 file. Bảy tests `sales-file.test.ts` kiểm tra row XML lặp số dòng, ghép theo tọa độ, không mất header, chặn hai giá trị cho cùng ô, rich text/shared strings/ngày số, tìm header/worksheet, CSV/thiếu cột, ZIP/XML/DTD và tổng ma trận. Tests integration bổ sung inspect không ghi/quyền/CSRF, preview/confirm với fixture Excel phân mảnh, ngày xuất chưa trọn, kỳ con, 1.200 dòng tổng hợp/phát lại, xuất XLSX ma trận đọc ngược theo size/tổng và xuất riêng nhóm bị loại. Kiểm tra thêm ngày bán và append không lệch khi process TZ=Asia/Ho_Chi_Minh.

Đã kiểm tra file thật người dùng gửi **chỉ đọc trong bộ nhớ**, không import vào database hoặc đưa nội dung file/đơn vào Git. Dùng `npm run sales:check -- <file>`; đầu ra là metadata/tổng hợp, không in mã đơn/người mua/liên hệ. Xem [SALES_REPORT.md](SALES_REPORT.md).

Smoke Chromium trên dữ liệu tổng hợp: `browser-sales.py` đã cập nhật cho UI ma trận/tab mới và nhận diện file trước preview. `browser-sales-xlsx.py` tạo fixture XLSX phân mảnh trong /tmp: kiểm tra tự điền kỳ/thời điểm xuất, preview ma trận đủ tổng trước ghi, xác nhận, M/L/tổng đúng, bỏ ngày chưa trọn trong tốc độ, CSV ma trận có S/M/L/XL, tab biểu đồ và xuất chỉ nhóm loại trừ, responsive 390px sau khi điều hướng hoàn tất animation. Không có pageerror. Chạy sau serve-smoke/Vite như hướng dẫn trước:

```bash
python tests/browser-sales.py
python tests/browser-sales-xlsx.py
```

Luồng core lệnh/giao nhận đã chạy lại bằng `browser-workflow.py` và đạt. Không chạy npm test đồng thời với smoke vì cùng database _test. `npm ci --dry-run --ignore-scripts --cache /workspace/.npm-cache` xác nhận lockfile nhất quán; đây là dry-run, không mô tả là đã cài lại dependencies trong đợt này. TypeScript/Vite build được chạy lại với các dependency pin mới. Không khẳng định deployment Railway mới đã hoạt động trước khi kiểm tra trực tiếp trên hosting.


## Tồn kho Lark Base

15 tests mới kiểm tra nhập tồn đầu tiên cho SKU chưa có tồn dù ngày tạo danh mục mới hơn nguồn, URL Wiki/Base/SSRF, quy tắc ngày mới nhất/ô trống=0/XXL, timestamp và công thức, dòng trùng, giá trị âm/lẻ/lỗi, phân trang search API đúng view, quyền API/tài liệu bị từ chối, cột đổi tên, source version, preview không ghi tồn, confirm thay thế giữ nguyên V9 inputs, idempotency, snapshot/audit trước–sau, tạo SKU có lựa chọn, rollback khi xung đột, bảo vệ tồn mới, hết hạn preview, quyền Administrator/session/CSRF. Migration 006 chỉ thêm bảng cấu hình nguồn; test migration kiểm tra đủ 7 migrations và chạy lại/đồng thời không sửa lệnh, biên nhận hay lịch sử.

`python3 tests/browser-lark-inventory.py` với `tests/serve-smoke.ts` + Vite 5175: Chromium desktop/390px, đọc cột Lark giả lập, mặc định ô trống=0, ánh xạ XXL, lưu nguồn thật vào `_test`, preview dùng record tổng hợp và không ghi SKU, xác nhận qua API thật tạo đúng 5 SKU (tổng 23), tải lại giữ cấu hình, không lỗi JavaScript/tràn trang. Nguồn Lark được giả lập; chưa kiểm thử quyền hoặc dữ liệu Base thật. Không sửa dữ liệu công ty.


## Thao tác nhanh dự kiến sản xuất

9 tests `inbound.test.ts` kiểm tra cộng phần còn chờ nhiều lệnh, lọc nháp/tạm dừng/hủy/xóa/đã đủ, chọn bổ sung nháp/tạm dừng có chủ ý, thay số nhập tay không cộng dồn, khóa đúng size/phạm vi, số0 khi không còn lệnh, không sửa tồn/ngày tồn/doanh số/vòng đời, snapshot/audit, idempotency kể cả confirm đồng thời, xung đột SKU/lệnh/biên nhận/lệnh mới, hạn15phút, chủ preview và quyền/CSRF ở HTTP. 3 tests Lark bổ sung giới hạn phạm vi SKU, giữ nguyên SKU không tìm thấy và cho Planner xác nhận bản của mình nhưng không cấu hình nguồn/đọc toàn bộ nguồn.

`python3 tests/browser-planning-flow.py` với `serve-smoke.ts` + Vite5175 đạt: Growth thiếu tồn khóa nhanh; chọn SKU M → đọc Lark giả lập/preview không ghi → confirm thật chỉ cập nhật M30, giữ S25 → đối soát đặt30/nhận10=20, loại nháp; đổi tùy chọn khóa confirm cho đến khi tính lại → confirm thật giữ tồn/vòng đời → đề xuất20×5−30−20=50 → nút nhanh mở editor tại trang lệnh, chưa ghi cho đến khi lưu → lưu lệnh Nháp50 thật trong `_test`. Desktop1440/mobile390px không lỗi JS hoặc tràn trang. Toàn bộ dữ liệu là tổng hợp, không gọi Base công ty thật.


## Báo cáo tỷ trọng sản phẩm sản xuất

11 tests `production-report.test.ts` xác minh tỷ trọng số lượng (không dùng số lệnh), cơ sở đặt/còn chờ, lọc lệnh/xưởng/mã/ngày Việt Nam, mẫu số toàn lệnh khi lọc riêng mã, số đã nhận của size đã đủ trong mã còn chờ, loại xóa/hủy/nháp/tạm dừng, màu-size cộng khớp tổng, lệnh duy nhất/quá hạn, số0 và ngày sai, CSV/Excel với DB/session/Viewer. `browser-production-report.py` đạt desktop1440/mobile390px: tab báo cáo, mở ma trận và lệnh chi tiết, lọc mã/xưởng/lệnh, đổi cơ sở, CSV đúng bộ lọc, chặn ngày đảo ngược và bật nháp có chủ ý; không lỗi JavaScript/tràn trang. Chỉ dữ liệu tổng hợp `_test`, không thao tác dữ liệu công ty.


## Bảng chờ sản xuất và donut

9 tests `pending-production.test.ts` kiểm tra nhóm mã/màu/size nhiều lệnh trừ nhận, search không dấu nhiều từ, lọc size/xưởng/trạng thái/ngày Việt Nam, bỏ xóa/hủy/đã đủ và nháp/tạm dừng mặc định, donut top8+Khác không thiếu số lượng, tổng size/nhóm/xuất khớp nhau, ngày sai/dữ liệu0, lệnh duy nhất/quá hạn, CSV/Excel xác thực/Viewer từ `_test`. `browser-pending-production.py` đạt desktop1440/mobile390px: bảng ngay dưới danh sách lệnh, donut cùng bộ lọc, MIU66/Xám tiêu S85 M60 L40 từ dữ liệu tổng hợp, tìm không dấu, nguồn lệnh qua modal và mở chi tiết, CSV đúng bộ lọc, lọc size/xưởng/mã/màu, chú giải, không kết quả, ngày sai và nháp chủ động. Không lỗi JS/tràn trang, không đổi dữ liệu công ty.


## Trạng thái hàng loạt và màu ưu tiên

10 tests `bulk-order-status.test.ts` đạt: batch atomic, giữ item IDs/qty/received/priority/metadata, immutable receipt, version conflict rollback, hủy/xóa/giao đủ, no-op và mixed, concurrent batches, reason/schema/duplicate/max200, quyền DB và HTTP/CSRF, highest priority/tone. Chromium `browser-bulk-order-status.py` đạt desktop/mobile: chọn hợp lệ (giao đủ disabled), lý do bắt buộc, đổi2lệnh thật ở `_test`/revision, cạnh tranh409 không thay lệnh còn lại, màu3mức của chú giải và select đổi ngay, badge chi tiết, không lỗi JS/tràn trang. Không sửa lệnh thật.


## Mở rộng mã → màu → size → lệnh từ donut

2tests thêm vào pending-production kiểm tra mẫu số tỷ trọng trong mã/trong màu/trong bộ lọc, số lệnh duy nhất, cộng màu/size bằng tổng và trạng thái dữ liệu0/đã lọc. Browser pending-production mở mã ngay tại chú giải không lọc ngầm, thấy size trong màu mặc định, kiểm tra tỷ trọng, size0disabled, chọn sizeS chỉ có cộtS/nguồn cóS còn chờ, bấm mã lệnh mở chi tiết; Lọc riêng mã vẫn dùng được; desktop/mobile không tràn/lỗi JS.

Fixture HTTP bootstrap Administrator nay đợi đọc xong response tạo session trước khi dùng cookie, tránh đua giữa nhận headers và ghi session PostgreSQL. Không đổi logic xác thực hoặc phân quyền của ứng dụng.


## Ngừng hai size cũ

9 tests `retired-sizes.test.ts` kiểm tra policy4size, historical SKU đọc được nhưng không dự báo, backend/DB chặn tạo/thêm/tăng, giữ ID/số đặt/nhận khi sửa metadata và nhận tất toán lịch sử, danh mục/báo cáo chỉsizehiệnhành, không ánh xạ XS→S/XXL→XL, mappingLark/version. Fixture lịch sử dùng riêng `_test`, tạm nạp dữ liệu mô phỏng trước policy rồi bật lại các trigger trước mọi assertion. Migration không xóa dữ liệu cũ. Các test trước cập nhật đủ4cột và tổng tương ứng. 6browserflows đạt (active sizes, core workflow, planning flow, Lark inventory, sales XLSX, pending production) trên dữ liệu tổng hợp, gồm desktop/mobile.

## Giao dư thành phẩm — migration 008

201 tests đạt. Test mới xác minh nhận 15 rồi 2 từ số đặt 10 (170%), sửa metadata giữ số đặt 10, giao dư một SKU không bù thiếu SKU khác dù tổng trên 100%, chặn dòng không thuộc lệnh và số âm. Chromium kiểm tra nhận qua UI, cột giao dư, 125%/130%, nhận thêm sau đủ, xuất CSV, sửa metadata và mobile. Chỉ dùng dữ liệu tổng hợp trên database `_test`; chưa xác minh deploy Railway thực tế.

Luồng Chromium V9 đầy đủ cũng đạt: danh mục trống → lệnh nhiều màu/size → lưu → kiểm tra dữ liệu đầu vào → hai đợt nhận → sửa/thêm màu → file/in → hủy/khôi phục → xóa mềm/khôi phục → dự báo → mobile.

## Nhập liệu hàng về — migration 009

216 tests / 17 files đạt. 15 tests mới kiểm tra màu tiếng Việt theo từng mã, không đoán khi nhiều màu phù hợp; ảnh nháp lưu DB không gửi ngoài; magic bytes/giới hạn/trùng ảnh; version nháp; nhận vượt, retry đồng thời chỉ một biên nhận; ảnh đã xác nhận không nhập lại; chia SKU qua nhiều lệnh/gộp nhiều bao; xung đột rollback toàn bộ; null/âm/size đã ngừng/mã sai/dòng lệnh sai; quy ước màu không bị ghi đè; quyền/CSRF/chủ phiếu; OCR chưa cấu hình, payload endpoint cố định, giữ null, JSON lỗi/truncated/provider lỗi không ghi dữ liệu; ảnh chứng từ chỉ đọc từ lệnh liên quan.

Chromium `browser-incoming-goods.py` với `serve-incoming-smoke.ts` dùng provider mô phỏng trong backend và ảnh PNG tổng hợp: upload/đồng ý/đọc → chặn tự chọn màu mơ hồ hoặc lệnh khi có hai lệnh → sửa null → tách SKU sang ba lệnh → lưu/mở lại nháp → xác nhận155 sản phẩm → quy ước theo mã áp dụng phiếu sau → ảnh và liên kết mở đúng lệnh → nhập bảng thủ công → mobile không tràn trang. Luồng không gọi OpenAI thật, không dùng ảnh hay dữ liệu công ty. Model trả một lượng tổng hợp cố định chỉ trong runner test; production không có chế độ giả kết quả nhận dạng.

Cần API key thật và sự đồng ý dùng nhà cung cấp để kiểm tra OCR thực tế; chưa xác minh độ chính xác chữ viết tay/hosting Railway với công ty. Không tuyên bố OCR live đã hoàn tất.

Chạy bổ sung: `browser-incoming-manual.py` xác minh backend không có OCR key vẫn nhập Đen theo danh mục, chọn đúng lệnh duy nhất và ghi nhận125 từ số đặt100. Luồng Chromium V9 tạo/sửa/nhận/hủy/khôi phục/xóa mềm và mobile cũng đạt sau khi thêm module.

## Nhà cung cấp OCR Gemini

226 tests /18 files đạt. 10 tests Gemini mới kiểm tra chọn nhà cung cấp/tự nhận khóa khi chỉ có Gemini, giữ tương thích OpenAI, không dùng nhầm khóa/model, chặn model URL, payload inlineData/API key qua header/JSON MIME, giữ null, bỏ thought text, chặn safety/truncated/JSON lỗi, HTTP429 và lỗi mạng không retry/failover. Test route bổ sung chặn client cũ đã đồng ý OpenAI khi backend chuyển sang Gemini trước khi gọi mạng.

Chromium luồng phiếu đầy đủ đã đạt với `INCOMING_SMOKE_PROVIDER=gemini` và `INCOMING_EXPECT_PROVIDER=gemini`: tên Google Gemini ở ô đồng ý, upload → nhận dạng qua backend mô phỏng Google → kiểm tra/ánh xạ → chia3 lệnh → lưu/mở lại nháp → nhận155 → ảnh chứng từ/liên kết lệnh → áp dụng quy ước cho phiếu tiếp → mobile. Không dùng API key thật, không gửi ảnh công ty, chưa xác minh OCR hoặc hạn mức Gemini live.

Đã chạy lại cùng luồng Chromium với `INCOMING_SMOKE_PROVIDER=openai`; luồng tương thích OpenAI cũng đạt sau thay đổi provider/consent.

## Hiện hành: ảnh đối chiếu, nhập tay và tự động cộng dồn

Theo yêu cầu mới, đã bỏ adapter OCR và các bài test provider không còn áp dụng; `/read` cũ trả410 và test xác minh không gọi mạng ngay cả khi có khóa cũ. 232 tests /18 files đạt, gồm19 tests cộng dồn mới: FIFO theo thời gian lệnh; trừ nhận trước; nhiều bao dùng chung sức chứa; dòng thủ công trừ trước; đúng mã–màu–size; dư cần chọn lệnh; không khớp không tạo lệnh; xóa/hủy loại trừ; Nháp/Tạm dừng phải bật; xưởng mơ hồ phải chọn; preview không ghi; xác nhận nhiều lệnh atomic/idempotent; tồn/số đặt gốc giữ nguyên; stale/new order/expired/draft version/tampered form/khác chủ-phiếu bị chặn; hai phiếu tranh cùng sức chứa chỉ một bên nhận theo preview cũ. HTTP kiểm tra quyền và CSRF endpoint allocate, giữ ảnh chứng từ đúng lệnh.

Chromium `browser-incoming-goods.py` dùng ảnh PNG tổng hợp và backend thật trên `_test`: dropdown chỉ có mã đã đặt, màu phụ thuộc mã, size có trong lệnh, xoay/phóng ảnh → nhập300 → preview150+150, chưa ghi biên nhận → lưu/mở lại → xác nhận hai biên nhận → màu khác không bị cộng → stock/inbound không đổi → mở đúng lệnh/ảnh nguồn → phần dư50 chỉ phân bổ sau khi chọn lệnh → mobile không tràn. `browser-incoming-manual.py` xác minh chọn lệnh thủ công vẫn nhận125 trên số đặt100.

Một lần chạy suite gặp test fixture tài khoản dùng cookie ngay khi mới nhận headers, trả401 thay vì403. Đã sửa helper test chờ response body hoàn tất (cùng nguyên nhân fixture bootstrap đã từng gặp); không đổi auth production. Suite chạy lại đạt232/232.

Bảng tổng theo mã–màu–size có test riêng: hai lệnh còn150+200, nhận100 chỉ chạm lệnh đầu nhưng tổng còn thiếu sau vẫn là250 (không bỏ lệnh chưa cần phân bổ).

## Ma trận S/M/L/XL và nhóm bao

241 tests /19 files đạt. 8 tests helper mới bảo toàn số lượng/ID/null/lệnh theo size khi gom phiếu cũ, giữ thứ tự bao, không gộp nhầm hai dòng cùng size, không gộp bao/dòng có ID riêng dù trùng nhãn, chuẩn hóa nhóm idempotent và JSON roundtrip. Integration test mới xác nhận bốn ô size chung bao vẫn phân bổ FIFO300 thành150+150 và lưu nguyên ID bao/dòng tại backend.

Chromium mới `browser-incoming-matrix.py`:8 dòng SKU cũ →2 bao/4 dòng màu, giữ3/1/2/4 theo S/M/L/XL →đổi số bao một lần →thêm bao và thêm màu kế thừa bao/mã →hai dòng cùng màu không bị nhập chung →save/reload16 ô dữ liệu, giữ tất cả ID cũ →xác nhận391 sản phẩm, kiểm tra đúng17 chiếc sizeS MIU15 qua nhiều bao/dòng →mobile không tràn. Dữ liệu tổng hợp `_test`, không dùng ảnh hoặc lệnh công ty. Kèm các luồng FIFO/ảnh và chọn lệnh thủ công hiện có đã cập nhật thao tác theo ma trận.

## Hàng nhận chưa đối chiếu và dashboard hàng về — migrations010–011

256 tests /20 files đạt. 15 tests mới xác minh size chưa có variant/lệnh vẫn nhận vào sổ chưa đối chiếu;204 thực nhận=150 theo lệnh+54 ghi riêng; phải xác nhận phần chưa đối chiếu và chọn xưởng; hàng sửa/lô cũ có thể chủ động ghi riêng dù có SKU trùng; mã/màu mới chỉ lưu văn bản không tạo SKU/lệnh/tồn; retry đồng thời chỉ ghi một bản; ledger bất biến; xưởng mơ hồ/lệnh thủ công sai vẫn bị chặn; lệnh mới sau preview yêu cầu tính lại; mã–màu–size nhập tay khớp đúng variant khi ghi nhận và không khớp nhầm màu khác; nguồn biên nhận trực tiếp và lịch sử xóa tính một lần; ngày báo cáo theo ngày nhận và nợ là hiện tại; lọc SKU/màu/size/xưởng/phân loại/tìm không dấu; CSV cùng dữ liệu đủ, chống công thức; tổng/tỷ trọng/giới hạn dòng không lệch; Viewer đọc báo cáo/CSV được nhưng không ghi; snapshot xưởng biên nhận mới không đổi theo lần sửa metadata lệnh sau đó.

Chromium `browser-unmatched-receiving.py` dùng ảnh PNG tổng hợp, API thật trên `_test`: cả4 size mở nhập →204M+54XL chưa có SKU+10S mã lô cũ →preview150 theo lệnh/118 chưa đối chiếu →xác nhận riêng →ghi268 physical units atomic →không tạo SKU/lệnh hoặc đổi stock/inbound →dashboard268/150/118, nợ100 của màu khác giữ nguyên →donut/matrix/debt →lọc chưa đối chiếu+XL ra54 và CSV khớp →mobile không tràn. `browser-incoming-goods.py` xác minh luồng FIFO150+150, lưu/mở lại, nhận dư theo lệnh và nguồn ảnh vẫn hoạt động với danh mục mở rộng.

Chỉ dữ liệu tổng hợp; không thay đổi dữ liệu công ty hoặc gọi dịch vụ AI. Chưa xác minh deploy Railway live. Biên nhận cũ thiếu snapshot xưởng giữ fallback xưởng trên lệnh hiện tại; không backfill lịch sử bất biến.

## Ảnh sản phẩm và loại hàng — migration012

264 tests /21 files đạt; build TypeScript/Vite thành công. 8 tests mới kiểm tra một ảnh theo mã dùng chung các màu/size; dashboard không chứa bytes/base64; kiểm tra định dạng/kích thước ảnh và enum; thay/gỡ ảnh, đổi loại không làm mất ảnh; audit chỉ chứa metadata/hash; khóa phiên bản cập nhật đồng thời; loại mặc định/override/null được lưu riêng trên lệnh; thay mặc định không đổi lệnh cũ; sửa loại giữ số nhận và biên nhận bất biến, có revision; client cũ giữ loại cũ cả khi lệnh hủy; compose size mới kế thừa đúng mã; ảnh yêu cầu đăng nhập, Viewer đọc được nhưng không ghi, Planner ghi đúng CSRF; CSV giữ loại của lệnh.

Chromium `browser-product-profiles.py` dùng ảnh áo vẽ tổng hợp trên `_test`: chọn ảnh và tối ưu JPEG → thiết lập dùng chung hai màu/size → ảnh ở Dự kiến → Lên lệnh nhanh gợi ý In → phóng to/Escape giữ biểu mẫu và60 sản phẩm → chọn Trơn, lưu lệnh → chỉnh In kèm lý do → reload giữ dữ liệu → đổi mặc định sang Trơn vẫn giữ In trên lệnh cũ → tìm mã → giao diện thiết lập và trình sửa lệnh ở390px không tràn trang. Không upload ảnh công ty hoặc gọi AI. Luồng trình duyệt V9 cốt lõi cũng kiểm tra lại tạo SKU trong lệnh, hai lần nhận, sửa sau nhận, tải CSV/Excel/in, hủy/khôi phục/xóa mềm và lưu từ kế hoạch.

## Ảnh riêng theo màu — migration013

271 tests /22 files đạt; build TypeScript/Vite thành công. 7 tests mới xác minh một ảnh theo mã–màu dùng chung nhiều size; dashboard chỉ trả metadata; chọn đúng toàn bộ tên màu, phân biệt dấu tiếng Việt và mã khác; fallback ảnh chung; thay/gỡ ảnh không ảnh hưởng màu khác, ảnh chung hoặc loại hàng; phiên bản độc lập, chống ghi đè đồng thời; chặn màu/mã không có và file giả; giữ quản lý ảnh nếu SKU màu cuối bị xóa; không đổi tồn, lệnh, số lượng hay phiên bản lệnh; ảnh cần đăng nhập, Viewer chỉ đọc, Planner ghi có CSRF, color key có dấu/các ký tự `/ &` đi qua URL an toàn.

Chromium `browser-product-color-photos.py` dùng ảnh áo tổng hợp đen/xám/xanh: MIU15 Đen M/L chia sẻ một ảnh, Xám tiêu đậm S có ảnh khác → tải hai ảnh qua giao diện → ảnh đúng trong Dự kiến, Lên lệnh nhanh, chi tiết lệnh sau reload → zoom/Escape giữ60M đen +25S xám → lưu85 sản phẩm với loại In → thay ảnh chung không đổi ảnh màu → gỡ xám chuyển về ảnh chung, đen giữ nguyên → tìm màu không dấu mở đúng nhóm → mobile390px không tràn. Luồng thiết lập ảnh chung/loại hàng cũ cũng được cập nhật tên ảnh theo màu và kiểm tra lại bằng `browser-product-profiles.py`. Chỉ dữ liệu tổng hợp `_test`; chưa xác minh Railway live.

## Nhập JSON hàng về — migration014

284 tests /23 files đạt. 13 tests mới bao gồm JSON/fence/BOM; schema/mode/type/ngày/số lượng sai bị chặn; zero/retired-size/giới hạn; lặp SKU theo bao và cộng cell trùng không ghi đè; gợi ý đúng mã, màu mơ hồ/khác dấu phải kiểm tra; preview không ghi nghiệp vụ; backend bắt buộc đủ mappings, metadata và dòng cần kiểm tra; nguồn/decisions/bao trống/bốn size giữ đúng; nguồn bất biến; retry đồng thời trả một draft; document ID chống trùng toàn hệ thống kể cả case/người khác/đang nháp; preview hết hạn/chủ khác/danh mục đổi bị chặn; nhận FIFO150+50 và10 chưa đối chiếu qua cơ chế cũ, không đổi tồn hoặc tạo lệnh; retry ghi nhận không nhân đôi; so sánh nguyên bản lệnh/biên nhận/phiếu thủ công/ảnh cũ sau import và migration; quyền/CSRF/source download.

Chromium `browser-incoming-json.py` dùng dữ liệu tổng hợp: paste210 → đánh dấu metadata, kiểm tra riêng dòng nguồn có cờ và unknown, xác nhận gợi ý màu còn lại → tạo nháp12 ô → tải JSON nguồn khớp → FIFO150/50 +10 chưa đối chiếu → xác nhận210 một lần → không đổi phiếu thủ công, tồn hoặc tạo lệnh mới → mở lại chỉ xem → chặn nhập trùng document ID → file PRODUCTION_ORDER bị chặn → mobile390px chỉ bảng cuộn, trang không tràn → module thủ công vẫn có đủ thao tác. `browser-incoming-goods.py` cũng đạt lại toàn bộ ảnh/xoay/zoom/FIFO/lưu mở lại/nhận dư/chứng từ/mobile ở module cũ.

File JSON người dùng cung cấp được đọc/kiểm tra schema tại workspace, không nhập vào database nghiệp vụ. Toàn bộ ghi thử chỉ dùng `_test` và dữ liệu SYNTHETIC; không dùng ảnh công ty hoặc gọi AI. Migration014 chỉ tạo bảng registry/trigger mới, không sửa dữ liệu cũ. Chưa xác minh Railway live hoặc bản backup production.
