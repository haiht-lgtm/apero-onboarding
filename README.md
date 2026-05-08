# APERO Onboarding v2

Web app vận hành quy trình Onboarding ứng viên cho **Apero Technologies Group**.

## 🚀 Chạy

```bash
cd apero-onboarding
npm install
npm start
```

App tại **http://localhost:3000** (lần đầu tự seed 2 ứng viên mẫu).

## 📦 Tech Stack

| Layer | Stack |
|---|---|
| Backend | Node.js + Express |
| Database | SQLite (built-in `node:sqlite`, Node ≥22.5 — không cần native build) |
| Frontend | HTML/CSS/JS thuần + Tailwind CSS CDN |
| Email | Nodemailer (SMTP) |
| Scheduler | node-cron — chạy 8h sáng (Asia/Ho_Chi_Minh) mỗi ngày |

> **Lưu ý**: spec gốc dùng `better-sqlite3`, nhưng máy không có Python/MSVC để compile native module → đã chuyển sang `node:sqlite` (built-in từ Node 22.5+, API tương thích, sync giống hệt). Không có sự khác biệt về functionality.

## 🗂️ Database Schema (6 bảng)

- `candidates` — ứng viên
- `email_schedule` — 7 email mỗi ứng viên (3 cho ứng viên + 4 cho bộ phận)
- `dept_orders` — 5 order gửi bộ phận (track email_sent + processed)
- `checklist_items` — 43 đầu việc onboard mỗi ứng viên
- `followup_questions` — 25 câu hỏi follow-up mỗi ứng viên
- `settings` — cấu hình SMTP + email bộ phận

## ✉️ 7 Email Schedule

| # | Mốc | Loại | Tới | Subject |
|---|---|---|---|---|
| E1 | D-7 | candidate | Ứng viên | Chuẩn Bị Cho Ngày Đầu Tiên Của Bạn |
| E2 | D-7 | department | HCNS | Order thiết bị + vé xe |
| E3 | D-5 | department | MyNTH (IT) | Order email công ty |
| E4 | D-5 | department | HùngNX (IT) | Order Confluence |
| E5 | D-5 | department | PhươngHT (C&B) | Order MISA + Username |
| E6 | D-1 | candidate | Ứng viên | Hẹn Gặp Bạn Sáng Mai |
| E7 | D0 | candidate | Ứng viên | Tài Khoản Nội Bộ Của Bạn |

Placeholder: `{{full_name}}`, `{{job_title}}`, `{{department}}`, `{{manager_name}}`, `{{level}}`, `{{email}}`, `{{phone}}`, `{{start_date}}`, `{{start_date_minus_1}}`, `{{start_date_minus_5}}`.

## 📦 5 Department Orders

| # | Mốc | Order | Người phụ trách | Deadline |
|---|---|---|---|---|
| O1 | D-7 | Thiết bị + vé xe | HCNS / Backoffice | D-1 |
| O2 | D-5 | Email công ty | MyNTH (IT) | D0 |
| O3 | D-5 | Confluence | HùngNX (IT) | D-1 |
| O4 | D-5 | MISA + Username | PhươngHT (C&B) | D0 |
| O5 | D-2 | Setup chỗ ngồi + thiết bị | HCNS | D-1 |

Mỗi order có 2 toggle: `email_sent` (HR đã gửi reminder?) + `processed` (bộ phận đã xử lý xong?).

## ✅ Checklist (43 đầu việc / 12 mốc)

D-7 (5) · D-5 (5) · D-3 (2) · D-2 (2) · D-1 (4) · D0 (10) · D+1 (4) · D+2 (1) · D+3 (1) · D+7 (4) · D+30 (2) · D+60 (3)

## ❓ Follow-up Questions (25 câu / 6 mốc)

D+1 (5) · D+2 (3) · D+3 (3) · D+7 (5) · D+30 (4) · D+60 (5)

Mỗi câu: tick "đã hỏi" + textarea ghi response của ứng viên.

## 🎨 UI

8 trang: Dashboard / Ứng Viên / Lịch Email / Order Bộ Phận / Checklist / Câu hỏi Follow-up / Tài Liệu & Link / Cài Đặt

Chi tiết ứng viên có **5 tab**: Email · Order · Checklist · Follow-up · Sửa thông tin.

## 🔌 REST API

| Method | Endpoint |
|---|---|
| GET/POST | `/api/candidates` |
| GET/PUT/DELETE | `/api/candidates/:id` |
| GET | `/api/candidates/:id/emails` |
| GET | `/api/candidates/:id/orders` |
| GET | `/api/candidates/:id/checklist` |
| GET | `/api/candidates/:id/followups` |
| GET | `/api/emails?status=&email_type=` |
| GET | `/api/emails/:id`, `/api/emails/:id/preview` |
| PUT | `/api/emails/:id` (toggle sent thủ công) |
| POST | `/api/emails/:id/send` (gửi qua SMTP) |
| GET | `/api/orders?receiver=&status=` |
| PUT | `/api/orders/:id` (toggle email_sent / processed / note) |
| PUT | `/api/checklist/:id` |
| PUT | `/api/followups/:id` |
| GET | `/api/dashboard/stats` |
| GET/PUT | `/api/settings` |
| POST | `/api/settings/test-email` |
| GET | `/api/docs` |

## ⏰ Cron tự động

Mỗi ngày **08:00 Asia/Ho_Chi_Minh** → quét `email_schedule` có `scheduled_date = hôm nay AND sent = 0` → gửi qua SMTP. Email department auto-sync `dept_orders.email_sent = 1`.

## 🔧 Cấu hình Gmail

App Password (KHÔNG dùng password Gmail thường — Google chặn từ 2022):
1. Bật 2-Step Verification: https://myaccount.google.com/security
2. Tạo App Password: https://myaccount.google.com/apppasswords
3. Vào **Cài Đặt** trong app → điền 16 ký tự App Password vào ô SMTP Password

## 🔄 Reset

Xoá `data.db` (hoặc rename `data.db.bak`) → restart → fresh seed 2 ứng viên mẫu.

## 📁 Cấu trúc

```
apero-onboarding/
├── server.js           — Express + 6 bảng + cron + SMTP
├── data.db             — SQLite (auto-created)
├── data.db.v1.bak      — Backup từ phiên bản v1 (nếu có)
├── package.json
├── README.md
└── public/
    ├── index.html      — Tailwind CDN + sidebar layout
    ├── app.js          — SPA, 8 page, 5 tab
    └── style.css       — Custom complementary CSS
```

## 📄 License

Internal use — APERO Technologies Group.
