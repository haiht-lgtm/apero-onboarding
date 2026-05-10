// ═══════════════════════════════════════════════════════════════════
// Templates Data — 8 emails + 5 orders + 44 checklist + 25 followup
// Tách từ server.js để tái sử dụng cho cả SQLite mode lẫn Sheet mode
// ═══════════════════════════════════════════════════════════════════

const FORM_LINK = 'https://docs.google.com/forms/d/e/1FAIpQLScG7EucMMabnghB853TlcIBhzgxGgKfOTLNTcvOGYNVbES2mA/viewform';

const EMAIL_TEMPLATES = [
  {
    key: 'E1', milestone: 'D-7', email_type: 'candidate', day_offset: -7,
    receiver_field: 'personal_email', receiver_label: 'Ứng viên',
    subject: '[APERO] Chuẩn Bị Cho Ngày Đầu Tiên Của Bạn - {{full_name}}',
    body: `Chào {{full_name}},

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
    key: 'E2', milestone: 'D-7', email_type: 'department', day_offset: -7,
    receiver_setting: 'dept_hcns_email', receiver_label: 'HCNS / Backoffice',
    subject: '[ORDER] Thiết bị làm việc + vé xe cho NV mới - {{full_name}} - {{start_date}}',
    body: `Hi team Backoffice,

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
    key: 'E3', milestone: 'D-5', email_type: 'department', day_offset: -5,
    receiver_setting: 'dept_it_mynth_email', receiver_label: 'MyNTH (IT)',
    subject: '[ORDER] Cấp email công ty cho NV mới - {{full_name}} - {{start_date}}',
    body: `Hi MyNTH,

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
    key: 'E4', milestone: 'D-5', email_type: 'department', day_offset: -5,
    receiver_setting: 'dept_it_hungnx_email', receiver_label: 'HùngNX (IT)',
    subject: '[ORDER] Cấp tài khoản Confluence cho NV mới - {{full_name}}',
    body: `Hi HùngNX,

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
    key: 'E5', milestone: 'D-5', email_type: 'department', day_offset: -5,
    receiver_setting: 'dept_cb_phuongth_email', receiver_label: 'PhươngHT (C&B)',
    subject: '[ORDER] Cấp tài khoản MISA + Username cho NV mới - {{full_name}}',
    body: `Hi PhươngHT,

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
    key: 'E6', milestone: 'D-3', email_type: 'candidate', day_offset: -3,
    receiver_field: 'personal_email', receiver_label: 'Ứng viên',
    subject: '[APERO] Chào Mừng - Chúng Tôi Đang Chờ Đón Bạn! - {{full_name}}',
    body: `Chào {{full_name}},

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
    key: 'E7', milestone: 'D-1', email_type: 'candidate', day_offset: -1,
    receiver_field: 'personal_email', receiver_label: 'Ứng viên',
    subject: '[Apero Technologies Group] Thư chào mừng - {{full_name}}',
    body: `Chào Anh/Chị {{full_name}},

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
    key: 'E8', milestone: 'D0', email_type: 'candidate', day_offset: 0,
    receiver_field: 'personal_email', receiver_label: 'Ứng viên',
    subject: '[APERO] Tài Khoản Nội Bộ Của Bạn - {{full_name}}',
    body: `Chào mừng {{full_name}} đến với Apero!

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

const DEPT_ORDERS_TEMPLATE = [
  { key: 'O1', milestone: 'D-7', day_offset: -7, deadline_offset: -1, order_type: 'Thiết bị + vé xe', receiver: 'HCNS / Backoffice', content: 'Laptop, màn hình, bàn phím, chuột, tai nghe, thẻ NV, vé xe tháng' },
  { key: 'O2', milestone: 'D-5', day_offset: -5, deadline_offset: 0, order_type: 'Email công ty', receiver: 'MyNTH (IT)', content: 'Cấp tài khoản email công ty (cấp TRƯỚC Confluence)' },
  { key: 'O3', milestone: 'D-5', day_offset: -5, deadline_offset: -1, order_type: 'Confluence', receiver: 'HùngNX (IT)', content: 'Cấp Confluence: Space chung + Space đơn vị + Space team/dự án' },
  { key: 'O4', milestone: 'D-5', day_offset: -5, deadline_offset: 0, order_type: 'MISA + Username', receiver: 'PhươngHT (C&B)', content: 'Tài khoản MISA, Username nội bộ, bốc dữ liệu Form H1211 → H1212F' },
  { key: 'O5', milestone: 'D-2', day_offset: -2, deadline_offset: -1, order_type: 'Setup chỗ ngồi + thiết bị', receiver: 'HCNS', content: 'Setup chỗ ngồi, kiểm tra laptop/màn hình đã hoạt động' }
];

const CHECKLIST_TEMPLATE = [
  // D-7 (5)
  { milestone: 'D-7', task_name: '📧 Gửi email lấy thông tin nhân sự (Form Google)', assignee: 'HR' },
  { milestone: 'D-7', task_name: '🧰 Order thiết bị làm việc trong group Backoffice', assignee: 'HR + HCNS' },
  { milestone: 'D-7', task_name: '🚌 Order vé xe tháng (nếu nhân viên cần)', assignee: 'HR + HCNS' },
  { milestone: 'D-7', task_name: '🪪 Order thẻ nhân viên', assignee: 'HR + HCNS' },
  { milestone: 'D-7', task_name: '💌 Tương tác hàng tuần qua mạng xã hội (nếu UV hẹn xa)', assignee: 'HR' },
  // D-5 (5)
  { milestone: 'D-5', task_name: '📋 Nhận thông tin nhân sự từ Google Form', assignee: 'HR' },
  { milestone: 'D-5', task_name: '📤 Báo PhươngHT bốc dữ liệu Form sang File chính thức', assignee: 'HR → C&B' },
  { milestone: 'D-5', task_name: '📨 Gửi email order cấp email công ty cho MyNTH', assignee: 'HR → IT' },
  { milestone: 'D-5', task_name: '🔐 Gửi email order cấp tài khoản Confluence cho HùngNX', assignee: 'HR → IT' },
  { milestone: 'D-5', task_name: '💼 Gửi email order tài khoản MISA + Username cho PhươngHT', assignee: 'HR → C&B' },
  // D-3 (3)
  { milestone: 'D-3', task_name: '💌 Gửi email chào mừng + giới thiệu quản lý cho ứng viên', assignee: 'HR' },
  { milestone: 'D-3', task_name: '📞 Báo quản lý trực tiếp về lịch onboard', assignee: 'HR' },
  { milestone: 'D-3', task_name: '🏢 Book phòng BOD nếu là cấp C-Level (phối hợp HuyềnLK)', assignee: 'HR' },
  // D-2 (2)
  { milestone: 'D-2', task_name: '🪑 Báo HC setup máy, chỗ ngồi', assignee: 'HR + HC' },
  { milestone: 'D-2', task_name: '🔧 Kiểm tra thiết bị đã hoạt động', assignee: 'HCNS' },
  // D-1 (4)
  { milestone: 'D-1', task_name: '🌟 Gửi email Welcome cho ứng viên', assignee: 'HR' },
  { milestone: 'D-1', task_name: '✅ Confirm tài khoản email & Confluence đã cấp xong', assignee: 'IT' },
  { milestone: 'D-1', task_name: '🎁 Chuẩn bị Welcome Kit (sổ tay, móc khóa)', assignee: 'HR' },
  { milestone: 'D-1', task_name: '📑 Chuẩn bị hợp đồng thử việc + NDA + NCA', assignee: 'C&B' },
  // D0 (10)
  { milestone: 'D0', task_name: '👋 8h25-8h35 Đón tiếp ứng viên, mời nước tại sảnh', assignee: 'HR' },
  { milestone: 'D0', task_name: '💼 Báo PhươngHT kích hoạt tài khoản MISA', assignee: 'HR → C&B' },
  { milestone: 'D0', task_name: '📧 Gửi mail cấp tài khoản nội bộ (Gmail, Confluence, Discord, FB)', assignee: 'HR + IT' },
  { milestone: 'D0', task_name: '🖥 8h35-9h15 Trình chiếu slide Onboarding (TÀI LIỆU ONBOARDING)', assignee: 'HR' },
  { milestone: 'D0', task_name: '💬 Add ứng viên vào các group Discord (news, đào tạo, dev)', assignee: 'HR' },
  { milestone: 'D0', task_name: '📘 Add ứng viên vào group Facebook nội bộ', assignee: 'HR' },
  { milestone: 'D0', task_name: '🏢 9h15-9h30 Tham quan văn phòng, pantry, phòng họp, khu ăn', assignee: 'HR' },
  { milestone: 'D0', task_name: '🤝 9h30 Bàn giao nhân sự cho bộ phận, check thiết bị', assignee: 'HR + Quản lý' },
  { milestone: 'D0', task_name: '🍱 11h Check giờ trưa, hỏi UV ăn cùng team (đặt cơm Nguyên)', assignee: 'HR' },
  { milestone: 'D0', task_name: '🎁 Tặng bộ quà Onboard (sổ tay, móc khóa)', assignee: 'HR' },
  // D+1 (4)
  { milestone: 'D+1', task_name: '💬 Add Discord, Facebook (kiểm tra UV đã join chưa)', assignee: 'HR' },
  { milestone: 'D+1', task_name: '👋 Hỏi thăm cảm nhận ngày đầu, vé xe, thiết bị (Zalo/Discord)', assignee: 'HR' },
  { milestone: 'D+1', task_name: '✅ Kiểm tra check-in MISA đã hoạt động', assignee: 'HR' },
  { milestone: 'D+1', task_name: '🏦 Nhắc UV mở tài khoản VP Bank (nếu chưa có)', assignee: 'HR' },
  // D+2 (1)
  { milestone: 'D+2', task_name: '🤝 Hỏi tình hình training, mức độ hòa nhập với team', assignee: 'HR' },
  // D+3 (1)
  { milestone: 'D+3', task_name: '📋 Hỏi về công việc, sự quan tâm từ sếp & team', assignee: 'HR' },
  // D+7 (4)
  { milestone: 'D+7', task_name: '🗣 Hội thoại 1:1 với quản lý về mục tiêu thử việc', assignee: 'Manager' },
  { milestone: 'D+7', task_name: '💬 HR check-in cảm nhận sau 1 tuần, ghi nhận phản hồi', assignee: 'HR' },
  { milestone: 'D+7', task_name: '📚 Hoàn thành đào tạo cơ bản (văn hóa, Ketraphaky, quy trình)', assignee: 'Manager' },
  { milestone: 'D+7', task_name: '📑 Ký hợp đồng thử việc chính thức + NDA/NCA', assignee: 'C&B' },
  // D+30 (2)
  { milestone: 'D+30', task_name: '📊 Review KPI tháng đầu với quản lý trực tiếp', assignee: 'Manager' },
  { milestone: 'D+30', task_name: '💬 HR check-in cảm nhận 1 tháng (môi trường, cách làm việc)', assignee: 'HR' },
  // D+60 (3)
  { milestone: 'D+60', task_name: '🎯 Đánh giá kết quả thử việc chính thức', assignee: 'Manager' },
  { milestone: 'D+60', task_name: '💬 HR check-in cảm nhận 2 tháng', assignee: 'HR' },
  { milestone: 'D+60', task_name: '✅ Quyết định nhận chính thức hoặc kết thúc thử việc', assignee: 'BOD + HR' }
];

const MILESTONE_OFFSETS = {
  'D-7': -7, 'D-5': -5, 'D-3': -3, 'D-2': -2, 'D-1': -1,
  'D0': 0, 'D+1': 1, 'D+2': 2, 'D+3': 3, 'D+7': 7, 'D+30': 30, 'D+60': 60
};

const FOLLOWUP_QUESTIONS = [
  // D+1 (5)
  { milestone: 'D+1', question: 'Đã join vào các tài khoản nội bộ chưa? (Group FB, Discord, Confluence)\n• Em chưa thấy anh/chị join vào group FB của công ty ạ?\n• Leader đã add mình vào nhóm chat của team chưa ạ?' },
  { milestone: 'D+1', question: 'Anh/chị đã đăng nhập vào tài khoản gmail trên thiết bị của công ty chưa? (Để tiện đọc tài liệu)' },
  { milestone: 'D+1', question: 'Ngày đầu anh/chị có gặp khó khăn hay bỡ ngỡ về các task công việc mới không ạ?' },
  { milestone: 'D+1', question: 'Có mang đồ ăn trưa đi không? (Gợi ý: rủ đặt cơm Nguyên cùng, phím team đưa UV đi ăn cùng)' },
  { milestone: 'D+1', question: 'Hôm nay anh/chị có đi xe máy đi làm không ạ? Hiện tại đang gửi xe ở đâu? (Gợi ý chỗ để xe)' },
  // D+2 (3)
  { milestone: 'D+2', question: 'Hôm nay tình hình training thế nào? Có khó khăn gì khi tiếp nhận thông tin không?' },
  { milestone: 'D+2', question: 'Em đã làm quen được với team chưa? Có ai trong team support em nhiệt tình không?' },
  { milestone: 'D+2', question: 'Em có khó khăn gì với hệ thống/tools công ty không? (Confluence, Jira, MISA, Discord...)' },
  // D+3 (3)
  { milestone: 'D+3', question: 'Quản lý đã giao task cụ thể cho em chưa? Em có rõ kỳ vọng từ quản lý không?' },
  { milestone: 'D+3', question: 'Em có cảm nhận thế nào về sự quan tâm từ sếp & team trong 3 ngày qua?' },
  { milestone: 'D+3', question: 'Có vấn đề gì về môi trường làm việc, văn hóa công ty mà em chưa quen không?' },
  // D+7 (5)
  { milestone: 'D+7', question: 'Sau 1 tuần làm việc, bạn cảm nhận thế nào về công việc hiện tại?' },
  { milestone: 'D+7', question: 'Bạn có cảm thấy mình đang theo kịp nhịp công việc không? Vì sao?' },
  { milestone: 'D+7', question: 'Cảm nhận chung của bạn về môi trường làm việc trong tuần đầu là gì?' },
  { milestone: 'D+7', question: 'Trải nghiệm của bạn khi làm việc với quản lý trực tiếp trong tuần đầu như thế nào?' },
  { milestone: 'D+7', question: 'Bạn đã làm quen với team chưa? Bạn thấy team có dễ hòa nhập hay không?' },
  // D+30 (4)
  { milestone: 'D+30', question: 'Sau 1 tháng, bạn cảm nhận thế nào về nhịp làm việc và cách vận hành chung của công ty?' },
  { milestone: 'D+30', question: 'Có điều gì trong văn hóa công ty hoặc cách làm việc của team khiến bạn cảm thấy chưa quen hoặc chưa thoải mái không?' },
  { milestone: 'D+30', question: 'Trong giai đoạn thử việc, bạn đã hiểu rõ kỳ vọng của quản lý trực tiếp đối với mình chưa?' },
  { milestone: 'D+30', question: 'So với kỳ vọng ban đầu, khối lượng và độ phức tạp của công việc hiện tại có phù hợp không?' },
  // D+60 (5)
  { milestone: 'D+60', question: 'Sau 2 tháng, bạn cảm thấy mức độ phù hợp của mình với văn hóa Apero ra sao?' },
  { milestone: 'D+60', question: 'Bạn có đang gặp khó khăn nào kéo dài nhưng chưa chia sẻ không?' },
  { milestone: 'D+60', question: 'Bạn có cảm giác công việc hiện tại phù hợp với năng lực & định hướng của bạn không?' },
  { milestone: 'D+60', question: 'Bạn đã thực sự thẳng thắn trong trao đổi với quản lý hay chưa?' },
  { milestone: 'D+60', question: 'Ngược lại, điều gì khiến bạn còn băn khoăn hoặc e ngại?' }
];

module.exports = {
  FORM_LINK,
  EMAIL_TEMPLATES,
  DEPT_ORDERS_TEMPLATE,
  CHECKLIST_TEMPLATE,
  MILESTONE_OFFSETS,
  FOLLOWUP_QUESTIONS
};
