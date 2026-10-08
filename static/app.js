const $ = (id) => document.getElementById(id);
let records = [],
  todayStats = null,
  capacity = null;
try {
  const stored = Number(localStorage.getItem("checkin-capacity"));
  if (Number.isInteger(stored) && stored > 0 && stored <= 100000)
    capacity = stored;
} catch {}
const form = $("checkin-form"),
  submitBtn = $("submit-btn");
function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function updateDate() {
  const date = new Date();
  $("header-date").textContent =
    `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, "0")}月${String(date.getDate()).padStart(2, "0")}日`;
  $("header-weekday").textContent = [
    "星期日",
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
  ][date.getDay()];
}
updateDate();
setInterval(updateDate, 60000);
function showMessage(text, kind = "") {
  $("message").textContent = text;
  $("message").className = "message " + kind;
}
function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}
async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("读取失败");
  const data = await response.json();
  if (!data.ok) throw new Error(data.reason || "读取失败");
  return data;
}
function renderRecords() {
  const filtered = records.filter(
    (r) =>
      $("status-filter").value === "all" ||
      r.status === $("status-filter").value,
  );
  $("records-body").innerHTML = filtered.length
    ? filtered
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.id)}</td><td>${escapeHtml(r.student_id)}</td><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.checkin_at)}</td><td><span class="tag ${r.status === "迟到" ? "迟到" : "正常"}">${r.status === "迟到" ? "◷" : "✓"} ${escapeHtml(r.status)}</span></td></tr>`,
        )
        .join("")
    : '<tr><td colspan="5" class="empty">' +
      (records.length
        ? "没有符合筛选条件的记录"
        : "还没有签到记录，来成为第一位吧！") +
      "</td></tr>";
}
function renderAttendance() {
  const total = todayStats?.total;
  $("attendance-count").textContent = capacity
    ? `${total ?? "—"} / ${capacity} 人`
    : "未设置应到人数";
  const rate =
    capacity && total != null ? Math.round((total / capacity) * 100) : null;
  $("attendance-rate").textContent = rate == null ? "—" : `${rate}%`;
  $("attendance-ring").style.setProperty(
    "--progress",
    `${Math.min(rate ?? 0, 100) * 3.6}deg`,
  );
  $("capacity-btn").textContent = capacity ? "修改人数" : "设置人数";
}
function renderTrend() {
  const date = todayStats?.date || localDate();
  const rows = records
    .filter((r) => r.checkin_at.slice(0, 10) === date)
    .sort((a, b) => a.checkin_at.localeCompare(b.checkin_at) || a.id - b.id);
  const toHour = (r) => {
    const time = r.checkin_at.slice(11).split(":").map(Number);
    return time[0] + time[1] / 60 + time[2] / 3600;
  };
  const hours = rows.map(toHour),
    now = new Date();
  const start = Math.min(8, Math.floor(hours[0] ?? 8)),
    end = Math.max(20, Math.ceil(hours.at(-1) ?? 20));
  const chartWidth = Math.max(250, Math.min(720, $("trend-chart").clientWidth)),
    chartRight = chartWidth - 14;
  $("trend-chart").setAttribute("viewBox", `0 0 ${chartWidth} 190`);
  const max = Math.max(4, Math.ceil(rows.length / 4) * 4),
    x = (hour) => 38 + ((hour - start) / (end - start)) * (chartRight - 38),
    y = (count) => 153 - (count / max) * 126;
  const points = [[start, 0]];
  rows.forEach((r, i) => {
    points.push([toHour(r), i], [toHour(r), i + 1]);
  });
  const current =
    date === localDate() ? now.getHours() + now.getMinutes() / 60 : end;
  if (rows.length)
    points.push([Math.max(hours.at(-1), Math.min(end, current)), rows.length]);
  let svg =
    '<defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--chart-area)" stop-opacity=".4"/><stop offset="100%" stop-color="var(--chart-area)" stop-opacity=".03"/></linearGradient></defs>';
  for (let i = 0; i <= 4; i++) {
    const value = (max * i) / 4;
    svg += `<line x1="38" y1="${y(value)}" x2="${chartRight}" y2="${y(value)}" stroke="var(--line)"/><text x="25" y="${y(value) + 4}" text-anchor="end" font-size="11" fill="currentColor">${value}</text>`;
  }
  const tickCount = chartWidth < 450 ? 3 : 6;
  for (let i = 0; i <= tickCount; i++) {
    const hour = start + ((end - start) * i) / tickCount;
    svg += `<line x1="${x(hour)}" y1="27" x2="${x(hour)}" y2="153" stroke="var(--line)"/><text x="${x(hour)}" y="178" text-anchor="middle" font-size="11" fill="currentColor">${Math.floor(hour)}:${String(Math.round((hour % 1) * 60)).padStart(2, "0")}</text>`;
  }
  if (rows.length) {
    const path = points
      .map(
        (p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(2)},${y(p[1]).toFixed(2)}`,
      )
      .join(" ");
    const last = points.at(-1);
    svg += `<path d="${path} L${x(last[0])},153 L38,153 Z" fill="url(#area)"/><path d="${path}" stroke="var(--brand)" stroke-width="3" fill="none"/><circle cx="${x(hours.at(-1))}" cy="${y(rows.length)}" r="5" fill="var(--brand)" stroke="var(--white)" stroke-width="2"/>`;
  } else
    svg +=
      '<text x="${chartWidth/2}" y="90" text-anchor="middle" font-size="14" fill="currentColor">今天还没有签到记录</text>';
  $("trend-chart").innerHTML = svg;
  const complete = todayStats && rows.length === todayStats.total;
  $("trend-note").textContent = complete
    ? "根据今日真实记录绘制 · 累计签到人数"
    : "基于最近 100 条记录绘制，可能未覆盖今日全部签到";
  $("trend-chart").setAttribute(
    "aria-label",
    `今日累计签到趋势，图中包含 ${rows.length} 条签到记录${complete ? "" : "，可能不完整"}`,
  );
}
let refreshing = false;
async function refreshAll() {
  if (refreshing) return;
  refreshing = true;
  $("refresh-btn").disabled = true;
  $("refresh-btn").textContent = "↻ 刷新中";
  try {
    const [statsData, recordsData] = await Promise.all([
      getJson("/api/stats"),
      getJson("/api/records"),
    ]);
    todayStats = statsData;
    records = recordsData.records || [];
    $("stats-date").textContent = statsData.date;
    ["total", "ontime", "late"].forEach(
      (k) => ($("stat-" + k).textContent = statsData[k]),
    );
    renderRecords();
    renderAttendance();
    renderTrend();
    $("load-status").textContent =
      "已更新 · " +
      new Date().toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
      });
  } catch {
    $("load-status").textContent = "读取失败，请确认服务正在运行后重试刷新。";
    if (!todayStats)
      $("records-body").innerHTML =
        '<tr><td colspan="5" class="empty">暂时无法读取记录，请点击刷新重试</td></tr>';
  } finally {
    refreshing = false;
    $("refresh-btn").disabled = false;
    $("refresh-btn").textContent = "↻ 刷新";
  }
}
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitBtn.disabled) return;
  submitBtn.disabled = true;
  showMessage("正在提交…");
  const payload = {
    student_id: $("student_id").value.trim(),
    name: $("name").value.trim(),
  };
  try {
    const response = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (response.ok && data.ok) {
      showMessage(`签到成功：${data.name}（${data.status}）`, "ok");
      form.reset();
      $("student_id").focus();
      await refreshAll();
    } else showMessage(data.reason || "签到失败，请重试", "err");
  } catch {
    showMessage("网络错误，请确认服务是否在运行", "err");
  } finally {
    submitBtn.disabled = false;
  }
});
$("status-filter").addEventListener("change", renderRecords);
$("refresh-btn").addEventListener("click", refreshAll);
$("view-trend").addEventListener("click", () => {
  $("trend-panel").scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
    block: "center",
  });
});
$("capacity-btn").addEventListener("click", () => {
  $("capacity-input").value = capacity || "";
  $("capacity-error").textContent = "";
  $("capacity-dialog").showModal();
});
$("capacity-cancel").addEventListener("click", () =>
  $("capacity-dialog").close(),
);
$("capacity-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const value = Number($("capacity-input").value);
  if (!Number.isInteger(value) || value < 1 || value > 100000) {
    $("capacity-error").textContent = "请输入 1–100000 之间的整数";
    return;
  }
  try {
    localStorage.setItem("checkin-capacity", String(value));
  } catch {
    $("capacity-error").textContent = "浏览器无法保存设置，请检查存储权限";
    return;
  }
  capacity = value;
  renderAttendance();
  $("capacity-dialog").close();
});
renderAttendance();
refreshAll();

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderTrend, 120);
});
