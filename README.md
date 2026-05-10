# APERO Onboarding v2

Web app vận hành quy trình Onboarding ứng viên cho **Apero Technologies Group**. Deploy trên Vercel + Upstash Redis (free tier).

## 🚀 Chạy local

```bash
npm install
npm start
```

App tại **http://localhost:3000** (lần đầu tự seed 2 ứng viên mẫu).

Local mode: data lưu vào file `.kv-local.json` (persist qua restart). Không cần setup gì thêm.

## 📦 Tech Stack

| Layer | Stack |
|---|---|
| Backend | Node.js + Express |
| Database | **Upstash Redis** (qua Vercel Marketplace) — local dev fallback `.kv-local.json` |
| Frontend | HTML/CSS/JS thuần + Tailwind CSS CDN |
| Email | Nodemailer (SMTP) |
| Scheduler | **Vercel Cron** — chạy 8h sáng (Asia/Ho_Chi_Minh) mỗi ngày |
| Deploy | Vercel (serverless) |

## 🌐 Deploy Vercel — 5 bước

### 1. Push code lên GitHub (đã có)

```bash
git add .
git commit -m "Refactor sang Vercel KV + Upstash Redis"
git push
```

### 2. Tạo project trên Vercel

- Vào https://vercel.com/new
- Import repo `haiht-lgtm/apero-onboarding`
- Vercel tự detect Node.js project
- Bấm **Deploy** (lần đầu sẽ deploy nhưng app chưa có DB → mọi request sẽ fail. Đó là bình thường, sang bước 3)

### 3. Cài Upstash Redis qua Marketplace

- Trong Vercel project → tab **Storage**
- Click **Create Database** → **Marketplace** → tìm **Upstash Redis**
- Bấm **Add Integration** → đăng ký Upstash (free)
- Chọn region gần VN nhất: **Singapore (ap-southeast-1)**
- Plan **Free** (10k commands/day, 256MB) — đủ dùng
- Sau khi tạo, Vercel **tự động set env vars** `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`

### 4. Set thêm env vars (optional)

Tab **Settings → Environment Variables**, thêm các cái này nếu muốn:

| Key | Giá trị | Bắt buộc? |
|---|---|---|
| `CRON_SECRET` | Chuỗi random bất kỳ | Khuyên dùng (bảo vệ cron endpoint) |
| `SMTP_HOST` | `smtp.gmail.com` | Không (config qua trang Cài Đặt trong app) |
| `SMTP_PORT` | `465` | Không |
| `SMTP_USER` | Gmail của bạn | Không |
| `SMTP_PASS` | Gmail App Password 16 ký tự | Không |

### 5. Redeploy

Tab **Deployments** → menu `...` của deployment mới nhất → **Redeploy**.

Sau ~1 phút có URL `https://apero-onboarding.vercel.app` chạy thật.

## 🔐 Cấu hình SMTP (Gmail)

Vào trang **Cài Đặt** trong app, điền:
- SMTP Host: `smtp.gmail.com`
- Port: `465`
- User: Gmail của bạn
- Password: **App Password 16 ký tự** (KHÔNG dùng mật khẩu Gmail thường)

Tạo App Password:
1. Bật 2-Step Verification: https://myaccount.google.com/security
2. Tạo App Password: https://myaccount.google.com/apppasswords
3. Paste vào ô SMTP Password trong app

## 🗂️ Schema KV

| Key | Giá trị | Mục đích |
|---|---|---|
| `data:candidates` | array of objects | Danh sách ứng viên |
| `data:next_id` | number | Auto-increment id |
| `data:settings` | object | SMTP + email bộ phận |
| `data:state:<id>` | object | State cho từng candidate (email sent, checklist done, follow-up response, order processed) |

State key format trong `data:state:<id>`:
- `email:E1`..`email:E8` — `{ sent, sent_date, status, error }`
- `order:O1`..`order:O5` — `{ email_sent, processed, note }`
- `checklist:0`..`checklist:43` — `{ is_done, done_at, note }`
- `followup:0`..`followup:24` — `{ asked, response, asked_date }`

## ✉️ 8 Email Schedule

| # | Mốc | Loại | Tới | Subject |
|---|---|---|---|---|
| E1 | D-7 | candidate | Ứng viên | Chuẩn Bị Cho Ngày Đầu Tiên |
| E2 | D-7 | department | HCNS | Order thiết bị + vé xe |
| E3 | D-5 | department | MyNTH (IT) | Order email công ty |
| E4 | D-5 | department | HùngNX (IT) | Order Confluence |
| E5 | D-5 | department | PhươngHT (C&B) | Order MISA + Username |
| E6 | D-3 | candidate | Ứng viên | Chào Mừng |
| E7 | D-1 | candidate | Ứng viên | Thư chào mừng |
| E8 | D0 | candidate | Ứng viên | Tài Khoản Nội Bộ |

## ⏰ Cron tự động

`vercel.json` cấu hình cron chạy **1h UTC = 8h sáng Asia/Ho_Chi_Minh** mỗi ngày:
```json
{ "path": "/api/cron/daily", "schedule": "0 1 * * *" }
```
→ Quét tất cả email có `scheduled_date = hôm nay AND sent = 0` → gửi qua SMTP.

Vercel Hobby plan: 2 cron jobs daily, đủ dùng.

## 📁 Cấu trúc

```
apero-onboarding/
├── api/
│   ├── [...path].js       — Catch-all Vercel function (toàn bộ /api/*)
│   └── cron/
│       └── daily.js       — Vercel Cron handler (8h sáng VN)
├── lib/
│   ├── kv.js              — KV adapter (Upstash + local fallback)
│   ├── store.js           — Data layer (candidates, state, settings)
│   ├── express-app.js     — Shared Express app cho local + Vercel
│   ├── timeline.js        — Generate emails/orders/checklist/followup ON-THE-FLY
│   ├── templates.js       — 8 emails + 5 orders + 44 checklist + 25 follow-up data
│   ├── helpers.js         — addDays, todayStr, renderTemplate, parseVNDate
│   └── email.js           — Nodemailer wrapper
├── public/
│   ├── index.html         — Tailwind + sidebar layout
│   ├── app.js             — SPA, 9 page, hash router
│   └── style.css          — Custom CSS
├── server-v2.js           — Local dev entry (Express)
├── server.js              — Legacy SQLite version (npm run start:legacy)
├── vercel.json            — Rewrites + cron config
├── package.json
├── .env.example
└── .kv-local.json         — Local data (gitignored)
```

## 🔄 Reset data local

```bash
rm .kv-local.json
npm start
```
→ Re-seed 2 ứng viên mẫu.

## 📄 License

Internal use — APERO Technologies Group.
