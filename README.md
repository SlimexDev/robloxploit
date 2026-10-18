# RobloXploit

**Complete tasks. Unlock scripts.**

RobloXploit là kho script Roblox với giao diện tiếng Anh, nền đen/tím, hiệu ứng particles và thẻ 3D. Khách tìm bài theo tiêu đề hoặc game, hoàn thành nhiệm vụ tuần tự rồi nhận mã hoặc mở đường link. Chỉ quản trị viên được đăng bài.

## Chức năng

- Tìm kiếm, lọc theo game, phân trang, bài mới nhất trước.
- Trang chi tiết; code/link được giữ ở máy chủ cho tới khi mở khóa.
- Đăng ký kênh, xem video, like/comment; có thể gộp hoặc tách hai bước cuối. Mặc định 7 giây/bước; chỉnh trong admin.
- Mỗi lần mở lại hoặc tải lại trang chi tiết phải thực hiện nhiệm vụ lại.
- Hai kiểu nội dung: **Script code** (Copy / Raw) hoặc **Script link** (Get script mở tab mới).
- Admin thêm/sửa/xóa/ẩn/hiện bài và cấu hình kênh/video dùng chung.
- Upload ảnh JPG/PNG/WebP tối đa **3 MB**, chuyển WebP, giới hạn 1280 px và 25 megapixel.
- Admin tại `/robloxploit-slimexdev`; đường dẫn cũ `/admin` trả về 404. Vẫn bắt buộc đăng nhập.

Nhiệm vụ kiểm tra thứ tự và thời gian từ máy chủ; **không xác minh hành động thật trên YouTube**. Website chỉ lưu/hiển thị script dưới dạng văn bản, không thực thi Lua.

## Kiến trúc

| Thành phần | Online | Chạy thử cũ trên máy |
| --- | --- | --- |
| Mã nguồn | GitHub | Thư mục dự án |
| Website | Vercel Node.js Function, Express 5 + EJS | Node.js 24 |
| Database | Supabase PostgreSQL qua transaction pooler | MySQL 8.4 |
| Ảnh bài viết | Supabase Storage, bucket public chỉ chứa ảnh bìa | `uploads/` |
| Phiên và unlock | PostgreSQL, khóa giao dịch theo phiên | RAM của một tiến trình |
| Giới hạn request/đăng nhập | PostgreSQL, dùng chung giữa các instance | RAM |

Có `DATABASE_URL` thì dùng PostgreSQL; không có thì dùng cấu hình MySQL. Trên Vercel thiếu database hoặc Storage sẽ báo lỗi thay vì ghi dữ liệu vào ổ đĩa tạm. Không có bước build frontend.

## 1. Chuẩn bị Supabase

1. Tạo project Supabase và lưu mật khẩu database. Chọn vùng gần người xem và gần vùng chạy Function trên Vercel.
2. Mở **Connect → Transaction pooler**, sao chép PostgreSQL connection URI (thường cổng `6543`). Dùng đúng host từ dashboard; URL-encode mật khẩu nếu có ký tự đặc biệt.
3. Lấy **Project URL** và **service_role key** của project trong phần API settings/API keys. Key này chỉ dành cho backend; không dùng `anon`/publishable key thay thế.
4. Cài Node.js **24**, chạy tại thư mục dự án:

   ```powershell
   npm ci
   Copy-Item .env.production.example .env.production.local
   ```

