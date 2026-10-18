# RobloXploit — bản local đã được duyệt

Kho script Roblox do một admin quản lý. Khách không cần tài khoản.

- Giao diện hoàn toàn tiếng Anh theo yêu cầu cập nhật, nền đen, nhấn tím; tham khảo cấu trúc thư viện Rscripts.
- Trang chủ: bài mới nhất, tìm tiêu đề/tên game, lọc game, trạng thái rỗng.
- Bài có ảnh, tiêu đề, tên game, mô tả, mã hoặc link; trang chi tiết riêng.
- Ảnh upload từ máy: JPEG/PNG/WebP, tối đa 3 MB, chuyển WebP và thu nhỏ tối đa 1280 px.
- Script thật chỉ trả về sau mở khóa. Phần làm mờ dùng mã minh họa.
- Mỗi lượt vào/tải lại trang tạo lượt mở khóa mới; không ghi nhớ mở khóa.
- Nhiệm vụ tuần tự: đăng ký kênh, xem video, like/bình luận (admin chọn gộp hoặc tách). Mặc định 7 giây mỗi bước, server kiểm tra thời gian.
- Một kênh và một video dùng chung, admin chỉnh được. Chỉ ghi nhận mở liên kết và thời gian, không xác minh tương tác YouTube.
- Admin đăng nhập, thêm/sửa/xóa/ẩn/hiện bài, tìm bài, cấu hình nhiệm vụ.
- Node.js + Express + EJS; MySQL và uploads cho bản local; Supabase PostgreSQL và Storage cho Vercel. Không cần frontend build.
- Chạy local trước; chưa triển khai hosting.

## Thiết kế
Nội dung là trọng tâm: header gọn, ô tìm nổi bật, chip game, lưới ảnh 16:9, nhãn game và ngày. Tím chỉ dùng cho hành động, lựa chọn và logo. Desktop 3 cột, tablet 2, điện thoại 1. Trang chi tiết có khu vực mã khóa và dialog nhiệm vụ. Admin gồm danh sách bài và form rõ ràng. Không có số liệu cộng đồng giả, quảng cáo hay tính năng ngoài phạm vi.

## Ranh giới bảo mật và kiểm tra
Mã không xuất hiện trong response công khai trước mở khóa; không thực thi mã upload. Mọi admin route kiểm tra session và CSRF. Mật khẩu scrypt, cookie HttpOnly/SameSite, SQL tham số hóa, file kiểm tra nội dung và giới hạn pixel. Bài ẩn không có trong danh sách, chi tiết, hoặc endpoint mở khóa. Test thứ tự, thời gian, replay, truy cập admin, XSS và ảnh lỗi. Bản local MySQL lưu phiên trong bộ nhớ; chế độ Supabase lưu phiên, tiến độ unlock và rate limit trong PostgreSQL để dùng giữa các instance.
