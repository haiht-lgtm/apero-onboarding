// ═══════════════════════════════════════════════════════════════════
// APERO ONBOARDING v2 — Express + node:sqlite + Nodemailer + Cron
// ═══════════════════════════════════════════════════════════════════
const express = require('express');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite'); // Node ≥22.5
const nodemailer = require('nodemailer');
const cron = require('node-cron');

const PORT = process.env.PORT || 3000;
// DB_PATH: env DB_PATH override (cho Render Disk mount /data/data.db), default cwd
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const isFresh = !fs.existsSync(DB_PATH);
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// ─────────────────────────── SCHEMA ───────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  job_title TEXT,
  department TEXT,
  manager_name TEXT,
  manager_email TEXT,
  level TEXT,
  start_date TEXT NOT NULL,
  personal_email TEXT NOT NULL,
  phone TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL,
  template_key TEXT NOT NULL,            -- E1..E7
  milestone TEXT NOT NULL,               -- D-7, D-5, D-1, D0
  email_type TEXT NOT NULL,              -- 'candidate' | 'department'
  scheduled_date TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  sender TEXT,
  receiver TEXT NOT NULL,                -- email người nhận
  receiver_label TEXT,                   -- HCNS / MyNTH-IT / HùngNX-IT / PhươngHT-C&B / Ứng viên
  sent INTEGER DEFAULT 0,
  sent_date TEXT,
  status TEXT DEFAULT 'pending',         -- pending / sent / failed
  error TEXT,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dept_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL,
  order_key TEXT NOT NULL,               -- O1..O5
  milestone TEXT NOT NULL,               -- D-7, D-5, D-2
  deadline TEXT NOT NULL,
  order_type TEXT NOT NULL,              -- thiết bị + vé xe / email công ty / Confluence / MISA / setup chỗ ngồi
  receiver TEXT NOT NULL,                -- HCNS / MyNTH / HùngNX / PhươngHT
  content TEXT,
  email_sent INTEGER DEFAULT 0,
  email_sent_date TEXT,
  processed INTEGER DEFAULT 0,
  processed_date TEXT,
  note TEXT,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL,
  milestone TEXT NOT NULL,
  task_name TEXT NOT NULL,
  assignee TEXT NOT NULL,
  deadline TEXT NOT NULL,
  is_done INTEGER DEFAULT 0,
  done_at TEXT,
  note TEXT,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS followup_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  candidate_id INTEGER NOT NULL,
  milestone TEXT NOT NULL,
  question TEXT NOT NULL,
  response TEXT,
  asked INTEGER DEFAULT 0,
  asked_date TEXT,
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS email_templates (
  template_key TEXT PRIMARY KEY,
  milestone TEXT NOT NULL,
  email_type TEXT NOT NULL,
  day_offset INTEGER NOT NULL,
  receiver_field TEXT,
  receiver_setting TEXT,
  receiver_label TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
`);

// ─────────────────────────── DATA: 7 EMAIL TEMPLATES ───────────────────────────
const FORM_LINK = 'https://docs.google.com/forms/d/e/1FAIpQLScG7EucMMabnghB853TlcIBhzgxGgKfOTLNTcvOGYNVbES2mA/viewform';

const EMAIL_TEMPLATES = [
  {
    key:'E1', milestone:'D-7', email_type:'candidate', day_offset:-7,
    receiver_field:'personal_email', receiver_label:'Ứng viên',
    subject:'[APERO] Chuẩn Bị Cho Ngày Đầu Tiên Của Bạn - {{full_name}}',
    body:`Chào {{full_name}},

Chúc mừng bạn đã chính thức gia nhập đại gia đình APERO Technologies Group!

Để chuẩn bị cho ngày onboard {{start_date}} tại {{department}}, chúng tôi cần bạn hoàn thành form thông tin nhân sự trước ngày {{start_date_minus_5}}.

📋 FORM THÔNG TIN NHÂN SỰ:
${FORM_LINK}

📄 HỒ SƠ CẦN CHUẨN BỊ:
• CCCD bản photo công chứng (2 bản)
• Bằng cấp liên quan (photo công chứng)
• Ảnh 3x4 (2 tấm)
• Tài khoản VP Bank (nếu chưa có, vui lòng mở trước ngày đi làm)

📌 THÔNG TIN VỊ TRÍ:
• Vị trí: {{job_title}}
• Cấp bậc: {{level}}
• Quản lý trực tiếp: {{manager_name}}

⏰ DEADLINE: Vui lòng hoàn thành form trước 15h ngày {{start_date_minus_5}}

Mọi thắc mắc xin liên hệ team HR. Chúc bạn một tuần làm việc hiệu quả!

Trân trọng,
Team HR — APERO Technologies Group`
  },
  {
    key:'E2', milestone:'D-7', email_type:'department', day_offset:-7,
    receiver_setting:'dept_hcns_email', receiver_label:'HCNS / Backoffice',
    subject:'[ORDER] Thiết bị làm việc + vé xe cho NV mới - {{full_name}} - {{start_date}}',
    body:`Hi team Backoffice,

HR cần order thiết bị làm việc cho nhân sự mới sẽ onboard ngày {{start_date}}.

📋 THÔNG TIN NHÂN SỰ:
• Họ tên: {{full_name}}
• Vị trí: {{job_title}}
• Cấp bậc: {{level}}
• Đơn vị: {{department}}
• Quản lý: {{manager_name}}
• Ngày onboard: {{start_date}}

🧰 ORDER GỒM:
• Laptop làm việc (theo cấp bậc/vị trí)
• Màn hình + bàn phím + chuột
• Tai nghe (nếu cần)
• Thẻ nhân viên
• Vé xe tháng (nếu có nhu cầu)

⏰ Deadline: Hoàn thành setup trước {{start_date_minus_1}} để đảm bảo nhân sự có thể bắt đầu làm việc ngay ngày D0.

Cảm ơn team!

Trân trọng,
Team HR — APERO`
  },
  {
    key:'E3', milestone:'D-5', email_type:'department', day_offset:-5,
    receiver_setting:'dept_it_mynth_email', receiver_label:'MyNTH (IT)',
    subject:'[ORDER] Cấp email công ty cho NV mới - {{full_name}} - {{start_date}}',
    body:`Hi MyNTH,

HR cần cấp tài khoản email công ty cho nhân sự mới.

📋 THÔNG TIN NHÂN SỰ:
• Họ tên: {{full_name}}
• Vị trí: {{job_title}}
• Đơn vị: {{department}}
• Quản lý: {{manager_name}}
• Cấp bậc: {{level}}
• Ngày onboard: {{start_date}}
• Email cá nhân (để gửi thông tin tài khoản): {{email}}
• SĐT: {{phone}}

⏰ DEADLINE: BẮT BUỘC cấp xong trước ngày {{start_date}} (ngày Onboard)

📌 LƯU Ý: Email công ty phải được cấp TRƯỚC khi cấp Confluence (vì Confluence đăng nhập bằng email công ty).

Cảm ơn em!

Trân trọng,
Team HR — APERO`
  },
  {
    key:'E4', milestone:'D-5', email_type:'department', day_offset:-5,
    receiver_setting:'dept_it_hungnx_email', receiver_label:'HùngNX (IT)',
    subject:'[ORDER] Cấp tài khoản Confluence cho NV mới - {{full_name}}',
    body:`Hi HùngNX,

HR cần cấp tài khoản Confluence cho nhân sự mới.

📋 THÔNG TIN NHÂN SỰ:
• Họ tên: {{full_name}}
• Vị trí: {{job_title}}
• Đơn vị: {{department}}
• Quản lý: {{manager_name}}
• Cấp bậc: {{level}}
• Ngày onboard: {{start_date}}

📂 CẦN CẤP QUYỀN TRUY CẬP:
• Space chung của công ty
• Space của {{department}}
• Space dự án/team mà nhân sự sẽ tham gia (theo phân công của {{manager_name}})

⏰ DEADLINE: Cấp xong trước {{start_date_minus_1}}

📌 Lưu ý: Email công ty đã được MyNTH cấp trước, có thể đăng nhập Confluence bằng email đó.

Cảm ơn anh/em!

Trân trọng,
Team HR — APERO`
  },
  {
    key:'E5', milestone:'D-5', email_type:'department', day_offset:-5,
    receiver_setting:'dept_cb_phuongth_email', receiver_label:'PhươngHT (C&B)',
    subject:'[ORDER] Cấp tài khoản MISA + Username cho NV mới - {{full_name}}',
    body:`Hi PhươngHT,

HR cần cấp tài khoản MISA và Username cho nhân sự mới (để chấm công).

📋 THÔNG TIN NHÂN SỰ:
• Họ tên: {{full_name}}
• Vị trí: {{job_title}}
• Đơn vị: {{department}}
• Quản lý: {{manager_name}}
• Cấp bậc: {{level}}
• Email cá nhân: {{email}}
• SĐT: {{phone}}
• Ngày onboard: {{start_date}}

💼 CẦN CẤP:
• Tài khoản MISA (chấm công)
• Username nội bộ
• Bốc dữ liệu từ Form thông tin nhân sự (H1211) sang File chính thức (H1212F)

⏰ DEADLINE: Kích hoạt MISA trong sáng ngày onboard {{start_date}}

Cảm ơn chị!

Trân trọng,
Team HR — APERO`
  },
  {
    key:'E6', milestone:'D-3', email_type:'candidate', day_offset:-3,
    receiver_field:'personal_email', receiver_label:'Ứng viên',
    subject:'[APERO] Chào Mừng - Chúng Tôi Đang Chờ Đón Bạn! - {{full_name}}',
    body:`Chào {{full_name}},

Chỉ còn 3 ngày nữa Anh/Chị sẽ chính thức gia nhập đại gia đình Apero Technologies Group! Chúng tôi rất háo hức được chào đón Anh/Chị.

👤 NGƯỜI ĐỒNG HÀNH CÙNG BẠN
Quản lý trực tiếp: {{manager_name}}
Anh/Chị {{manager_name}} sẽ đồng hành, hỗ trợ Anh/Chị trong công việc và giúp Anh/Chị nhanh chóng hòa nhập với môi trường tại Apero.
Đơn vị: {{department}}

📅 LỊCH TRÌNH BUỔI ONBOARDING ({{start_date}})
• 8h25 — Đón tiếp tại sảnh, mời nước
• 8h35 — Trình chiếu slide Onboarding (giới thiệu công ty, văn hóa, cơ cấu)
• 9h15 — Tham quan văn phòng (pantry, phòng họp, khu ăn)
• 9h30 — Bàn giao bộ phận, gặp quản lý trực tiếp

📍 ĐỊA ĐIỂM
Văn phòng Apero — Tòa nhà Taisei Square Hanoi, 289 Khuất Duy Tiến, Phường Trung Hòa, Quận Cầu Giấy, TP. Hà Nội

📌 CHUẨN BỊ
• CCCD bản gốc (để check-in)
• Hồ sơ bản cứng (đã chuẩn bị từ email D-7)
• Trang phục Casual lịch sự
• Có thể mang laptop cá nhân (không bắt buộc)

Mọi thắc mắc vui lòng liên hệ Team HR. Hẹn gặp Anh/Chị vào {{start_date}}!

Trân trọng,
Team HR — Apero Technologies Group`
  },
  {
    key:'E7', milestone:'D-1', email_type:'candidate', day_offset:-1,
    receiver_field:'personal_email', receiver_label:'Ứng viên',
    subject:'[Apero Technologies Group] Thư chào mừng - {{full_name}}',
    body:`Chào Anh/Chị {{full_name}},

Chỉ còn một ngày nữa thôi, Anh/Chị sẽ chính thức trở thành một phần của đại gia đình Apero Technologies Group! Chúng tôi vô cùng háo hức được chào đón Anh/Chị và mong chờ những hành trình thú vị phía trước.

👤 NGƯỜI ĐỒNG HÀNH CÙNG BẠN
Quản lý trực tiếp: {{manager_name}} – {{job_title}}
Anh/Chị {{manager_name}} sẽ đồng hành cùng Anh/Chị trong thời gian tới, hỗ trợ trong công việc cũng như giúp Anh/Chị nhanh chóng hòa nhập với môi trường tại Apero.

📅 THÔNG TIN BUỔI ONBOARDING
Thời gian: 08:30 AM, ngày {{start_date}}
Địa điểm: Văn phòng Apero – Tòa nhà Taisei Square Hanoi, 289 Khuất Duy Tiến, Phường Trung Hòa, Quận Cầu Giấy, TP. Hà Nội

📌 CHUẨN BỊ
• CCCD bản gốc
• Hồ sơ bản cứng
• Trang phục Casual lịch sự
• Có thể mang laptop cá nhân (không bắt buộc — công ty sẽ cấp thiết bị)

Chúng tôi rất mong chờ được chào đón Anh/Chị vào ngày mai.

Nếu Anh/Chị cần hỗ trợ bất kỳ điều gì thì có thể liên hệ với chúng tôi qua số điện thoại 0867.583.687.

Hẹn gặp Anh/Chị vào ngày mai!

Trân trọng,
Team HR — Apero Technologies Group`
  },
  {
    key:'E8', milestone:'D0', email_type:'candidate', day_offset:0,
    receiver_field:'personal_email', receiver_label:'Ứng viên',
    subject:'[APERO] Tài Khoản Nội Bộ Của Bạn - {{full_name}}',
    body:`Chào mừng {{full_name}} đến với Apero!

Chúng tôi rất vui khi Bạn chính thức gia nhập đội ngũ Apero. Để giúp bạn có một khởi đầu thuận lợi, vui lòng đọc kỹ các thông tin quan trọng dưới đây để sẵn sàng cho ngày làm việc đầu tiên.

📚 TÀI LIỆU CẦN ĐỌC
Trước khi bắt đầu, bạn hãy dành thời gian xem qua các tài liệu quan trọng sau:
• Slide Onboarding: https://drive.google.com/file/d/1mUg1eATUZPelVQW6TH0s5tfzU1W2dAbm/view?usp=sharing
• Sổ tay nhân viên: https://drive.google.com/file/d/1rcOrKJ2_TOeoLFkyMhf0w8eje5DYNg1L/view?usp=sharing

Những tài liệu này sẽ giúp bạn nắm rõ văn hóa và môi trường làm việc tại Apero.

🔐 THÔNG TIN TÀI KHOẢN LÀM VIỆC

📧 Tài khoản Email công ty:
• UserName: [Tên tài khoản]
• Email: [Email công ty]
• Mật khẩu: [Mật khẩu]
• Mã đăng nhập: [Mã đăng nhập]

Hướng dẫn:
- Đăng nhập tài khoản Google bằng thông tin email và mật khẩu được cung cấp
- Thay đổi mật khẩu ngay sau khi đăng nhập để đảm bảo bảo mật
- Cài đặt xác minh 2 bước cho tài khoản Google
- Thiết lập chữ ký email chuyên nghiệp theo hướng dẫn

📂 Tài khoản Confluence (Hệ thống tài liệu nội bộ):
• UserName: [Tên tài khoản]
• Mật khẩu: [Mật khẩu]

Hướng dẫn:
- Truy cập link: confluence.apero.vn
- Đăng nhập bằng email công ty được cung cấp
- Sau khi đăng nhập, vui lòng thay đổi mật khẩu cá nhân để bảo vệ thông tin tài khoản

💬 CÁC KÊNH TRAO ĐỔI NỘI BỘ
• Group Facebook (Aperan): [Link nhóm]
• Discord — Aperan News: https://discord.gg/FmpUD9VS
• Discord — Đào tạo nội bộ: https://discord.gg/naHxqTE5
• Discord — Apero Software (Dev): https://discord.gg/XTu739pe

⏰ MISA (chấm công)
• Username + Password được cấp bởi C&B trong sáng nay
• Check-in / Check-out hằng ngày bằng tài khoản này

🏦 LƯU Ý KHÁC
• Mở tài khoản VP Bank (nếu chưa có) — báo lại cho HR khi xong

Chào mừng bạn đến với Apero! Chúc bạn có một khởi đầu thật suôn sẻ và nhiều trải nghiệm tuyệt vời cùng chúng tôi.

Nếu bạn gặp bất kỳ vấn đề nào khi đăng nhập hoặc cần hỗ trợ, vui lòng liên hệ HaiHT qua số điện thoại 0867.583.687 để được hỗ trợ nhanh chóng.

Trân trọng!
Team HR — Apero Technologies Group`
  }
];

// ─────────────────────────── DATA: 5 DEPT ORDERS ───────────────────────────
const DEPT_ORDERS_TEMPLATE = [
  { key:'O1', milestone:'D-7', day_offset:-7, deadline_offset:-1, order_type:'Thiết bị + vé xe', receiver:'HCNS / Backoffice', content:'Laptop, màn hình, bàn phím, chuột, tai nghe, thẻ NV, vé xe tháng' },
  { key:'O2', milestone:'D-5', day_offset:-5, deadline_offset:0, order_type:'Email công ty', receiver:'MyNTH (IT)', content:'Cấp tài khoản email công ty (cấp TRƯỚC Confluence)' },
  { key:'O3', milestone:'D-5', day_offset:-5, deadline_offset:-1, order_type:'Confluence', receiver:'HùngNX (IT)', content:'Cấp Confluence: Space chung + Space đơn vị + Space team/dự án' },
  { key:'O4', milestone:'D-5', day_offset:-5, deadline_offset:0, order_type:'MISA + Username', receiver:'PhươngHT (C&B)', content:'Tài khoản MISA, Username nội bộ, bốc dữ liệu Form H1211 → H1212F' },
  { key:'O5', milestone:'D-2', day_offset:-2, deadline_offset:-1, order_type:'Setup chỗ ngồi + thiết bị', receiver:'HCNS', content:'Setup chỗ ngồi, kiểm tra laptop/màn hình đã hoạt động' }
];

// ─────────────────────────── DATA: 43 CHECKLIST ITEMS ───────────────────────────
const CHECKLIST_TEMPLATE = [
  // D-7 (5)
  { milestone:'D-7', task_name:'📧 Gửi email lấy thông tin nhân sự (Form Google)', assignee:'HR' },
  { milestone:'D-7', task_name:'🧰 Order thiết bị làm việc trong group Backoffice', assignee:'HR + HCNS' },
  { milestone:'D-7', task_name:'🚌 Order vé xe tháng (nếu nhân viên cần)', assignee:'HR + HCNS' },
  { milestone:'D-7', task_name:'🪪 Order thẻ nhân viên', assignee:'HR + HCNS' },
  { milestone:'D-7', task_name:'💌 Tương tác hàng tuần qua mạng xã hội (nếu UV hẹn xa)', assignee:'HR' },
  // D-5 (5)
  { milestone:'D-5', task_name:'📋 Nhận thông tin nhân sự từ Google Form', assignee:'HR' },
  { milestone:'D-5', task_name:'📤 Báo PhươngHT bốc dữ liệu Form sang File chính thức', assignee:'HR → C&B' },
  { milestone:'D-5', task_name:'📨 Gửi email order cấp email công ty cho MyNTH', assignee:'HR → IT' },
  { milestone:'D-5', task_name:'🔐 Gửi email order cấp tài khoản Confluence cho HùngNX', assignee:'HR → IT' },
  { milestone:'D-5', task_name:'💼 Gửi email order tài khoản MISA + Username cho PhươngHT', assignee:'HR → C&B' },
  // D-3 (3) ← ADDED #11
  { milestone:'D-3', task_name:'💌 Gửi email chào mừng + giới thiệu quản lý cho ứng viên', assignee:'HR' },
  { milestone:'D-3', task_name:'📞 Báo quản lý trực tiếp về lịch onboard', assignee:'HR' },
  { milestone:'D-3', task_name:'🏢 Book phòng BOD nếu là cấp C-Level (phối hợp HuyềnLK)', assignee:'HR' },
  // D-2 (2)
  { milestone:'D-2', task_name:'🪑 Báo HC setup máy, chỗ ngồi', assignee:'HR + HC' },
  { milestone:'D-2', task_name:'🔧 Kiểm tra thiết bị đã hoạt động', assignee:'HCNS' },
  // D-1 (4)
  { milestone:'D-1', task_name:'🌟 Gửi email Welcome cho ứng viên', assignee:'HR' },
  { milestone:'D-1', task_name:'✅ Confirm tài khoản email & Confluence đã cấp xong', assignee:'IT' },
  { milestone:'D-1', task_name:'🎁 Chuẩn bị Welcome Kit (sổ tay, móc khóa)', assignee:'HR' },
  { milestone:'D-1', task_name:'📑 Chuẩn bị hợp đồng thử việc + NDA + NCA', assignee:'C&B' },
  // D0 (10)
  { milestone:'D0', task_name:'👋 8h25-8h35 Đón tiếp ứng viên, mời nước tại sảnh', assignee:'HR' },
  { milestone:'D0', task_name:'💼 Báo PhươngHT kích hoạt tài khoản MISA', assignee:'HR → C&B' },
  { milestone:'D0', task_name:'📧 Gửi mail cấp tài khoản nội bộ (Gmail, Confluence, Discord, FB)', assignee:'HR + IT' },
  { milestone:'D0', task_name:'🖥 8h35-9h15 Trình chiếu slide Onboarding (TÀI LIỆU ONBOARDING)', assignee:'HR' },
  { milestone:'D0', task_name:'💬 Add ứng viên vào các group Discord (news, đào tạo, dev)', assignee:'HR' },
  { milestone:'D0', task_name:'📘 Add ứng viên vào group Facebook nội bộ', assignee:'HR' },
  { milestone:'D0', task_name:'🏢 9h15-9h30 Tham quan văn phòng, pantry, phòng họp, khu ăn', assignee:'HR' },
  { milestone:'D0', task_name:'🤝 9h30 Bàn giao nhân sự cho bộ phận, check thiết bị', assignee:'HR + Quản lý' },
  { milestone:'D0', task_name:'🍱 11h Check giờ trưa, hỏi UV ăn cùng team (đặt cơm Nguyên)', assignee:'HR' },
  { milestone:'D0', task_name:'🎁 Tặng bộ quà Onboard (sổ tay, móc khóa)', assignee:'HR' },
  // D+1 (4)
  { milestone:'D+1', task_name:'💬 Add Discord, Facebook (kiểm tra UV đã join chưa)', assignee:'HR' },
  { milestone:'D+1', task_name:'👋 Hỏi thăm cảm nhận ngày đầu, vé xe, thiết bị (Zalo/Discord)', assignee:'HR' },
  { milestone:'D+1', task_name:'✅ Kiểm tra check-in MISA đã hoạt động', assignee:'HR' },
  { milestone:'D+1', task_name:'🏦 Nhắc UV mở tài khoản VP Bank (nếu chưa có)', assignee:'HR' },
  // D+2 (1)
  { milestone:'D+2', task_name:'🤝 Hỏi tình hình training, mức độ hòa nhập với team', assignee:'HR' },
  // D+3 (1)
  { milestone:'D+3', task_name:'📋 Hỏi về công việc, sự quan tâm từ sếp & team', assignee:'HR' },
  // D+7 (4)
  { milestone:'D+7', task_name:'🗣 Hội thoại 1:1 với quản lý về mục tiêu thử việc', assignee:'Manager' },
  { milestone:'D+7', task_name:'💬 HR check-in cảm nhận sau 1 tuần, ghi nhận phản hồi', assignee:'HR' },
  { milestone:'D+7', task_name:'📚 Hoàn thành đào tạo cơ bản (văn hóa, Ketraphaky, quy trình)', assignee:'Manager' },
  { milestone:'D+7', task_name:'📑 Ký hợp đồng thử việc chính thức + NDA/NCA', assignee:'C&B' },
  // D+30 (2)
  { milestone:'D+30', task_name:'📊 Review KPI tháng đầu với quản lý trực tiếp', assignee:'Manager' },
  { milestone:'D+30', task_name:'💬 HR check-in cảm nhận 1 tháng (môi trường, cách làm việc)', assignee:'HR' },
  // D+60 (3)
  { milestone:'D+60', task_name:'🎯 Đánh giá kết quả thử việc chính thức', assignee:'Manager' },
  { milestone:'D+60', task_name:'💬 HR check-in cảm nhận 2 tháng', assignee:'HR' },
  { milestone:'D+60', task_name:'✅ Quyết định nhận chính thức hoặc kết thúc thử việc', assignee:'BOD + HR' }
];

const MILESTONE_OFFSETS = {
  'D-7':-7, 'D-5':-5, 'D-3':-3, 'D-2':-2, 'D-1':-1,
  'D0':0, 'D+1':1, 'D+2':2, 'D+3':3, 'D+7':7, 'D+30':30, 'D+60':60
};

// ─────────────────────────── DATA: 25 FOLLOW-UP QUESTIONS ───────────────────────────
const FOLLOWUP_QUESTIONS = [
  // D+1 (5)
  { milestone:'D+1', question:'Đã join vào các tài khoản nội bộ chưa? (Group FB, Discord, Confluence)\n• Em chưa thấy anh/chị join vào group FB của công ty ạ?\n• Leader đã add mình vào nhóm chat của team chưa ạ?' },
  { milestone:'D+1', question:'Anh/chị đã đăng nhập vào tài khoản gmail trên thiết bị của công ty chưa? (Để tiện đọc tài liệu)' },
  { milestone:'D+1', question:'Ngày đầu anh/chị có gặp khó khăn hay bỡ ngỡ về các task công việc mới không ạ?' },
  { milestone:'D+1', question:'Có mang đồ ăn trưa đi không? (Gợi ý: rủ đặt cơm Nguyên cùng, phím team đưa UV đi ăn cùng)' },
  { milestone:'D+1', question:'Hôm nay anh/chị có đi xe máy đi làm không ạ? Hiện tại đang gửi xe ở đâu? (Gợi ý chỗ để xe)' },
  // D+2 (3)
  { milestone:'D+2', question:'Hôm nay tình hình training thế nào? Có khó khăn gì khi tiếp nhận thông tin không?' },
  { milestone:'D+2', question:'Em đã làm quen được với team chưa? Có ai trong team support em nhiệt tình không?' },
  { milestone:'D+2', question:'Em có khó khăn gì với hệ thống/tools công ty không? (Confluence, Jira, MISA, Discord...)' },
  // D+3 (3)
  { milestone:'D+3', question:'Quản lý đã giao task cụ thể cho em chưa? Em có rõ kỳ vọng từ quản lý không?' },
  { milestone:'D+3', question:'Em có cảm nhận thế nào về sự quan tâm từ sếp & team trong 3 ngày qua?' },
  { milestone:'D+3', question:'Có vấn đề gì về môi trường làm việc, văn hóa công ty mà em chưa quen không?' },
  // D+7 (5)
  { milestone:'D+7', question:'Sau 1 tuần làm việc, bạn cảm nhận thế nào về công việc hiện tại?' },
  { milestone:'D+7', question:'Bạn có cảm thấy mình đang theo kịp nhịp công việc không? Vì sao?' },
  { milestone:'D+7', question:'Cảm nhận chung của bạn về môi trường làm việc trong tuần đầu là gì?' },
  { milestone:'D+7', question:'Trải nghiệm của bạn khi làm việc với quản lý trực tiếp trong tuần đầu như thế nào?' },
  { milestone:'D+7', question:'Bạn đã làm quen với team chưa? Bạn thấy team có dễ hòa nhập hay không?' },
  // D+30 (4)
  { milestone:'D+30', question:'Sau 1 tháng, bạn cảm nhận thế nào về nhịp làm việc và cách vận hành chung của công ty?' },
  { milestone:'D+30', question:'Có điều gì trong văn hóa công ty hoặc cách làm việc của team khiến bạn cảm thấy chưa quen hoặc chưa thoải mái không?' },
  { milestone:'D+30', question:'Trong giai đoạn thử việc, bạn đã hiểu rõ kỳ vọng của quản lý trực tiếp đối với mình chưa?' },
  { milestone:'D+30', question:'So với kỳ vọng ban đầu, khối lượng và độ phức tạp của công việc hiện tại có phù hợp không?' },
  // D+60 (5)
  { milestone:'D+60', question:'Sau 2 tháng, bạn cảm thấy mức độ phù hợp của mình với văn hóa Apero ra sao?' },
  { milestone:'D+60', question:'Bạn có đang gặp khó khăn nào kéo dài nhưng chưa chia sẻ không?' },
  { milestone:'D+60', question:'Bạn có cảm giác công việc hiện tại phù hợp với năng lực & định hướng của bạn không?' },
  { milestone:'D+60', question:'Bạn đã thực sự thẳng thắn trong trao đổi với quản lý hay chưa?' },
  { milestone:'D+60', question:'Ngược lại, điều gì khiến bạn còn băn khoăn hoặc e ngại?' }
];

// ─────────────────────────── HELPERS ───────────────────────────
const addDays = (s, n) => { const d = new Date(s); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
const todayStr = () => new Date().toISOString().slice(0,10);
const renderTemplate = (tpl, vars) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
const getSetting = (key, fb='') => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(key); return r ? r.value : fb; };
const setSetting = (key, value) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, String(value));

const buildVars = (c) => ({
  full_name: c.full_name,
  job_title: c.job_title || '',
  department: c.department || '',
  manager_name: c.manager_name || '',
  level: c.level || '',
  email: c.personal_email || '',
  phone: c.phone || '',
  start_date: c.start_date,
  start_date_minus_1: addDays(c.start_date, -1),
  start_date_minus_5: addDays(c.start_date, -5)
});

// ─────────────────────────── GENERATE SCHEDULE ───────────────────────────
function generateScheduleForCandidate(c) {
  const vars = buildVars(c);
  const insEmail = db.prepare(`INSERT INTO email_schedule
    (candidate_id, template_key, milestone, email_type, scheduled_date, subject, body, sender, receiver, receiver_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insOrder = db.prepare(`INSERT INTO dept_orders
    (candidate_id, order_key, milestone, deadline, order_type, receiver, content)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const insCheck = db.prepare(`INSERT INTO checklist_items
    (candidate_id, milestone, task_name, assignee, deadline) VALUES (?, ?, ?, ?, ?)`);
  const insFup = db.prepare(`INSERT INTO followup_questions
    (candidate_id, milestone, question) VALUES (?, ?, ?)`);

  const sender = getSetting('smtp_from_email', getSetting('smtp_user', ''));

  // 7 emails — đọc template từ DB
  const templates = db.prepare('SELECT * FROM email_templates ORDER BY day_offset, template_key').all();
  for (const t of templates) {
    let receiver;
    if (t.email_type === 'candidate') receiver = c[t.receiver_field] || '';
    else receiver = getSetting(t.receiver_setting, ''); // sẽ rỗng nếu HR chưa cấu hình

    insEmail.run(
      c.id, t.template_key, t.milestone, t.email_type,
      addDays(c.start_date, t.day_offset),
      renderTemplate(t.subject, vars),
      renderTemplate(t.body, vars),
      sender, receiver, t.receiver_label
    );
  }

  // 5 dept_orders
  for (const o of DEPT_ORDERS_TEMPLATE) {
    insOrder.run(
      c.id, o.key, o.milestone,
      addDays(c.start_date, o.deadline_offset),
      o.order_type, o.receiver, o.content
    );
  }

  // 43 checklist
  for (const it of CHECKLIST_TEMPLATE) {
    insCheck.run(c.id, it.milestone, it.task_name, it.assignee, addDays(c.start_date, MILESTONE_OFFSETS[it.milestone]));
  }

  // 25 follow-up questions
  for (const q of FOLLOWUP_QUESTIONS) {
    insFup.run(c.id, q.milestone, q.question);
  }
}

// ─────────────────────────── MAIL SENDING ───────────────────────────
function buildTransporter() {
  const host = getSetting('smtp_host'), user = getSetting('smtp_user'), pass = getSetting('smtp_pass');
  const port = Number(getSetting('smtp_port', '587'));
  const missing = [];
  if (!host) missing.push('SMTP Host');
  if (!user) missing.push('SMTP User');
  if (!pass) missing.push('SMTP Password');
  if (missing.length) return { error: 'Thiếu: ' + missing.join(', ') };
  return { transporter: nodemailer.createTransport({ host, port, secure: port===465, auth:{user,pass} }) };
}

async function sendEmailNow(emailId) {
  const e = db.prepare('SELECT * FROM email_schedule WHERE id=?').get(emailId);
  if (!e) throw new Error('Email không tồn tại');
  const c = db.prepare('SELECT * FROM candidates WHERE id=?').get(e.candidate_id);
  if (!c) throw new Error('Candidate không tồn tại');
  // Fallback: nếu receiver rỗng, đọc lại từ settings (cho department) hoặc từ candidate (cho candidate)
  if (!e.receiver) {
    if (e.email_type === 'department') {
      const tpl = db.prepare('SELECT receiver_setting FROM email_templates WHERE template_key=?').get(e.template_key);
      const fallback = tpl?.receiver_setting ? getSetting(tpl.receiver_setting, '') : '';
      if (fallback) {
        db.prepare(`UPDATE email_schedule SET receiver=? WHERE id=?`).run(fallback, emailId);
        e.receiver = fallback;
      }
    } else if (c.personal_email) {
      db.prepare(`UPDATE email_schedule SET receiver=? WHERE id=?`).run(c.personal_email, emailId);
      e.receiver = c.personal_email;
    }
  }
  if (!e.receiver) {
    const err = e.email_type === 'department' ? 'Bộ phận chưa cấu hình email — vào Cài Đặt' : 'Ứng viên thiếu email';
    db.prepare(`UPDATE email_schedule SET status='failed', error=? WHERE id=?`).run(err, emailId);
    throw new Error(err);
  }
  const t = buildTransporter();
  if (t.error) {
    db.prepare(`UPDATE email_schedule SET status='failed', error=? WHERE id=?`).run('SMTP chưa cấu hình — '+t.error, emailId);
    throw new Error('SMTP chưa cấu hình — '+t.error);
  }
  const fromName = getSetting('smtp_from_name', 'APERO HR');
  const fromEmail = getSetting('smtp_from_email', getSetting('smtp_user'));

  try {
    await t.transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: e.receiver,
      cc: e.email_type === 'candidate' ? (c.manager_email || undefined) : undefined,
      subject: e.subject, text: e.body
    });
    db.prepare(`UPDATE email_schedule SET status='sent', sent=1, sent_date=datetime('now'), error=NULL WHERE id=?`).run(emailId);
    // Sync với dept_orders nếu là email department
    if (e.email_type === 'department') {
      const orderKeyMap = { E2:'O1', E3:'O2', E4:'O3', E5:'O4' };
      const ok = orderKeyMap[e.template_key];
      if (ok) db.prepare(`UPDATE dept_orders SET email_sent=1, email_sent_date=datetime('now') WHERE candidate_id=? AND order_key=?`).run(e.candidate_id, ok);
    }
    return true;
  } catch (err) {
    db.prepare(`UPDATE email_schedule SET status='failed', error=? WHERE id=?`).run(err.message, emailId);
    throw err;
  }
}

// ─────────────────────────── SEED ───────────────────────────
function seedSampleCandidates() {
  const insC = db.prepare(`INSERT INTO candidates
    (full_name, job_title, department, manager_name, manager_email, level, start_date, personal_email, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const today = new Date();
  const fmt = d => d.toISOString().slice(0,10);
  const inDays = n => { const d = new Date(today); d.setDate(d.getDate()+n); return fmt(d); };
  const seeds = [
    { full_name:'Nguyễn Thu Hiền', job_title:'UI/UX Designer', department:'Apero Headquarters', manager_name:'Trần Quốc Hùng', manager_email:'hung.tran@apero.vn', level:'OX2', start_date:inDays(5), personal_email:'thuhien.nguyen@example.com', phone:'0901234567' },
    { full_name:'Lê Thanh Tùng', job_title:'Mobile Developer', department:'Apero Software', manager_name:'Phạm Văn Đức', manager_email:'duc.pham@apero.vn', level:'LX2', start_date:inDays(-10), personal_email:'tung.le@example.com', phone:'0912345678' }
  ];
  for (const s of seeds) {
    const r = insC.run(s.full_name, s.job_title, s.department, s.manager_name, s.manager_email, s.level, s.start_date, s.personal_email, s.phone);
    generateScheduleForCandidate({ id:Number(r.lastInsertRowid), ...s });
  }
}

// Seed templates vào DB nếu chưa có (insert-if-missing)
function seedEmailTemplatesIfMissing() {
  const ins = db.prepare(`INSERT INTO email_templates
    (template_key, milestone, email_type, day_offset, receiver_field, receiver_setting, receiver_label, subject, body)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(template_key) DO NOTHING`);
  for (const t of EMAIL_TEMPLATES) {
    ins.run(t.key, t.milestone, t.email_type, t.day_offset,
      t.receiver_field || null, t.receiver_setting || null, t.receiver_label || null,
      t.subject, t.body);
  }
}
// ─── Migration v3 → v4: detect old DB and upgrade BEFORE seed runs
function migrateToV4IfNeeded() {
  const tplCount = db.prepare('SELECT COUNT(*) AS n FROM email_templates').get().n;
  if (tplCount === 0) return; // fresh DB — seed will handle below

  // Detect v3: E6 milestone is D-1 (in v4 it's D-3)
  const e6 = db.prepare("SELECT milestone FROM email_templates WHERE template_key='E6'").get();
  const isOld = e6 && e6.milestone === 'D-1';
  if (!isOld) return; // already v4

  console.log('🔄 Migrating templates v3 → v4 (8 emails)...');
  db.exec('DELETE FROM email_templates');
  // seedEmailTemplatesIfMissing() will be called below to re-insert v4 templates
}
migrateToV4IfNeeded();
seedEmailTemplatesIfMissing();

// ─── Regenerate email_schedule for candidates that don't have E8 yet (post-migration sync)
function regenerateEmailScheduleIfNeeded() {
  const cands = db.prepare('SELECT * FROM candidates').all();
  const newTpls = db.prepare('SELECT * FROM email_templates ORDER BY day_offset, template_key').all();
  if (newTpls.length !== 8) return;

  const insEmail = db.prepare(`INSERT INTO email_schedule
    (candidate_id, template_key, milestone, email_type, scheduled_date, subject, body, sender, receiver, receiver_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const sender = getSetting('smtp_from_email', getSetting('smtp_user', ''));

  let migrated = 0;
  for (const c of cands) {
    const hasE8 = db.prepare("SELECT 1 FROM email_schedule WHERE candidate_id=? AND template_key='E8'").get(c.id);
    if (hasE8) continue;
    db.prepare('DELETE FROM email_schedule WHERE candidate_id=?').run(c.id);
    const vars = buildVars(c);
    for (const t of newTpls) {
      let receiver;
      if (t.email_type === 'candidate') receiver = c[t.receiver_field] || '';
      else receiver = getSetting(t.receiver_setting, '');
      insEmail.run(c.id, t.template_key, t.milestone, t.email_type,
        addDays(c.start_date, t.day_offset),
        renderTemplate(t.subject, vars),
        renderTemplate(t.body, vars),
        sender, receiver, t.receiver_label);
    }
    // Add missing D-3 #11 checklist task
    const has = db.prepare("SELECT 1 FROM checklist_items WHERE candidate_id=? AND task_name LIKE '%email chào mừng%'").get(c.id);
    if (!has) {
      db.prepare(`INSERT INTO checklist_items (candidate_id, milestone, task_name, assignee, deadline) VALUES (?, ?, ?, ?, ?)`)
        .run(c.id, 'D-3', '💌 Gửi email chào mừng + giới thiệu quản lý cho ứng viên', 'HR', addDays(c.start_date, -3));
    }
    migrated++;
  }
  if (migrated) console.log(`✓ Migrated email_schedule + checklist for ${migrated} candidate(s) → v4`);
}
regenerateEmailScheduleIfNeeded();

if (isFresh) {
  console.log('🆕 Fresh DB — seeding 2 sample candidates...');
  // default settings
  setSetting('company_name', 'APERO Technologies Group');
  setSetting('smtp_from_name', 'APERO HR');
  setSetting('smtp_port', '587');
  setSetting('email_signature', 'Trân trọng,\nTeam HR — APERO Technologies Group');
  seedSampleCandidates();
}

// ═══════════════════════════════════════════════════════════════════
// EXPRESS APP + API
// ═══════════════════════════════════════════════════════════════════
const app = express();
app.use(express.json({ limit:'2mb' }));

// No-cache cho HTML/JS/CSS để dev/UI update đến browser ngay
app.use((req, res, next) => {
  if (/\.(html|js|css)$|^\/$/.test(req.path)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ─── CANDIDATES ───
app.get('/api/candidates', (req, res) => {
  const rows = db.prepare(`SELECT c.*,
    (SELECT COUNT(*) FROM checklist_items WHERE candidate_id=c.id) AS total_tasks,
    (SELECT COUNT(*) FROM checklist_items WHERE candidate_id=c.id AND is_done=1) AS done_tasks,
    (SELECT COUNT(*) FROM email_schedule WHERE candidate_id=c.id) AS total_emails,
    (SELECT COUNT(*) FROM email_schedule WHERE candidate_id=c.id AND sent=1) AS sent_emails
    FROM candidates c ORDER BY start_date DESC`).all();
  res.json(rows);
});

app.get('/api/candidates/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM candidates WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error:'Not found' });
  res.json(r);
});

app.post('/api/candidates', (req, res) => {
  const b = req.body;
  if (!b.full_name || !b.personal_email || !b.start_date) return res.status(400).json({ error:'Thiếu họ tên / email / ngày đi làm' });
  const r = db.prepare(`INSERT INTO candidates
    (full_name, job_title, department, manager_name, manager_email, level, start_date, personal_email, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    b.full_name, b.job_title||'', b.department||'', b.manager_name||'', b.manager_email||'',
    b.level||'', b.start_date, b.personal_email, b.phone||''
  );
  const c = db.prepare('SELECT * FROM candidates WHERE id=?').get(Number(r.lastInsertRowid));
  generateScheduleForCandidate(c);
  res.json(c);
});

app.put('/api/candidates/:id', (req, res) => {
  const b = req.body;
  const c = db.prepare('SELECT * FROM candidates WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error:'Not found' });
  db.prepare(`UPDATE candidates SET
    full_name=?, job_title=?, department=?, manager_name=?, manager_email=?, level=?,
    start_date=?, personal_email=?, phone=?, status=?, updated_at=datetime('now')
    WHERE id=?`).run(
    b.full_name??c.full_name, b.job_title??c.job_title, b.department??c.department,
    b.manager_name??c.manager_name, b.manager_email??c.manager_email, b.level??c.level,
    b.start_date??c.start_date, b.personal_email??c.personal_email, b.phone??c.phone,
    b.status??c.status, req.params.id
  );
  res.json(db.prepare('SELECT * FROM candidates WHERE id=?').get(req.params.id));
});

app.delete('/api/candidates/:id', (req, res) => {
  db.prepare('DELETE FROM candidates WHERE id=?').run(req.params.id);
  res.json({ ok:true });
});

// ─── EMAIL_SCHEDULE ───
app.get('/api/candidates/:id/emails', (req, res) => {
  res.json(db.prepare('SELECT * FROM email_schedule WHERE candidate_id=? ORDER BY scheduled_date, id').all(req.params.id));
});

app.get('/api/emails', (req, res) => {
  let sql = `SELECT e.*, c.full_name, c.personal_email FROM email_schedule e JOIN candidates c ON c.id=e.candidate_id WHERE 1=1`;
  const params = [];
  if (req.query.status)     { sql += ' AND e.status=?';     params.push(req.query.status); }
  if (req.query.email_type) { sql += ' AND e.email_type=?'; params.push(req.query.email_type); }
  if (req.query.milestone)  { sql += ' AND e.milestone=?';  params.push(req.query.milestone); }
  sql += ' ORDER BY e.scheduled_date, e.id';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/emails/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM email_schedule WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error:'Not found' });
  res.json(r);
});

app.get('/api/emails/:id/preview', (req, res) => {
  const e = db.prepare('SELECT * FROM email_schedule WHERE id=?').get(req.params.id);
  if (!e) return res.status(404).json({ error:'Not found' });
  res.json({ subject:e.subject, body:e.body, receiver:e.receiver, receiver_label:e.receiver_label });
});

app.put('/api/emails/:id', (req, res) => {
  const { sent } = req.body;
  if (sent !== undefined) {
    db.prepare(`UPDATE email_schedule SET sent=?, sent_date=CASE WHEN ?=1 THEN datetime('now') ELSE NULL END,
      status=CASE WHEN ?=1 THEN 'sent' ELSE 'pending' END WHERE id=?`).run(sent?1:0, sent?1:0, sent?1:0, req.params.id);
  }
  res.json(db.prepare('SELECT * FROM email_schedule WHERE id=?').get(req.params.id));
});

app.post('/api/emails/:id/send', async (req, res) => {
  try { await sendEmailNow(req.params.id); res.json({ ok:true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── DEPT_ORDERS ───
app.get('/api/candidates/:id/orders', (req, res) => {
  res.json(db.prepare('SELECT * FROM dept_orders WHERE candidate_id=? ORDER BY deadline, id').all(req.params.id));
});

app.get('/api/orders', (req, res) => {
  let sql = `SELECT o.*, c.full_name, c.start_date FROM dept_orders o JOIN candidates c ON c.id=o.candidate_id WHERE 1=1`;
  const params = [];
  if (req.query.receiver) { sql += ' AND o.receiver LIKE ?'; params.push('%'+req.query.receiver+'%'); }
  if (req.query.status === 'pending')   { sql += ' AND o.processed=0'; }
  if (req.query.status === 'processed') { sql += ' AND o.processed=1'; }
  sql += ' ORDER BY o.deadline, o.id';
  res.json(db.prepare(sql).all(...params));
});

app.put('/api/orders/:id', (req, res) => {
  const { email_sent, processed, note } = req.body;
  const cur = db.prepare('SELECT * FROM dept_orders WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error:'Not found' });
  db.prepare(`UPDATE dept_orders SET
    email_sent=?, email_sent_date=CASE WHEN ?=1 AND email_sent_date IS NULL THEN datetime('now') ELSE email_sent_date END,
    processed=?, processed_date=CASE WHEN ?=1 AND processed_date IS NULL THEN datetime('now') ELSE processed_date END,
    note=?
    WHERE id=?`).run(
    email_sent ?? cur.email_sent, email_sent ?? cur.email_sent,
    processed ?? cur.processed, processed ?? cur.processed,
    note ?? cur.note, req.params.id
  );
  res.json(db.prepare('SELECT * FROM dept_orders WHERE id=?').get(req.params.id));
});

// ─── CHECKLIST ───
app.get('/api/candidates/:id/checklist', (req, res) => {
  res.json(db.prepare('SELECT * FROM checklist_items WHERE candidate_id=? ORDER BY deadline, id').all(req.params.id));
});

app.put('/api/checklist/:id', (req, res) => {
  const { is_done, note } = req.body;
  db.prepare(`UPDATE checklist_items SET is_done=?, done_at=CASE WHEN ?=1 THEN datetime('now') ELSE NULL END, note=COALESCE(?, note) WHERE id=?`)
    .run(is_done?1:0, is_done?1:0, note ?? null, req.params.id);
  res.json(db.prepare('SELECT * FROM checklist_items WHERE id=?').get(req.params.id));
});

// ─── FOLLOW-UP ───
app.get('/api/candidates/:id/followups', (req, res) => {
  res.json(db.prepare('SELECT * FROM followup_questions WHERE candidate_id=? ORDER BY id').all(req.params.id));
});

app.put('/api/followups/:id', (req, res) => {
  const { response, asked } = req.body;
  const cur = db.prepare('SELECT * FROM followup_questions WHERE id=?').get(req.params.id);
  if (!cur) return res.status(404).json({ error:'Not found' });
  db.prepare(`UPDATE followup_questions SET
    response=COALESCE(?, response),
    asked=COALESCE(?, asked),
    asked_date=CASE WHEN ?=1 AND asked_date IS NULL THEN datetime('now') ELSE asked_date END
    WHERE id=?`).run(response ?? null, asked ?? null, asked ?? 0, req.params.id);
  res.json(db.prepare('SELECT * FROM followup_questions WHERE id=?').get(req.params.id));
});

// ─── EMAIL TEMPLATES ───
app.get('/api/email-templates', (req, res) => {
  res.json(db.prepare('SELECT * FROM email_templates ORDER BY day_offset, template_key').all());
});

app.get('/api/email-templates/:key', (req, res) => {
  const r = db.prepare('SELECT * FROM email_templates WHERE template_key=?').get(req.params.key);
  if (!r) return res.status(404).json({ error:'Not found' });
  res.json(r);
});

app.put('/api/email-templates/:key', (req, res) => {
  const { subject, body, day_offset } = req.body;
  if (!subject || !body) return res.status(400).json({ error:'Thiếu subject/body' });
  const r = db.prepare(`UPDATE email_templates SET subject=?, body=?, day_offset=COALESCE(?, day_offset), updated_at=datetime('now') WHERE template_key=?`)
    .run(subject, body, day_offset ?? null, req.params.key);
  if (r.changes === 0) return res.status(404).json({ error:'Not found' });
  res.json(db.prepare('SELECT * FROM email_templates WHERE template_key=?').get(req.params.key));
});

app.post('/api/email-templates/:key/reset', (req, res) => {
  const def = EMAIL_TEMPLATES.find(t => t.key === req.params.key);
  if (!def) return res.status(404).json({ error:'Default not found' });
  db.prepare(`UPDATE email_templates SET subject=?, body=?, day_offset=?, updated_at=datetime('now') WHERE template_key=?`)
    .run(def.subject, def.body, def.day_offset, req.params.key);
  res.json(db.prepare('SELECT * FROM email_templates WHERE template_key=?').get(req.params.key));
});

// Áp dụng template hiện tại cho tất cả email PENDING của template_key này (re-render với data candidate)
app.post('/api/email-templates/:key/apply-pending', (req, res) => {
  const tpl = db.prepare('SELECT * FROM email_templates WHERE template_key=?').get(req.params.key);
  if (!tpl) return res.status(404).json({ error:'Not found' });
  const pending = db.prepare(`SELECT e.id, e.candidate_id FROM email_schedule e
    WHERE e.template_key=? AND e.sent=0`).all(req.params.key);
  let updated = 0;
  for (const p of pending) {
    const c = db.prepare('SELECT * FROM candidates WHERE id=?').get(p.candidate_id);
    if (!c) continue;
    const vars = buildVars(c);
    db.prepare(`UPDATE email_schedule SET subject=?, body=?, scheduled_date=? WHERE id=?`).run(
      renderTemplate(tpl.subject, vars),
      renderTemplate(tpl.body, vars),
      addDays(c.start_date, tpl.day_offset),
      p.id
    );
    updated++;
  }
  res.json({ ok:true, updated });
});

// Reset all
app.post('/api/email-templates/reset-all', (req, res) => {
  const upd = db.prepare(`UPDATE email_templates SET subject=?, body=?, day_offset=?, updated_at=datetime('now') WHERE template_key=?`);
  for (const t of EMAIL_TEMPLATES) upd.run(t.subject, t.body, t.day_offset, t.key);
  res.json({ ok:true, count: EMAIL_TEMPLATES.length });
});

// Preview render với data sample hoặc candidate_id
app.post('/api/email-templates/:key/preview', (req, res) => {
  const tpl = db.prepare('SELECT * FROM email_templates WHERE template_key=?').get(req.params.key);
  if (!tpl) return res.status(404).json({ error:'Not found' });
  const { candidate_id, subject, body } = req.body;
  const c = candidate_id
    ? db.prepare('SELECT * FROM candidates WHERE id=?').get(candidate_id)
    : { full_name:'Nguyễn Thu Hiền', job_title:'UI/UX Designer', department:'Apero Headquarters', manager_name:'Trần Quốc Hùng', level:'OX2', personal_email:'thuhien@example.com', phone:'0901234567', start_date:'2026-05-15' };
  const vars = buildVars(c);
  res.json({
    subject: renderTemplate(subject ?? tpl.subject, vars),
    body: renderTemplate(body ?? tpl.body, vars)
  });
});

// ─── DASHBOARD ───
app.get('/api/dashboard/stats', (req, res) => {
  const today = todayStr();
  const totalCandidates = db.prepare('SELECT COUNT(*) AS n FROM candidates WHERE status=?').get('active').n;
  const todayEmails = db.prepare(`SELECT COUNT(*) AS n FROM email_schedule WHERE scheduled_date=? AND sent=0`).get(today).n;
  const pendingOrders = db.prepare(`SELECT COUNT(*) AS n FROM dept_orders WHERE processed=0`).get().n;
  const overdueChecks = db.prepare(`SELECT COUNT(*) AS n FROM checklist_items WHERE deadline<? AND is_done=0`).get(today).n;

  const upcoming = db.prepare(`SELECT c.*,
    (SELECT COUNT(*) FROM checklist_items WHERE candidate_id=c.id) AS total_tasks,
    (SELECT COUNT(*) FROM checklist_items WHERE candidate_id=c.id AND is_done=1) AS done_tasks
    FROM candidates c
    WHERE date(start_date) BETWEEN date(?) AND date(?, '+7 days')
    ORDER BY start_date`).all(today, today);

  const todayEmailQueue = db.prepare(`SELECT e.*, c.full_name FROM email_schedule e JOIN candidates c ON c.id=e.candidate_id
    WHERE e.scheduled_date=? AND e.sent=0 ORDER BY e.id`).all(today);

  const overdueOrders = db.prepare(`SELECT o.*, c.full_name FROM dept_orders o JOIN candidates c ON c.id=o.candidate_id
    WHERE o.processed=0 ORDER BY o.deadline LIMIT 20`).all();

  res.json({ totalCandidates, todayEmails, pendingOrders, overdueChecks, upcoming, todayEmailQueue, overdueOrders });
});

// ─── SETTINGS ───
const SETTING_KEYS = [
  'smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from_name','smtp_from_email',
  'email_signature','company_name',
  'dept_hcns_email','dept_it_mynth_email','dept_it_hungnx_email','dept_cb_phuongth_email'
];
app.get('/api/settings', (req, res) => {
  const out = {};
  for (const k of SETTING_KEYS) out[k] = getSetting(k, '');
  if (out.smtp_pass) out.smtp_pass = '••••••••';
  res.json(out);
});

app.put('/api/settings', (req, res) => {
  for (const k of SETTING_KEYS) {
    if (req.body[k] !== undefined && req.body[k] !== '••••••••') setSetting(k, req.body[k]);
  }
  // Auto-sync receiver của email pending khi user update email bộ phận
  const deptKeys = ['dept_hcns_email','dept_it_mynth_email','dept_it_hungnx_email','dept_cb_phuongth_email'];
  let updatedEmails = 0;
  for (const k of deptKeys) {
    if (req.body[k] === undefined) continue;
    const tpls = db.prepare("SELECT template_key FROM email_templates WHERE receiver_setting=?").all(k);
    for (const t of tpls) {
      const r = db.prepare(`UPDATE email_schedule SET receiver=? WHERE template_key=? AND sent=0`)
        .run(req.body[k] || '', t.template_key);
      updatedEmails += r.changes;
    }
  }
  res.json({ ok:true, updated_pending_emails: updatedEmails });
});

app.post('/api/settings/test-email', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ error:'Thiếu email nhận' });
  const t = buildTransporter();
  if (t.error) return res.status(400).json({ error:'SMTP chưa cấu hình — '+t.error });
  try {
    await t.transporter.sendMail({
      from: `"${getSetting('smtp_from_name','APERO HR')}" <${getSetting('smtp_from_email', getSetting('smtp_user'))}>`,
      to, subject:'[APERO] Test Email',
      text: `Email test từ hệ thống APERO Onboarding. Nếu bạn nhận được — cấu hình SMTP đã hoạt động ✅\n\n${getSetting('email_signature','')}`
    });
    res.json({ ok:true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── DOCS / LINKS (static config — sẽ làm sau, hiện trả về object cứng) ───
app.get('/api/docs', (req, res) => {
  res.json({
    forms: [
      { label:'📄 Form thông tin nhân sự', purpose:'Thu thập dữ liệu thông tin nhân sự', url: FORM_LINK }
    ],
    drive: [
      { label:'💌 Mẫu email chào mừng', purpose:'Gửi ứng viên trước Onboard', url:'https://docs.google.com/document/d/1Kb860GUeyTud0KLxtt3jqrplUpqvGjF6ExS0lCo4W4w/edit' },
      { label:'🖥 Slide hướng dẫn Onboard', purpose:'Trình chiếu ngày đầu nhận việc (D0)', url:'https://drive.google.com/file/d/1mUg1eATUZPelVQW6TH0s5tfzU1W2dAbm/view?usp=sharing' },
      { label:'🧠 Sổ tay nhân viên', purpose:'Giới thiệu văn hóa công ty', url:'https://drive.google.com/file/d/1rcOrKJ2_TOeoLFkyMhf0w8eje5DYNg1L/view?usp=sharing' },
      { label:'🧰 Mẫu order thiết bị & tài khoản', purpose:'Quản lý thiết bị & account', url:'https://docs.google.com/document/d/1JYSvzQTQd9s1E7jm4G0V45wjWd6yn9JXyD3B_7uBT4M/edit' }
    ],
    discord: [
      { label:'💬 Discord — Aperan News', purpose:'Group thông báo nội bộ chung', url:'https://discord.gg/FmpUD9VS' },
      { label:'📚 Discord — Đào tạo nội bộ', purpose:'Group đào tạo chung', url:'https://discord.gg/naHxqTE5' },
      { label:'👨‍💻 Discord — Apero Software', purpose:'Group Đội Dev', url:'https://discord.gg/XTu739pe' }
    ],
    people: [
      { role:'HR', name:'Bộ phận HR', responsibility:'Đầu mối điều phối toàn bộ quy trình onboard' },
      { role:'MyNTH (IT)', name:'Đội IT', responsibility:'Cấp tài khoản email công ty' },
      { role:'HùngNX (IT)', name:'Đội IT', responsibility:'Cấp tài khoản Confluence' },
      { role:'PhươngHT (C&B)', name:'C&B', responsibility:'Cấp tài khoản MISA + Username + Bốc dữ liệu Form' },
      { role:'HuyềnLK', name:'Văn phòng', responsibility:'Hỗ trợ book phòng họp BOD (cho cấp C-Level)' },
      { role:'HCNS / Backoffice', name:'Hành chính', responsibility:'Order thiết bị, vé xe, thẻ NV, setup chỗ ngồi' },
      { role:'Quản lý trực tiếp', name:'Theo bộ phận', responsibility:'Bàn giao công việc, đào tạo, đánh giá thử việc' }
    ]
  });
});

// ─── CRON: 8h sáng Asia/Ho_Chi_Minh ───
cron.schedule('0 8 * * *', async () => {
  const today = todayStr();
  const due = db.prepare(`SELECT id FROM email_schedule WHERE scheduled_date=? AND sent=0`).all(today);
  console.log(`⏰ Cron 8h: ${due.length} email tới hạn hôm nay`);
  for (const e of due) {
    try { await sendEmailNow(e.id); }
    catch (err) { console.error('Send fail', e.id, err.message); }
  }
}, { timezone:'Asia/Ho_Chi_Minh' });

// Healthcheck for Render
app.get('/healthz', (req, res) => res.json({ ok:true, time: new Date().toISOString() }));

// SPA fallback
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`✅ APERO Onboarding v2 running at http://localhost:${PORT}`));