5. Sửa `.env.production.local`:

   | Biến | Giá trị |
   | --- | --- |
   | `DATABASE_URL` | URI Transaction pooler của Supabase |
   | `DATABASE_CA_CERT` | Nếu kết nối báo lỗi chứng chỉ, tải CA database từ Supabase và điền PEM, xuống dòng viết `\n` |
   | `SUPABASE_URL` | `https://PROJECT_REF.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service role key bí mật |
   | `SUPABASE_STORAGE_BUCKET` | `script-covers` |
   | `ADMIN_USERNAME` | Tên đăng nhập admin do bạn chọn |
   | `ADMIN_PASSWORD` | Mật khẩu riêng, ít nhất 12 ký tự |
   | `NODE_ENV` | `production` |

6. Chạy **một lần trước khi deploy**:

   ```powershell
   npm run setup:cloud
   ```

Lệnh tạo bảng từ `supabase/schema.sql`, bật RLS, thu hồi quyền truy cập bảng ứng dụng của `anon`/`authenticated`, tạo admin với mật khẩu đã hash, tạo/cấu hình bucket ảnh bìa public. Chạy lại không xóa bài hoặc đổi mật khẩu admin đã tồn tại. Không chạy setup trong Build Command của Vercel.

Không tạo policy public cho bảng `scripts`: bảng này chứa code/link khóa. Trình duyệt truy cập qua Express; không truy vấn trực tiếp Supabase. Bucket chỉ public quyền đọc ảnh; không thêm policy cho phép khách upload/xóa.

Kết nối database xác minh TLS. Không đặt `DATABASE_SSL=disable` trên cloud và không tắt kiểm tra chứng chỉ để sửa lỗi kết nối.

## 2. Chuyển dữ liệu đang có trên máy (tùy chọn)

Nếu muốn giữ các bài và ảnh hiện tại:

1. Giữ `.env` trỏ đến MySQL local, MySQL đang chạy và có đủ thư mục `uploads/`.
2. Hoàn thành `setup:cloud`; thư viện Supabase đích phải đang trống.
3. Sao lưu database MySQL và `uploads/` trước khi chuyển.
4. Chạy:

   ```powershell
   npm run migrate:cloud
   ```

Lệnh sao chép bài, ID, nội dung, ảnh và cấu hình nhiệm vụ; giữ admin cloud đã tạo ở bước setup. Không sửa/xóa dữ liệu nguồn. Nếu đích có bài, lệnh dừng để tránh ghi đè. Ảnh được upload trước; dữ liệu bài được ghi trong một giao dịch. Khi lỗi, lệnh cố gắng xóa ảnh vừa upload; nếu máy mất mạng hoặc bị tắt giữa chừng, kiểm tra ảnh dư trong Storage trước khi chạy lại.

Nếu bắt đầu mới, bỏ qua bước này rồi đăng bài trong admin. Không upload thư mục `.runtime` hoặc MySQL data lên GitHub.

## 3. Đưa mã nguồn lên GitHub

Repository đã có `.gitignore` loại `.env*` chứa bí mật, `.runtime/`, `uploads/`, `node_modules/`, `.vercel/`, backup và log. Chỉ các file `.env.example` / `.env.production.example` mẫu được đưa lên Git.

```powershell
npm test
npm run check:release
git status --short
git add .
git diff --cached --stat
```

Kiểm tra danh sách trước khi commit. Tạo repository rỗng trên GitHub (có thể chọn private), sau đó:

```powershell
git commit -m "Prepare RobloXploit for Vercel and Supabase"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/robloxploit.git
git push -u origin main
```

Nếu đã có `origin`, kiểm tra `git remote -v` và dùng URL đúng thay vì thêm trùng. Không dùng force push. Nếu mật khẩu từng được commit, xóa file khỏi bản mới chưa đủ: phải đổi khóa/mật khẩu và làm sạch lịch sử trước khi public.

## 4. Triển khai Vercel

1. **Add New → Project → Import Git Repository**, chọn repository.
2. Framework Preset: **Other**. Root Directory: gốc repo.
3. Node.js: **24.x**. Install Command: `npm ci`. Để trống Build Command và Output Directory (không điền `public`). `vercel.json` định tuyến đến `api/index.js` và đóng gói thư mục EJS `views/`.
4. Thêm Environment Variables cho **Production**:

   ```text
   DATABASE_URL
   DATABASE_CA_CERT            (nếu cần)
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY
   SUPABASE_STORAGE_BUCKET=script-covers
   NODE_ENV=production
   ```

   Không thêm `ADMIN_PASSWORD`, `ADMIN_USERNAME`, biến MySQL local hoặc mật khẩu root local vào Vercel; tài khoản admin đã có trong PostgreSQL. Không thêm tiền tố `NEXT_PUBLIC_` vào bí mật.
5. Chọn vùng Function gần Supabase trong cài đặt Vercel, rồi Deploy.
6. Mở `https://YOUR_PROJECT.vercel.app/robloxploit-slimexdev`, đăng nhập bằng tài khoản ở bước setup.
7. Trong **Unlock tasks**, nhập kênh/video thật. Thử đăng một bài mã, một bài link, rồi mở bằng cửa sổ riêng tư để kiểm tra đủ luồng unlock.

