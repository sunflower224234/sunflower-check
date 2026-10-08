/* 签到系统前端逻辑：提交签到、刷新统计与记录列表 */

const form = document.getElementById("checkin-form");
const submitBtn = document.getElementById("submit-btn");
const messageEl = document.getElementById("message");
const recordsBody = document.getElementById("records-body");
const refreshBtn = document.getElementById("refresh-btn");

/** 显示一行提示信息 */
function showMessage(text, kind) {
  messageEl.textContent = text;
  messageEl.className = "message " + (kind || "");
}

/** 转义 HTML，避免姓名中的特殊字符破坏页面结构 */
function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value == null ? "" : String(value);
  return div.innerHTML;
}

/** 渲染签到记录表格 */
function renderRecords(records) {
  if (!records.length) {
    recordsBody.innerHTML = '<tr><td colspan="5" class="empty">暂无签到记录</td></tr>';
    return;
  }
  recordsBody.innerHTML = records
    .map((r, i) => `
      <tr>
        <td>${records.length - i}</td>
        <td>${escapeHtml(r.student_id)}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.checkin_at)}</td>
        <td><span class="tag ${r.status === "迟到" ? "迟到" : "正常"}">${escapeHtml(r.status)}</span></td>
      </tr>`)
    .join("");
}

/** 刷新统计卡片 */
async function loadStats() {
  const res = await fetch("/api/stats");
  const data = await res.json();
  document.getElementById("stat-total").textContent = data.total;
  document.getElementById("stat-ontime").textContent = data.ontime;
  document.getElementById("stat-late").textContent = data.late;
  document.getElementById("stats-date").textContent = data.date || "";
}

/** 刷新记录列表 */
async function loadRecords() {
  const res = await fetch("/api/records");
  const data = await res.json();
  renderRecords(data.records || []);
}

/** 整体刷新 */
async function refreshAll() {
  await Promise.all([loadStats(), loadRecords()]);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitBtn.disabled = true;
  showMessage("正在提交…", "");

  const payload = {
    student_id: document.getElementById("student_id").value.trim(),
    name: document.getElementById("name").value.trim(),
  };

  try {
    const res = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (data.ok) {
      showMessage(`签到成功：${data.name}（${data.status}）`, "ok");
      form.reset();
      document.getElementById("student_id").focus();
      await refreshAll();
    } else {
      showMessage(data.reason || "签到失败", "err");
    }
  } catch (err) {
    showMessage("网络错误，请确认服务是否在运行", "err");
  } finally {
    submitBtn.disabled = false;
  }
});

refreshBtn.addEventListener("click", refreshAll);

// 页面加载后拉取一次数据
refreshAll();
