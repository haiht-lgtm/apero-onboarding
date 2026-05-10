// ═══════════════════════════════════════════════════════════════════
// Timeline Generator — sinh email/order/checklist/followup ON-THE-FLY
// từ 1 candidate. Không lưu DB. Mỗi lần gọi hàm này = data mới sinh.
// ═══════════════════════════════════════════════════════════════════
const {
  EMAIL_TEMPLATES,
  DEPT_ORDERS_TEMPLATE,
  CHECKLIST_TEMPLATE,
  MILESTONE_OFFSETS,
  FOLLOWUP_QUESTIONS
} = require('./templates');
const { addDays, renderTemplate, buildVars } = require('./helpers');

// Sinh 8 emails cho 1 candidate. Receiver có thể đến từ candidate hoặc settings.
function generateEmails(candidate, deptEmails = {}) {
  const vars = buildVars(candidate);
  return EMAIL_TEMPLATES.map(t => {
    let receiver = '';
    if (t.email_type === 'candidate') {
      receiver = candidate[t.receiver_field] || '';
    } else {
      // department: lấy từ deptEmails (settings)
      receiver = deptEmails[t.receiver_setting] || '';
    }
    return {
      candidate_id: candidate.id,
      template_key: t.key,
      milestone: t.milestone,
      email_type: t.email_type,
      scheduled_date: candidate.start_date ? addDays(candidate.start_date, t.day_offset) : null,
      subject: renderTemplate(t.subject, vars),
      body: renderTemplate(t.body, vars),
      receiver,
      receiver_label: t.receiver_label
    };
  });
}

// Sinh 5 dept_orders cho 1 candidate
function generateOrders(candidate) {
  return DEPT_ORDERS_TEMPLATE.map(o => ({
    candidate_id: candidate.id,
    order_key: o.key,
    milestone: o.milestone,
    deadline: candidate.start_date ? addDays(candidate.start_date, o.deadline_offset) : null,
    order_type: o.order_type,
    receiver: o.receiver,
    content: o.content
  }));
}

// Sinh 44 checklist items
function generateChecklist(candidate) {
  return CHECKLIST_TEMPLATE.map((it, idx) => ({
    candidate_id: candidate.id,
    item_index: idx, // dùng làm key cho state
    milestone: it.milestone,
    task_name: it.task_name,
    assignee: it.assignee,
    deadline: candidate.start_date ? addDays(candidate.start_date, MILESTONE_OFFSETS[it.milestone]) : null
  }));
}

// Sinh 25 follow-up questions
function generateFollowups(candidate) {
  return FOLLOWUP_QUESTIONS.map((q, idx) => ({
    candidate_id: candidate.id,
    question_index: idx,
    milestone: q.milestone,
    question: q.question
  }));
}

// Sinh full timeline cho 1 candidate
function generateTimeline(candidate, deptEmails = {}) {
  return {
    emails: generateEmails(candidate, deptEmails),
    orders: generateOrders(candidate),
    checklist: generateChecklist(candidate),
    followups: generateFollowups(candidate)
  };
}

module.exports = {
  generateEmails,
  generateOrders,
  generateChecklist,
  generateFollowups,
  generateTimeline
};