Mỗi lần push vào nhánh production, Vercel tự triển khai lại. Nếu đổi biến môi trường, Redeploy. Preview nên dùng Supabase project riêng; nếu dùng chung Production database thì mọi sửa/xóa bài ở Preview tác động dữ liệu thật.

Ảnh gửi qua Function giới hạn 3 MB để cả form nằm dưới giới hạn payload Vercel; ảnh sau xử lý nằm trong Storage, không lưu trong filesystem của Function. CSS/JS/logo ở `public/` được phục vụ qua CDN. Code/link chỉ trả về sau unlock, các trang động không cache công khai.

Vercel Hobby dành cho dự án cá nhân phi thương mại; kiểm tra điều kiện nếu website dùng để kiếm tiền. Theo dõi Usage của cả hai dịch vụ, đặc biệt băng thông ảnh và số request; mỗi lần bắt đầu/hoàn thành nhiệm vụ đều gọi backend.

## 5. Chạy local

### Bản MySQL hiện tại

Double-click `Start-RobloXploit.cmd` trên máy đã có portable MySQL của dự án. Hoặc:

```powershell
npm ci
npm run setup
npm start
```

Website: `http://localhost:3000`; admin: `http://localhost:3000/robloxploit-slimexdev`. Thông tin tài khoản cũ ở `.runtime/ADMIN-LOGIN.txt`, chỉ có trên máy ban đầu. Máy mới cần cài MySQL, tạo database và điền `.env` theo `.env.example`; portable MySQL không nằm trong repo.

### Chạy local với Supabase

Trong `.env.production.local`, tạm đặt `NODE_ENV=development` để cookie dùng được với HTTP localhost. Dừng tiến trình đang dùng cổng 3000 rồi chạy:

```powershell
npm run start:cloud
```

Lệnh này dùng dữ liệu Supabase thật: nên dùng project thử nghiệm. Khi deploy Vercel, `NODE_ENV` phải là `production`.

## Kiểm tra

```powershell
npm test
npm run check:release
npm audit --omit=dev
```

- Unit: mật khẩu, kiểm tra URL, tuần tự/timer unlock, WebP, Storage API mô phỏng và particles.
- `npm run test:integration`: MySQL end-to-end; cần portable MySQL local và root credential trong `.runtime`; tạo/xóa database test riêng.
- `npm run test:postgres`: PostgreSQL end-to-end và cạnh tranh phiên; tạo `.env.postgres.test` (không commit) có `TEST_DATABASE_URL` trỏ đến database thử nghiệm. Chỉ với PostgreSQL localhost không TLS đặt `DATABASE_SSL=disable`; trên database cloud giữ TLS. Test tạo/xóa schema `rx_test_*`, cần quyền tạo schema và không dùng database production. Không đặt Storage credentials thật cho test.

Cloud test kiểm tra đăng nhập/CSRF, đổi cookie, phiên giữa các instance, sáu request đồng thời, unlock chống nhảy bước, reload khóa lại, mã/link, tìm kiếm, ẩn/hiện bài và rate limit dùng chung.

## Bảo trì và khắc phục lỗi

