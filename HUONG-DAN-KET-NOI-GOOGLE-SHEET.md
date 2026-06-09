# Hướng dẫn kết nối app Onboarding với Google Sheet

> Mục tiêu: cho app **tự đọc** file Google Sheet hồ sơ ứng viên, để gõ tên là ra
> trạng thái mới nhất — không cần tải file thủ công.
>
> Cách làm: tạo một **"tài khoản robot" của Google** (service account) → chia sẻ
> quyền **Xem** file Sheet cho robot đó → đưa "chìa khóa" của robot cho app.
>
> Toàn bộ chỉ cần làm **1 lần**. Sau đó dùng mãi.

---

## Phần A — Tạo tài khoản robot (service account)
> Làm trên **Google Cloud Console**. Cần một tài khoản Google của **công ty**
> (nên dùng tài khoản admin/IT, không nên dùng tài khoản cá nhân — để công cụ
> sống được kể cả khi người tạo nghỉ việc).

### Bước 1. Tạo (hoặc chọn) một Project
1. Mở https://console.cloud.google.com/
2. Đăng nhập tài khoản Google công ty.
3. Trên thanh trên cùng, bấm ô chọn project → **New Project**.
4. Đặt tên ví dụ `apero-onboarding` → **Create**.
5. Chờ vài giây, rồi chọn đúng project vừa tạo (góc trên bên trái).

### Bước 2. Bật Google Sheets API
1. Vào menu (☰) → **APIs & Services** → **Library**.
2. Gõ tìm **Google Sheets API** → bấm vào nó → **Enable**.
3. (Nên bật thêm) Tìm **Google Drive API** → **Enable** (đề phòng cần đọc metadata file).

### Bước 3. Tạo service account
1. Menu (☰) → **APIs & Services** → **Credentials**.
2. Bấm **+ CREATE CREDENTIALS** → **Service account**.
3. Điền:
   - **Service account name:** ví dụ `onboarding-reader`
   - Bấm **Create and continue**.
4. Phần "Grant access" và "users" → **bỏ qua**, bấm **Done**.

### Bước 4. Tạo "chìa khóa" (JSON key)
1. Vẫn ở trang **Credentials**, trong mục *Service Accounts*, bấm vào tài khoản
   `onboarding-reader@...` vừa tạo.
2. Qua tab **KEYS** → **ADD KEY** → **Create new key**.
3. Chọn loại **JSON** → **Create**.
4. Trình duyệt sẽ **tự tải về một file `.json`**. ⚠️ **Đây là chìa khóa bí mật**,
   giữ cẩn thận, KHÔNG gửi cho ai, KHÔNG đẩy lên git.

### Bước 5. Ghi lại email của robot
1. Vẫn trong trang service account đó, copy dòng **Email** — dạng:
   `onboarding-reader@<project>.iam.gserviceaccount.com`
2. Email này dùng cho Phần B bên dưới.

---

## Phần B — Chia sẻ file Sheet cho robot
> Việc này phải do **CHỦ file Sheet** làm (người tạo file / có quyền chia sẻ).
> Nếu bạn chỉ có quyền Xem, hãy nhờ chủ file.

1. Mở file Google Sheet hồ sơ ứng viên.
2. Bấm nút **Chia sẻ (Share)** góc trên bên phải.
3. Dán **email của robot** (lấy ở Bước 5) vào ô mời.
4. Chọn quyền **Người xem (Viewer)** — chỉ cần Xem, không cần Sửa.
5. **Bỏ tích** ô "Thông báo cho mọi người" (robot không đọc email) → **Gửi / Share**.

---

## Phần C — Đưa chìa khóa cho app
> Phần này đưa file `.json` ở Bước 4 vào app. Làm với sự hỗ trợ của Claude.

1. Đổi tên file `.json` vừa tải thành đúng: **`google-credentials.json`**
2. Chép nó vào thư mục dự án: `c:\Work\apero-onboarding\`
   - File này đã được khóa trong `.gitignore` nên KHÔNG bị đẩy lên git.
3. Nhắn Claude: *"đã bỏ file google-credentials.json vào rồi"* — Claude sẽ:
   - Đọc ngầm để lấy email + khóa (không in khóa ra màn hình).
   - Viết phần code cho app đọc Sheet.
   - Test thử với một tên ứng viên.

### Khi đưa lên Vercel (chạy thật, không phải máy bạn)
Vercel không đọc file `.json` trên máy → cần nạp khóa qua **biến môi trường**.
Claude sẽ hướng dẫn cụ thể, đại khái cần đặt trong Vercel:
- `GOOGLE_SHEET_ID` = `1nJGX480Z2M4MpUPAiUpB5VM75LpzaES8LPf5IxbZ-WE`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` = email robot
- `GOOGLE_PRIVATE_KEY` = phần khóa bí mật trong file json

---

## Tóm tắt ai làm gì
| Phần | Ai làm | Kết quả |
|------|--------|---------|
| A. Tạo robot + chìa khóa | IT / admin Google công ty | Có file `google-credentials.json` + email robot |
| B. Chia sẻ Sheet cho robot | Chủ file Sheet | Robot xem được file |
| C. Gắn vào app + code | Bạn + Claude | App gõ tên ra trạng thái |