- **500 / không vào được trang:** xem Vercel Function Logs; kiểm tra đã chạy `setup:cloud`, đúng database URI và Supabase đang hoạt động.
- **Lỗi chứng chỉ:** dùng CA do Supabase cấp trong `DATABASE_CA_CERT`; không dùng `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- **Ảnh không tải lên:** kiểm tra service role key, bucket `script-covers`, file dưới 3 MB, project còn dung lượng. File được chuyển sang WebP trước khi lưu.
- **Không mở khóa được:** cấu hình đầy đủ kênh và video trong admin; cho phép trình duyệt mở tab nhiệm vụ.
- **Quên mật khẩu:** tạo một tài khoản admin có username mới bằng `setup:cloud` với mật khẩu mới, sau đó quản lý tài khoản cũ qua SQL Editor; setup không ghi đè tài khoản cũ.
- **Phiên hết hạn:** đăng nhập lại hoặc reload trang script. Phiên 8 giờ, lượt unlock 30 phút. Dữ liệu phiên và rate limit hết hạn được dọn theo lượt truy cập, tối đa 500 hàng/lần mỗi phút trên mỗi instance.
- **Backup:** sao lưu PostgreSQL và Storage; backup database không chứa file ảnh. Không coi gói Free là hệ thống backup tự động.
- **Rollback:** dùng Vercel Rollback về deployment tương thích trước đó; không xóa bảng/database để rollback giao diện. MySQL local được giữ nguyên làm nguồn đối chiếu sau migration.

## Cấu trúc mã nguồn

```text
api/index.js                 Entry point Vercel
server/app.js                Public/admin routes
server/db.js                 MySQL/PostgreSQL kết nối và truy vấn
server/cloud-state.js        Phiên giao dịch và rate limit PostgreSQL
server/storage.js            Supabase Storage API, server-only key
server/images.js             Chuyển WebP và lưu ảnh
server/security.js           Hash mật khẩu, CSRF, kiểm tra dữ liệu
server/unlock.js             Thứ tự và thời gian nhiệm vụ
views/                       EJS templates
public/                      CSS, JavaScript, logo
supabase/schema.sql          Schema PostgreSQL + RLS
schema.sql                   Schema MySQL local
scripts/setup-cloud.js       Tạo tables/admin/bucket
scripts/migrate-to-supabase.js Chuyển bài/ảnh từ MySQL
vercel.json                  Routing và đóng gói Function
```

## Tài liệu chính thức

- [Vercel Express](https://vercel.com/docs/frameworks/backend/express)
- [Vercel project configuration](https://vercel.com/docs/project-configuration/vercel-json)
- [Supabase PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase Storage](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
- [Vercel Hobby](https://vercel.com/docs/plans/hobby)

README này hướng dẫn tự triển khai; tài khoản GitHub/Vercel/Supabase, project cloud, tên miền và khóa thật phải do chủ dự án cấu hình.
#   W e b s i t e - S c r i p t - H u b 
 
 
## Custom unlock tasks and advertisements

Open `/robloxploit-slimexdev/settings` to add, remove, or reorder 1–20 tasks. Select Subscribe, Watch, Like, Comment, Like & comment, or Open link. Each row has its own HTTPS URL and display label; repeated types (such as two YouTube subscriptions) are supported. The shared wait time and sequential unlocking still apply to every visit. Existing YouTube settings remain in use until you save the new list.

Open `/robloxploit-slimexdev/ads` for banner and popup placements. Each has an enable switch and an HTML/embed-code field. Disabled placements render nothing. Enabled ads appear only on the public homepage and script details. The popup is a dismissible modal shown once per document visit. Ad code runs in a sandboxed iframe; providers requiring parent-page access, cookies, or popunders may need a different supported embed from the provider. This is not an AdSense-specific integration.

### Upgrade an existing database before deploying this version

- Supabase: run `npm run setup:cloud` using your existing `.env.production.local`. The schema adds `tasks_json` and `ads_json` columns without deleting posts, existing task links, or admins. Alternatively run the two `ALTER TABLE settings ADD COLUMN IF NOT EXISTS ...` statements in `supabase/schema.sql` using the Supabase SQL Editor.
- Local MySQL: run `npm run setup`. It adds missing configuration columns without deleting your library.
- Commit and push the source after the schema upgrade, then let Vercel deploy. No new environment variables are required.

Do not rerun `migrate:cloud` to upgrade a non-empty cloud library: it is intended only for the initial transfer.
