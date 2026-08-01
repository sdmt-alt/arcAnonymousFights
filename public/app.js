const tokenKey = "competitionResultToken";
const userKey = "competitionResultUser";

let allMappers = [];
let activeBattles = [];
let bonusCollaboratorIds = [];
let timelineMode = "battle";
let editingSubmissionId = "";
let allGroups = [];
let currentAdminBattleFilter = "";
let adminUsers = [];
let adminBattles = [];
let currentBattleId = "";
let treasureEffectToken = 0;
let timelineRefreshTimer = 0;
let battleCountdownTimer = 0;

const AFF_SYNTAX_FIELD_MAP = {
  affAllowGreenSnake: "allowGreenSnake",
  affAllowGraySnake: "allowGraySnake",
  affAllowSpecialHitsound: "allowSpecialHitsound",
  affAllowDesignantRedLine: "allowDesignantRedLine",
  affAllowSmoothness: "allowSmoothness",
  affAllowFloatTapHold: "allowFloatTapHold",
  affAllowSizeKey: "allowSizeKey",
  affAllowCamera: "allowCamera",
  affAllowTrackHideShow: "allowTrackHideShow",
  affAllowTrackDisplay: "allowTrackDisplay",
  affAllowArcahvEffects: "allowArcahvEffects",
  affAllowHideGroup: "allowHideGroup",
  affAllowSixK: "allowSixK",
  affAllowNoInput: "allowNoInput",
  affAllowAngle: "allowAngle",
  affAllowFadingHolds: "allowFadingHolds"
};

document.addEventListener("DOMContentLoaded", () => {
  ensureAuthModal();
  ensureAutoCheckModal();
  setupAccountChip();
  setupAuthForms();
  if (location.pathname === "/" || location.pathname.endsWith("/index.html")) setupTreasureChest();
  renderSession();
  setupTimelineTabs();
  setupMapperGroupFilter();
  loadMappers();
  loadMapperGroups();
  loadCollections();
  loadTimeline();
  setupSubmissionPage();
  setupProfilePage();
  setupPublicUserPage();
  setupBattleDirectoryPage();
  setupBattleDetailPage();
  setupHostPage();
  setupJacketCollectionPage();
  setupAdminPage();
});

function authHeaders(extra = {}) {
  const token = localStorage.getItem(tokenKey);
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

function openModal(selectorOrElement) {
  const modal = typeof selectorOrElement === "string" ? document.querySelector(selectorOrElement) : selectorOrElement;
  if (!modal) return;
  window.clearTimeout(Number(modal.dataset.closeTimer || 0));
  modal.classList.remove("hidden", "modal-closing");
  modal.classList.add("modal-open");
}

function closeModal(selectorOrElement) {
  const modal = typeof selectorOrElement === "string" ? document.querySelector(selectorOrElement) : selectorOrElement;
  if (!modal || modal.classList.contains("hidden")) return;
  window.clearTimeout(Number(modal.dataset.closeTimer || 0));
  modal.classList.remove("modal-open");
  modal.classList.add("modal-closing");
  modal.dataset.closeTimer = String(window.setTimeout(() => {
    modal.classList.add("hidden");
    modal.classList.remove("modal-closing");
    modal.dataset.closeTimer = "";
  }, 180));
}

function ensureAutoCheckModal() {
  if (document.querySelector("#autoCheckModal")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-backdrop hidden" id="autoCheckModal">
      <div class="modal-panel">
        <div class="modal-heading">
          <h2 id="autoCheckTitle">自动检查结果</h2>
          <button class="ghost-button compact" id="closeAutoCheckModal" type="button">关闭</button>
        </div>
        <div class="check-result-list" id="autoCheckResultList"></div>
      </div>
    </div>
  `);
  document.querySelector("#closeAutoCheckModal").addEventListener("click", closeAutoCheckModal);
  document.querySelector("#autoCheckModal").addEventListener("click", (event) => {
    if (event.target.id === "autoCheckModal") closeAutoCheckModal();
  });
}

function showAutoCheckModal(ok, messages) {
  document.querySelector("#autoCheckTitle").textContent = ok ? "谱面提交成功" : "谱面提交不成功";
  document.querySelector("#autoCheckResultList").innerHTML = messages.map((message) => `
    <div class="check-result-item ${ok ? "success" : "error"}">${escapeHtml(message)}</div>
  `).join("");
  openModal("#autoCheckModal");
}

function closeAutoCheckModal() {
  closeModal("#autoCheckModal");
}

function showInfoModal(title, messages) {
  ensureAutoCheckModal();
  document.querySelector("#autoCheckTitle").textContent = title;
  document.querySelector("#autoCheckResultList").innerHTML = messages.map((message) => `
    <div class="check-result-item">${escapeHtml(message)}</div>
  `).join("");
  openModal("#autoCheckModal");
}

function ensureAuthModal() {
  if (document.querySelector("#authModal")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-backdrop hidden" id="authModal">
      <div class="modal-panel">
        <div class="modal-heading">
          <h2>账户登录</h2>
          <button class="ghost-button compact" id="closeAuthModal" type="button">关闭</button>
        </div>
        <div class="tabs" role="tablist" aria-label="账户操作">
          <button class="tab active" data-tab="login" type="button">登录</button>
          <button class="tab" data-tab="register" type="button">注册</button>
        </div>
        <form class="auth-form" id="loginForm">
          <label>用户名<input name="username" autocomplete="username" required></label>
          <label>密码<input name="password" type="password" autocomplete="current-password" required></label>
          <button type="submit">登录</button>
        </form>
        <form class="auth-form hidden" id="registerForm">
          <label>用户名<input name="username" autocomplete="username" required></label>
          <label>密码<input name="password" type="password" autocomplete="new-password" minlength="6" required></label>
          <label>谱师名义<input name="chartName" required></label>
          <label>注册验证码<input name="registrationCode" required></label>
          <button type="submit">创建普通用户账号</button>
        </form>
        <p class="message" id="authMessage" role="status"></p>
      </div>
    </div>
  `);
  document.querySelector("#closeAuthModal").addEventListener("click", closeAuthModal);
  document.querySelector("#authModal").addEventListener("click", (event) => {
    if (event.target.id === "authModal") closeAuthModal();
  });
  setupTabs();
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const scope = tab.closest(".modal-panel") || document;
      scope.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      const isLogin = tab.dataset.tab === "login";
      scope.querySelector("#loginForm")?.classList.toggle("hidden", !isLogin);
      scope.querySelector("#registerForm")?.classList.toggle("hidden", isLogin);
      setMessage("#authMessage", "");
    });
  });
}

function setupAccountChip() {
  ensureAccountPopover();
  const chip = document.querySelector("#accountChip");
  chip?.addEventListener("click", () => {
    const user = getStoredUser();
    if (!user) {
      openAuthModal();
      return;
    }
    location.href = user.role === "admin" ? "/admin.html" : "/profile.html";
  });
  chip?.addEventListener("mouseenter", refreshAccountPopover);
  document.querySelector("#openLoginButton")?.addEventListener("click", openAuthModal);
}

function ensureAccountPopover() {
  const chip = document.querySelector("#accountChip");
  if (!chip || document.querySelector("#accountPopover")) return;
  chip.insertAdjacentHTML("afterend", `
    <div class="account-popover hidden" id="accountPopover">
      <div class="account-popover-title" id="accountPopoverTitle">账户状态</div>
      <div class="account-stat-row" id="inReviewRow"><span id="inReviewLabel">审核中</span><strong id="inReviewCount">0</strong></div>
      <div class="account-stat-row" id="waitingReviewRow"><span id="waitingReviewLabel">等待合作对象</span><strong id="waitingReviewCount">0</strong></div>
      <div class="account-stat-row hidden" id="hostTodoRow"><span>主催待办</span><strong id="hostTodoCount">0</strong></div>
      <button class="ghost-button compact" id="popoverLogoutButton" type="button">退出登录</button>
    </div>
  `);
  const popover = document.querySelector("#accountPopover");
  [chip, popover].forEach((element) => {
    element.addEventListener("mouseenter", () => {
      if (getStoredUser()) popover.classList.remove("hidden");
    });
    element.addEventListener("mouseleave", () => {
      window.setTimeout(() => {
        if (!chip.matches(":hover") && !popover.matches(":hover")) popover.classList.add("hidden");
      }, 80);
    });
  });
  document.querySelector("#popoverLogoutButton").addEventListener("click", logoutAndReturnHome);
  document.querySelector("#inReviewRow")?.addEventListener("click", () => {
    const target = document.querySelector("#inReviewRow")?.dataset.href;
    if (target) location.href = target;
  });
  document.querySelector("#hostTodoRow")?.addEventListener("click", () => {
    const target = document.querySelector("#hostTodoRow")?.dataset.href;
    if (target) location.href = target;
  });
}

function setupAuthForms() {
  document.querySelector("#loginForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await authenticate("/api/login", Object.fromEntries(new FormData(event.currentTarget)), "登录成功");
  });
  document.querySelector("#registerForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await authenticate("/api/register", Object.fromEntries(new FormData(event.currentTarget)), "注册成功");
  });
}

async function authenticate(url, data, successText) {
  setMessage("#authMessage", "正在处理...");
  try {
    const payload = await requestJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    localStorage.setItem(tokenKey, payload.token);
    localStorage.setItem(userKey, JSON.stringify(payload.user));
    renderSession();
    setMessage("#authMessage", successText, "success");
    closeAuthModal();
    if (location.pathname.endsWith("/submit.html")) await setupSubmissionPage();
  } catch (error) {
    setMessage("#authMessage", error.message, "error");
  }
}

function logoutAndReturnHome() {
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(userKey);
  renderSession();
  location.href = "/";
}

function openAuthModal() {
  openModal("#authModal");
}

function closeAuthModal() {
  closeModal("#authModal");
}

function renderSession() {
  const user = getStoredUser();
  document.querySelectorAll(".admin-nav").forEach((entry) => {
    entry.classList.toggle("hidden", user?.role !== "admin");
  });
  const avatar = document.querySelector("#accountAvatar");
  const name = document.querySelector("#accountName");
  if (avatar && name) {
    avatar.src = user?.avatarUrl || "/assets/avatar-placeholder.svg";
    name.textContent = user ? (user.chartName || user.username) : "未登录";
  }
  document.querySelector("#accountPopover")?.classList.add("hidden");
}

async function refreshAccountPopover() {
  const user = getStoredUser();
  if (!user) return;
  const url = user.role === "admin" ? "/api/admin/submissions" : "/api/my/submissions";
  document.querySelector("#accountPopoverTitle").textContent = user.role === "admin" ? "管理员待办" : "我的谱面";
  document.querySelector("#inReviewLabel").textContent = user.role === "admin" ? "待我审核" : "审核中";
  const inReviewRow = document.querySelector("#inReviewRow");
  if (user.role === "admin") inReviewRow.dataset.href = "/admin.html#review";
  else inReviewRow.removeAttribute("data-href");
  document.querySelector("#waitingReviewLabel").textContent = "等待合作对象";
  document.querySelector("#waitingReviewRow").classList.toggle("hidden", user.role === "admin");
  try {
    const payload = await requestJson(url, { headers: authHeaders() });
    const submissions = payload.submissions || [];
    document.querySelector("#inReviewCount").textContent = submissions.filter((item) => item.status === "pending").length;
    document.querySelector("#waitingReviewCount").textContent = user.role === "admin" ? "" : submissions.filter((item) => item.status === "waiting_collaboration").length;
    await refreshHostTodoRow();
  } catch {
    document.querySelector("#inReviewCount").textContent = "-";
    document.querySelector("#waitingReviewCount").textContent = "-";
    document.querySelector("#hostTodoRow")?.classList.add("hidden");
  }
}

async function refreshHostTodoRow() {
  const row = document.querySelector("#hostTodoRow");
  const count = document.querySelector("#hostTodoCount");
  if (!row || !count) return;
  try {
    const payload = await requestJson("/api/my/host-todos", { headers: authHeaders() });
    row.classList.toggle("hidden", !payload.isHost);
    count.textContent = payload.count ?? 0;
    const targetBattle = (payload.battles || []).find((battle) => Number(battle.todoCount) > 0) || payload.battles?.[0];
    row.dataset.href = targetBattle?.id ? `/host.html?id=${encodeURIComponent(targetBattle.id)}#review` : "";
  } catch {
    row.classList.add("hidden");
  }
}

function setupTimelineTabs() {
  const tabs = document.querySelector("#timelineTabs");
  if (!tabs) return;
  tabs.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      tabs.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      timelineMode = button.dataset.timeline;
      loadTimeline();
    });
  });
}

async function loadMappers() {
  const list = document.querySelector("#mapperList");
  try {
    const groupId = document.querySelector("#mapperGroupFilter")?.value || "";
    const payload = await requestJson(groupId ? `/api/users?groupId=${encodeURIComponent(groupId)}` : "/api/users");
    allMappers = payload.users || [];
    if (!list) return;
    list.innerHTML = allMappers.length ? allMappers.map((user) => `
      <a class="mapper-card" href="/user.html?id=${encodeURIComponent(user.id)}">
        <img src="${escapeHtml(user.avatarUrl)}" alt="${escapeHtml(user.chartName)}头像">
        <strong>${escapeHtml(user.chartName)}</strong>
      </a>
    `).join("") : emptyText("暂无注册谱师。");
  } catch {
    if (list) list.innerHTML = errorText("谱师列表加载失败。");
  }
}

function setupMapperGroupFilter() {
  document.querySelector("#mapperGroupFilter")?.addEventListener("change", loadMappers);
}

async function loadMapperGroups() {
  const payload = await requestJson("/api/mapper-groups");
  allGroups = payload.groups || [];
  fillBattleGroupSelect();
  fillAdminGroupControls();
  const filter = document.querySelector("#mapperGroupFilter");
  if (filter) {
    const current = filter.value;
    filter.innerHTML = `<option value="">全体谱师</option>${allGroups.map((group) => `<option value="${escapeAttr(group.id)}">${escapeHtml(group.name)}</option>`).join("")}`;
    filter.value = current;
  }
  fillProfileGroupControls();
  fillBattleGroupSelect();
}

function fillBattleGroupSelect() {
  const select = document.querySelector("#battleGroupSelect");
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">全部谱师</option>${allGroups.map((group) => `<option value="${escapeAttr(group.id)}">${escapeHtml(group.name)}</option>`).join("")}`;
  select.value = current;
}

async function loadCollections() {
  const list = document.querySelector("#collectionList");
  if (!list) return;
  list.innerHTML = loadingText();
  try {
    const payload = await requestJson("/api/collections");
    list.innerHTML = payload.collections.length ? payload.collections.map(renderCollectionCard).join("") : emptyText("暂无往届合集。");
  } catch {
    list.innerHTML = errorText("往届合集加载失败。");
  }
}

async function loadTimeline() {
  const list = document.querySelector("#scheduleList");
  if (!list) return;
  list.innerHTML = loadingText();
  try {
    const url = timelineMode === "battle" ? "/api/battles" : "/api/schedules";
    const payload = await requestJson(url);
    const items = (timelineMode === "battle" ? payload.battles : payload.schedules).slice().sort(sortTimelineItems);
    list.innerHTML = renderTimelineList(items, timelineMode);
    scheduleTimelineRefresh(items, timelineMode);
  } catch {
    list.innerHTML = errorText("时间线加载失败。");
  }
}
function renderTimelineList(items, type) {
  if (!items.length) return emptyText(type === "battle" ? "暂无无名战。" : "暂无活动日程。");
  const ended = items.filter((item) => timelineItemEnded(item, type));
  const active = items.filter((item) => !timelineItemEnded(item, type));
  const endedHtml = ended.length ? `
    <details class="ended-timeline-section">
      <summary>已结束${type === "battle" ? "无名战" : "日程"}（${ended.length}）</summary>
      <div class="schedule-list ended-timeline-list">${ended.map((item) => renderTimelineItem(item, type)).join("")}</div>
    </details>
  ` : "";
  return `${endedHtml}${active.map((item) => renderTimelineItem(item, type)).join("")}`;
}

function timelineItemEnded(item, type) {
  return type === "battle" ? item.phase === "ended" : timelineState(item.startTime, item.endTime).kind === "ended";
}

function scheduleTimelineRefresh(items, type) {
  window.clearTimeout(timelineRefreshTimer);
  const delays = items.map((item) => timelineRefreshDelay(item, type)).filter((delay) => delay > 0);
  if (!delays.length) return;
  timelineRefreshTimer = window.setTimeout(loadTimeline, Math.min(...delays));
}

function timelineRefreshDelay(item, type) {
  const now = Date.now();
  const state = type === "battle"
    ? { kind: item.phase, start: new Date(item.startTime).getTime(), end: new Date(item.endTime).getTime(), target: new Date(item.phaseEndsAt || item.endTime).getTime() }
    : { ...timelineState(item.startTime, item.endTime), start: new Date(item.startTime).getTime(), end: new Date(item.endTime).getTime() };
  if (state.kind === "ended") return 0;
  const target = state.kind === "upcoming" ? state.start : state.target || state.end;
  return countdownRefreshDelay(target - now);
}
async function setupBattleDirectoryPage() {
  const list = document.querySelector("#battleDirectoryList");
  if (!list) return;
  list.innerHTML = loadingText();
  try {
    const payload = await requestJson("/api/battles");
    list.innerHTML = renderBattleDirectory(payload.battles || []);
  } catch (error) {
    list.innerHTML = errorText(error.message);
  }
}

function renderBattleDirectory(battles) {
  if (!battles.length) return emptyText("暂无无名战。");
  const activeBattles = battles.filter((battle) => battle.phase !== "ended");
  const endedBattles = battles.filter((battle) => battle.phase === "ended");
  const activeHtml = activeBattles.map(renderBattleDirectoryCard).join("");
  const endedHtml = endedBattles.length ? `
    <details class="ended-battle-section">
      <summary>已结束无名战（${endedBattles.length}）</summary>
      <div class="battle-directory ended-battle-list">
        ${endedBattles.map(renderBattleDirectoryCard).join("")}
      </div>
    </details>
  ` : "";
  return `${activeHtml}${endedHtml}`;
}

async function setupBattleDetailPage() {
  const title = document.querySelector("#battleTitle");
  if (!title) return;
  const id = new URLSearchParams(location.search).get("id");
  currentBattleId = id || "";
  const area = document.querySelector("#battleSubmissionArea");
  if (!id) {
    title.textContent = "无名战不存在";
    area.innerHTML = errorText("缺少无名战 ID。");
    return;
  }
  try {
    const payload = await requestJson(`/api/battles/${encodeURIComponent(id)}`, { headers: authHeaders() });
    const battle = payload.battle;
    document.title = `${battle.title} - Arcaea Anonymous Battles`;
    title.textContent = battle.title;
    document.querySelector("#battlePhase").textContent = battle.phaseLabel;
    document.querySelector("#battleDescription").textContent = battle.description || "暂无简介。";
    document.querySelector("#battleHero").style.backgroundImage = `linear-gradient(90deg, rgba(20,54,67,.88), rgba(20,54,67,.5)), url("${battle.bannerUrl}")`;
    renderBattleHeroTools(battle);
    renderBattlePhaseContent(battle, payload.submissions || [], payload.canDownload);
    setupHostBattlePanel(battle);
  } catch (error) {
    title.textContent = "加载失败";
    area.innerHTML = errorText(error.message);
  }
}

function renderBattleHeroTools(battle) {
  const limitBox = document.querySelector("#battleHeroLimit");
  const rulesButton = document.querySelector("#downloadRulesButton");
  const hero = document.querySelector("#battleHero");
  if (limitBox) {
    const restriction = battle.allowedGroupNames?.length ? battle.allowedGroupNames.map((name) => `［${escapeHtml(name)}］`).join("，") : "无限制";
    const optional = renderOptionalCheckLine(battle);
    const divisions = battleDivisionOptions(battle);
    limitBox.innerHTML = `<strong>投稿数量限制</strong><span>${divisions.map(renderDivisionLimitPart).join(" / ")}</span><strong>参与限制</strong><span>${restriction}</span>${optional}`;
  }
  if (!rulesButton) return;
  rulesButton.disabled = !battle.canDownloadRules || battle.phase === "upcoming";
  rulesButton.title = battle.phase === "upcoming" ? "无名战尚未开始" : "";
  rulesButton.onclick = () => downloadBattleRules(battle.id);
  const actions = hero?.querySelector(".battle-hero-actions");
  actions?.querySelector(".battle-hosts-badge")?.remove();
  const visibleHosts = (battle.hosts || []).filter((host) => host.role !== "admin");
  if (visibleHosts.length) {
    actions?.insertAdjacentHTML("beforeend", `
      <div class="battle-hosts-badge">
        <span>主催</span>
        ${visibleHosts.map((host) => `<a href="/user.html?id=${encodeURIComponent(host.id)}" title="${escapeAttr(host.chartName)}"><img src="${escapeHtml(host.avatarUrl)}" alt="${escapeHtml(host.chartName)}头像"><strong>${escapeHtml(host.chartName)}</strong></a>`).join("")}
      </div>
    `);
  }
}

function renderDivisionLimitPart(division) {
  return `<span class="division-limit-part" title="${escapeAttr(customDivisionTooltip(division))}">${escapeHtml(division.name)}</span> - ${formatLimit(division.limit)}`;
}

function renderOptionalCheckLine(battle) {
  const checks = battle.optionalCheckDetails || (battle.optionalCheckDescriptions || []).map((label) => ({ label, description: "" }));
  const ordered = checks.slice().sort((a, b) => Number(a.type !== "bonusExcluded") - Number(b.type !== "bonusExcluded"));
  return ordered.length ? `<div class="optional-check-line">${ordered.map(renderOptionalCheckText).join(`<span class="optional-check-separator">；</span>`)}</div>` : "";
}

function renderOptionalCheckText(item) {
  const bonusExcluded = item.type === "bonusExcluded";
  const description = `${item.description || ""}${bonusExcluded ? `${item.description ? " " : ""}Bonus谱面不会应用该项检查` : ""}`;
  return `<span class="optional-check-text ${bonusExcluded ? "bonus-excluded-check" : ""}" title="${escapeAttr(description)}">${escapeHtml(item.label)}</span>`;
}

function renderBattlePhaseContent(battle, submissions, canDownload) {
  const statusTitle = document.querySelector("#battleStatusTitle");
  const countdown = document.querySelector("#battleCountdown");
  const actionBar = document.querySelector("#battleActionBar");
  const area = document.querySelector("#battleSubmissionArea");
  updateBattleCountdown(battle);
  renderBattlePhaseTimes(battle);
  actionBar.innerHTML = "";
  const countText = battle.countLabel ? `<p class="battle-count">${escapeHtml(battle.countLabel)}：${Number(battle.submissionCount || 0)}</p>` : "";
  if (battle.phase === "upcoming") {
    statusTitle.textContent = "你来的真早！当前无名战还未开始";
    area.innerHTML = "";
    return;
  }
  if (battle.phase === "writing") {
    statusTitle.textContent = "当前无名战正在写谱阶段";
    actionBar.innerHTML = `<a class="primary-link compact" href="/submit.html?battleId=${encodeURIComponent(battle.id)}">提交谱面</a>`;
    area.innerHTML = countText;
    return;
  }
  if (battle.phase === "packing") {
    statusTitle.textContent = "当前无名战正在整理打包";
    area.innerHTML = countText;
    return;
  }
  statusTitle.textContent = battle.phase === "sniping" ? "当前无名战正在狙击阶段" : "无名战已结束";
  if (canDownload) {
    const disabled = Number(battle.finalSubmissionCount || 0) <= 0 ? "disabled title=\"暂无可下载谱面\"" : "";
    actionBar.innerHTML = `<button type="button" ${disabled} onclick="downloadBattleArchive('${escapeAttr(battle.id)}')">打包下载</button>`;
  }
  area.innerHTML = `${countText}${submissions.length
    ? `<div class="submission-list">${submissions.map((item) => renderBattleSubmission(item, battle, canDownload)).join("")}</div>`
    : `<div class="empty-battle-art"><img src="/assets/empty-battle-placeholder.png" alt="暂无谱面">${battle.phase === "ended" ? "<p>没有谱面</p>" : ""}</div>`}`;
}

function updateBattleCountdown(battle) {
  const countdown = document.querySelector("#battleCountdown");
  if (!countdown) return;
  window.clearTimeout(battleCountdownTimer);
  if (battle.phase === "ended") {
    countdown.textContent = "";
    return;
  }
  const label = battle.phase === "upcoming" ? "距离无名战开始" : "距离当前阶段结束";
  countdown.textContent = `${label}：${formatCountdown(battle.phaseEndsAt)}`;
  const delay = countdownRefreshDelay(new Date(battle.phaseEndsAt).getTime() - Date.now());
  battleCountdownTimer = window.setTimeout(() => {
    const remaining = new Date(battle.phaseEndsAt).getTime() - Date.now();
    if (remaining <= 0) setupBattleDetailPage();
    else updateBattleCountdown(battle);
  }, delay);
}

function renderBattlePhaseTimes(battle) {
  const container = document.querySelector("#battlePhaseTimes");
  if (!container) return;
  const phases = [
    { label: "写谱阶段", start: battle.writingStartTime, end: battle.writingEndTime, key: "writing" },
    { label: "整理阶段", start: battle.packingStartTime, end: battle.packingEndTime, key: "packing" },
    { label: "狙击阶段", start: battle.snipingStartTime, end: battle.snipingEndTime, key: "sniping" }
  ];
  container.innerHTML = phases.map((phase) => `
    <article class="phase-time-item ${battle.phase === phase.key ? "current" : ""}">
      <strong>${phase.label}</strong>
      <span>${formatDate(phase.start)}</span>
      <small>至</small>
      <span>${formatDate(phase.end)}</span>
    </article>
  `).join("");
}

function setupHostBattlePanel(battle) {
  const actionBar = document.querySelector("#battleActionBar");
  if (!actionBar) return;
  const canOpen = battle.canHost && battle.phase !== "ended";
  if (!canOpen) return;
  actionBar.insertAdjacentHTML("beforeend", `<a class="primary-link compact" href="/host.html?id=${encodeURIComponent(battle.id)}#review">主催后台</a>`);
}

async function setupHostPage() {
  const title = document.querySelector("#hostBattleTitle");
  if (!title) return;
  const id = new URLSearchParams(location.search).get("id");
  currentBattleId = id || "";
  const dashboard = document.querySelector("#hostSettingsPanel");
  const hostPanels = [dashboard, document.querySelector("#hostReviewPanel"), document.querySelector("#hostSubmissionPanel")];
  const archiveButton = document.querySelector("#hostDownloadArchiveButton");
  if (!id) {
    title.textContent = "主催后台不可用";
    hostPanels.forEach((panel) => panel?.classList.add("hidden"));
    setMessage("#hostPageMessage", "缺少无名战 ID。", "error");
    return;
  }
  try {
    const payload = await requestJson(`/api/battles/${encodeURIComponent(id)}`, { headers: authHeaders() });
    const battle = payload.battle;
    if (!battle.canHost || battle.phase === "ended") {
      hostPanels.forEach((panel) => panel?.classList.add("hidden"));
      archiveButton?.classList.add("hidden");
      title.textContent = "主催后台不可用";
      setMessage("#hostPageMessage", "当前账号没有该无名战的主催权限，或该无名战已经结束。", "error");
      return;
    }
    document.title = `${battle.title} 主催后台 - Arcaea Anonymous Battles`;
    hostPanels.forEach((panel) => panel?.classList.remove("hidden"));
    archiveButton?.classList.remove("hidden");
    setArchiveButtonState(archiveButton, Number(battle.finalSubmissionCount || 0) > 0);
    title.textContent = `${battle.title} 主催后台`;
    document.querySelector("#hostBattleDescription").textContent = battle.description || "暂无简介。";
    document.querySelector("#hostHero").style.backgroundImage = `linear-gradient(90deg, rgba(20,54,67,.88), rgba(20,54,67,.5)), url("${battle.bannerUrl}")`;
    document.querySelector("#hostBattleLink")?.setAttribute("href", `/battle.html?id=${encodeURIComponent(battle.id)}`);
    archiveButton?.addEventListener("click", downloadHostBattleArchive);
    fillHostLimitForm(battle);
    setupCustomDivisionEditor("host");
    setupHostLimitForm();
    await Promise.all([loadHostReviewSubmissions(), loadHostSubmissions()]);
    if (location.hash === "#review") document.querySelector("#hostReviewPanel")?.scrollIntoView({ block: "start" });
  } catch (error) {
    hostPanels.forEach((panel) => panel?.classList.add("hidden"));
    archiveButton?.classList.add("hidden");
    title.textContent = "主催后台加载失败";
    setMessage("#hostPageMessage", error.message, "error");
  }
}

function setArchiveButtonState(button, enabled) {
  if (!button) return;
  button.disabled = !enabled;
  button.title = enabled ? "" : "暂无可下载谱面";
}

function setupHostRulesForm() {
  const form = document.querySelector("#hostRulesForm");
  if (!form || form.dataset.ready) return;
  form.dataset.ready = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await requestJson(`/api/host/battles/${encodeURIComponent(currentBattleId)}/rules`, {
        method: "POST",
        headers: authHeaders(),
        body: new FormData(form)
      });
      form.reset();
      setMessage("#hostRulesMessage", "规则文档已上传。", "success");
      await setupBattleDetailPage();
    } catch (error) {
      setMessage("#hostRulesMessage", error.message, "error");
    }
  });
}

function fillHostLimitForm(battle) {
  const form = document.querySelector("#hostLimitForm");
  if (!form) return;
  const limits = battle.submissionLimits || {};
  const checks = battle.optionalChecks || {};
  const locks = battle.settingLocks || {};
  if (form.description) form.description.value = battle.description || "";
  if (form.banner) form.banner.value = "";
  if (form.writingStartTime) form.writingStartTime.value = toDatetimeLocal(battle.writingStartTime);
  if (form.writingEndTime) form.writingEndTime.value = toDatetimeLocal(battle.writingEndTime);
  if (form.packingStartTime) form.packingStartTime.value = toDatetimeLocal(battle.packingStartTime);
  if (form.packingEndTime) form.packingEndTime.value = toDatetimeLocal(battle.packingEndTime);
  if (form.snipingStartTime) form.snipingStartTime.value = toDatetimeLocal(battle.snipingStartTime);
  if (form.snipingEndTime) form.snipingEndTime.value = toDatetimeLocal(battle.snipingEndTime);
  form.soloLimit.value = limits.solo ?? "";
  form.collabLimit.value = limits.collab ?? "";
  form.bonusLimit.value = limits.bonus ?? "";
  form.durationEnabled.checked = Boolean(checks.duration?.enabled);
  form.durationMin.value = checks.duration?.min ?? "";
  form.durationMax.value = checks.duration?.max ?? "";
  if (form.difficultyEnabled) form.difficultyEnabled.checked = Boolean(checks.difficulty?.enabled);
  if (form.difficultyMin) form.difficultyMin.value = checks.difficulty?.min ?? "";
  if (form.difficultyMax) form.difficultyMax.value = checks.difficulty?.max ?? "";
  form.noEternal.checked = Boolean(checks.noEternal);
  if (form.affTypeCheck) form.affTypeCheck.checked = Boolean(checks.affTypeCheck);
  if (form.aafAccNormalize) form.aafAccNormalize.checked = Boolean(checks.aafAccNormalize);
  fillAffSyntaxInputs(form, checks.affSyntax || {});
  form.dataset.currentDescription = battle.description || "";
  fillDivisionSettings(form, battle, "host");
  syncBattlePhaseTimeFields(form);
  applyHostSettingLocks(form, battle.settingLocks || {});
}

function fillAffSyntaxInputs(form, affSyntax) {
  Object.entries(AFF_SYNTAX_FIELD_MAP).forEach(([inputName, key]) => {
    if (form.elements[inputName]) form.elements[inputName].checked = Boolean(affSyntax[key]);
  });
}

function applyHostSettingLocks(form, locks) {
  const setDisabled = (names, disabled) => {
    names.forEach((name) => {
      const field = form.elements[name];
      if (field) field.disabled = disabled;
    });
  };
  setDisabled(["description"], Boolean(locks.description));
  setDisabled(["banner"], Boolean(locks.banner));
  setDisabled(["rules"], Boolean(locks.rules));
  setDisabled(["durationEnabled", "durationMin", "durationMax"], optionalCheckLocked(locks, "duration"));
  setDisabled(["difficultyEnabled", "difficultyMin", "difficultyMax"], optionalCheckLocked(locks, "difficulty"));
  setDisabled(["noEternal"], optionalCheckLocked(locks, "noEternal"));
  setDisabled(["affTypeCheck"], optionalCheckLocked(locks, "affTypeCheck"));
  setDisabled(Object.keys(AFF_SYNTAX_FIELD_MAP), optionalCheckLocked(locks, "affTypeCheck"));
  setDisabled(["aafAccNormalize"], optionalCheckLocked(locks, "aafAccNormalize"));
  ["description", "banner", "rules", "durationEnabled", "difficultyEnabled", "noEternal", "affTypeCheck", "aafAccNormalize", ...Object.keys(AFF_SYNTAX_FIELD_MAP)].forEach((name) => {
    const label = form.elements[name]?.closest("label");
    label?.classList.toggle("locked-field", Boolean(locks.description && name === "description") || Boolean(locks.banner && name === "banner") || Boolean(locks.rules && name === "rules") || optionalLockByInputName(locks, name));
  });
}

function optionalCheckLocked(locks, key) {
  const optional = locks?.optionalChecks;
  if (optional === true) return true;
  return Boolean(optional && typeof optional === "object" && optional[key]);
}

function optionalLockByInputName(locks, name) {
  const map = {
    durationEnabled: "duration",
    difficultyEnabled: "difficulty",
    noEternal: "noEternal",
    affTypeCheck: "affTypeCheck",
    aafAccNormalize: "aafAccNormalize"
  };
  if (AFF_SYNTAX_FIELD_MAP[name]) return optionalCheckLocked(locks, "affTypeCheck");
  return map[name] ? optionalCheckLocked(locks, map[name]) : false;
}

function setupHostLimitForm() {
  const form = document.querySelector("#hostLimitForm");
  if (!form || form.dataset.ready) return;
  form.dataset.ready = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    syncCustomDivisionInput("host");
    syncBattlePhaseTimeFields(form);
    const data = Object.fromEntries(new FormData(form));
    delete data.rules;
    delete data.banner;
    try {
      await requestJson(`/api/host/battles/${encodeURIComponent(currentBattleId)}/limits`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(data)
      });
      if (form.rules?.files?.[0]) {
        const rulesData = new FormData();
        rulesData.append("rules", form.rules.files[0]);
        await requestJson(`/api/host/battles/${encodeURIComponent(currentBattleId)}/rules`, {
          method: "POST",
          headers: authHeaders(),
          body: rulesData
        });
        form.rules.value = "";
      }
      const settingsData = new FormData();
      ["description", "writingStartTime", "writingEndTime", "packingStartTime", "packingEndTime", "snipingStartTime", "snipingEndTime"].forEach((name) => {
        if (form.elements[name]) settingsData.append(name, form.elements[name].disabled && name === "description" ? form.dataset.currentDescription || "" : form.elements[name].value);
      });
      if (form.banner?.files?.[0]) settingsData.append("banner", form.banner.files[0]);
      await requestJson(`/api/host/battles/${encodeURIComponent(currentBattleId)}/settings`, {
        method: "POST",
        headers: authHeaders(),
        body: settingsData
      });
  if (form.banner) form.banner.value = "";
      setMessage("#hostLimitMessage", "无名战设置已保存。", "success");
      if (document.querySelector("#hostBattleTitle")) await setupHostPage();
      else await setupBattleDetailPage();
    } catch (error) {
      setMessage("#hostLimitMessage", error.message, "error");
    }
  });
}

function setupCustomDivisionEditor(prefix) {
  const form = prefix === "host" ? document.querySelector("#hostLimitForm") : document.querySelector("#battleForm");
  const editor = document.querySelector(`#${prefix}CustomDivisionEditor`);
  const addButton = document.querySelector(`#${prefix}AddCustomDivisionButton`);
  if (!form || !editor || editor.dataset.ready) return;
  editor.dataset.ready = "true";
  prepareBattleSettingsForm(form);
  setupBattlePhaseTimeSync(form);
  form.querySelectorAll("input[name='divisionMode']").forEach((input) => {
    input.addEventListener("change", () => {
      renderCustomDivisionEditor(prefix);
      updateBattleSettingsVisibility(form);
    });
  });
  ["durationEnabled", "difficultyEnabled"].forEach((name) => {
    form.elements[name]?.addEventListener("change", () => updateBattleSettingsVisibility(form));
  });
  addButton?.addEventListener("click", () => {
    const divisions = readCustomDivisionEditor(prefix);
    divisions.push({ id: `custom_${Date.now()}`, name: "", description: "", canCollaborate: false, collaborationMode: "none", limit: "" });
    renderCustomDivisionEditor(prefix, divisions);
  });
  renderCustomDivisionEditor(prefix);
  updateBattleSettingsVisibility(form);
}

function prepareBattleSettingsForm(form) {
  const divisionFieldset = form.querySelector("input[name='divisionMode']")?.closest("fieldset");
  const limitFieldset = standardLimitContainer(form);
  const bonusExcludedFieldset = form.durationEnabled?.closest("fieldset");
  const optionalFieldset = form.noEternal?.closest("fieldset");
  limitFieldset?.classList.add("standard-limit-fieldset");
  bonusExcludedFieldset?.classList.add("optional-check-fieldset", "bonus-excluded-fieldset");
  optionalFieldset?.classList.add("optional-check-fieldset");
  if (divisionFieldset && form.firstElementChild !== divisionFieldset) {
    form.prepend(divisionFieldset);
  }
  if (divisionFieldset && limitFieldset && divisionFieldset.nextElementSibling !== limitFieldset) {
    divisionFieldset.after(limitFieldset);
  }
  addOptionalCheckHelp(form, "durationEnabled", "参赛谱面的曲目时长需要在此区间内（误差不超过1s）。");
  addOptionalCheckHelp(form, "difficultyEnabled", "参赛谱面的难度需要在此区间内。");
  addOptionalCheckHelp(form, "noEternal", "参赛谱面的难度不得为Eternal。");
  addOptionalCheckHelp(form, "affTypeCheck", "参赛谱面中部分AFF语句不能使用，详情请查看规则文档");
  addOptionalCheckHelp(form, "aafAccNormalize", "AAF / ACC标准化检查");
}

function setupBattlePhaseTimeSync(form) {
  if (!form || form.dataset.phaseTimeSyncReady) return;
  form.dataset.phaseTimeSyncReady = "true";
  const packingStart = form.elements.packingStartTime;
  const snipingStart = form.elements.snipingStartTime;
  [packingStart, snipingStart].forEach((field) => {
    if (!field) return;
    field.readOnly = true;
    field.classList.add("readonly-time");
    field.title = field === packingStart ? "整理开始时间自动等于写谱结束时间" : "狙击开始时间自动等于整理结束时间";
  });
  const sync = () => syncBattlePhaseTimeFields(form);
  ["writingStartTime", "writingEndTime", "packingEndTime"].forEach((name) => form.elements[name]?.addEventListener("input", sync));
  ["writingStartTime", "writingEndTime", "packingEndTime"].forEach((name) => form.elements[name]?.addEventListener("change", sync));
  sync();
}

function syncBattlePhaseTimeFields(form) {
  if (!form) return;
  const writingEnd = form.elements.writingEndTime;
  const packingStart = form.elements.packingStartTime;
  const packingEnd = form.elements.packingEndTime;
  const snipingStart = form.elements.snipingStartTime;
  const snipingEnd = form.elements.snipingEndTime;
  if (form.elements.writingStartTime && writingEnd) {
    writingEnd.min = form.elements.writingStartTime.value || "";
  }
  if (form.elements.writingStartTime?.value && writingEnd?.value && writingEnd.value < form.elements.writingStartTime.value) {
    writingEnd.value = form.elements.writingStartTime.value;
  }
  if (packingStart && writingEnd) {
    packingStart.value = writingEnd.value;
    if (packingEnd) packingEnd.min = writingEnd.value || "";
  }
  if (writingEnd?.value && packingEnd?.value && packingEnd.value < writingEnd.value) {
    packingEnd.value = writingEnd.value;
  }
  if (snipingStart && packingEnd) {
    snipingStart.value = packingEnd.value;
    if (snipingEnd) snipingEnd.min = packingEnd.value || "";
  }
  if (packingEnd?.value && snipingEnd?.value && snipingEnd.value < packingEnd.value) {
    snipingEnd.value = packingEnd.value;
  }
}

function addOptionalCheckHelp(form, inputName, text) {
  const label = form.elements[inputName]?.closest("label");
  if (!label) return;
  label.querySelector(".help-icon")?.remove();
  label.title = text;
  label.classList.add("has-help");
}

function updateBattleSettingsVisibility(form) {
  const standardMode = new FormData(form).get("divisionMode") !== "custom";
  const limitContainer = standardLimitContainer(form);
  limitContainer?.classList.toggle("hidden", !standardMode);
  limitContainer?.querySelectorAll("input, select, textarea").forEach((field) => {
    field.disabled = !standardMode;
  });
  form.durationMin?.closest(".form-row")?.classList.toggle("hidden", !form.durationEnabled?.checked);
  form.difficultyMin?.closest(".form-row")?.classList.toggle("hidden", !form.difficultyEnabled?.checked);
}

function standardLimitContainer(form) {
  return form.soloLimit?.closest("fieldset") || form.soloLimit?.closest(".form-row");
}

function fillDivisionSettings(form, battle, prefix) {
  if (!form) return;
  const mode = battle.divisionMode === "custom" ? "custom" : "standard";
  form.querySelectorAll("input[name='divisionMode']").forEach((input) => {
    input.checked = input.value === mode;
  });
  const hidden = document.querySelector(`#${prefix}CustomDivisions`);
  if (hidden) hidden.value = JSON.stringify(battle.customDivisions || []);
  renderCustomDivisionEditor(prefix, battle.customDivisions || []);
  updateBattleSettingsVisibility(form);
}

function renderCustomDivisionEditor(prefix, divisions = null) {
  const form = prefix === "host" ? document.querySelector("#hostLimitForm") : document.querySelector("#battleForm");
  const editor = document.querySelector(`#${prefix}CustomDivisionEditor`);
  const addButton = document.querySelector(`#${prefix}AddCustomDivisionButton`);
  if (!form || !editor) return;
  const customMode = new FormData(form).get("divisionMode") === "custom";
  editor.classList.toggle("hidden", !customMode);
  addButton?.classList.toggle("hidden", !customMode);
  const values = divisions || readCustomDivisionEditor(prefix);
  if (!customMode) return;
  editor.innerHTML = values.map((division, index) => {
    const canCollaborate = Boolean(division.canCollaborate);
    const mode = division.collaborationMode === "multi" ? "multi" : "duo";
    const requiresCollaborator = Number(division.minCollaborators || 0) > 0;
    return `<article class="custom-division-row" data-index="${index}" data-id="${escapeAttr(division.id || `custom_${index}`)}">
      <div class="form-row">
        <label>分组名<input data-field="name" value="${escapeAttr(division.name || "")}" required></label>
        <label>投稿上限<input data-field="limit" type="number" min="0" value="${escapeAttr(division.limit ?? "")}" placeholder="无限制"></label>
      </div>
      <label>简介<textarea data-field="description" rows="2">${escapeHtml(division.description || "")}</textarea></label>
      <label class="checkbox-row"><input data-field="canCollaborate" type="checkbox" ${canCollaborate ? "checked" : ""}>可以合作</label>
      <div class="radio-row ${canCollaborate ? "" : "hidden"}" data-collab-mode>
        <label><input type="radio" data-field="collaborationMode" name="${prefix}CollabMode${index}" value="duo" ${mode === "duo" ? "checked" : ""}>双人合作</label>
        <label><input type="radio" data-field="collaborationMode" name="${prefix}CollabMode${index}" value="multi" ${mode === "multi" ? "checked" : ""}>允许多人合作</label>
      </div>
      <label class="checkbox-row ${canCollaborate ? "" : "hidden"}" data-min-collab><input data-field="minCollaborators" type="checkbox" ${requiresCollaborator ? "checked" : ""}>至少双人合作</label>
      <button class="danger-button compact" type="button" onclick="removeCustomDivision('${prefix}', ${index})">删除分组</button>
    </article>`;
  }).join("");
  editor.querySelectorAll("input, textarea").forEach((input) => {
    input.addEventListener("input", () => syncCustomDivisionInput(prefix));
    input.addEventListener("change", () => {
      if (input.dataset.field === "canCollaborate") renderCustomDivisionEditor(prefix, readCustomDivisionEditor(prefix));
      syncCustomDivisionInput(prefix);
    });
  });
  syncCustomDivisionInput(prefix);
}

function readCustomDivisionEditor(prefix) {
  const hidden = document.querySelector(`#${prefix}CustomDivisions`);
  const editor = document.querySelector(`#${prefix}CustomDivisionEditor`);
  if (editor && !editor.classList.contains("hidden") && editor.children.length) {
    return Array.from(editor.querySelectorAll(".custom-division-row")).map((row, index) => {
      const canCollaborate = row.querySelector('[data-field="canCollaborate"]')?.checked || false;
      return {
        id: row.dataset.id || `custom_${index}`,
        name: row.querySelector('[data-field="name"]')?.value || "",
        description: row.querySelector('[data-field="description"]')?.value || "",
        limit: row.querySelector('[data-field="limit"]')?.value || "",
        canCollaborate,
        collaborationMode: canCollaborate ? (row.querySelector('[data-field="collaborationMode"]:checked')?.value || "duo") : "none",
        minCollaborators: canCollaborate && row.querySelector('[data-field="minCollaborators"]')?.checked ? 1 : 0
      };
    });
  }
  return parseSafeJsonArray(hidden?.value);
}

function syncCustomDivisionInput(prefix) {
  const hidden = document.querySelector(`#${prefix}CustomDivisions`);
  if (hidden) hidden.value = JSON.stringify(readCustomDivisionEditor(prefix));
}

function removeCustomDivision(prefix, index) {
  const divisions = readCustomDivisionEditor(prefix);
  divisions.splice(index, 1);
  renderCustomDivisionEditor(prefix, divisions);
}

function renderBattleDirectoryCard(battle) {
  return `<a class="battle-card" href="/battle.html?id=${encodeURIComponent(battle.id)}"><img src="${escapeHtml(battle.bannerUrl)}" alt="${escapeHtml(battle.title)} banner"><div><span class="status ${escapeAttr(battle.phase)}">${escapeHtml(battle.phaseLabel)}</span><strong>${escapeHtml(battle.title)}</strong><p>${escapeHtml(battle.description || "暂无简介。")}</p><small>${formatDate(battle.writingStartTime)} - ${formatDate(battle.snipingEndTime)}</small></div></a>`;
}

function renderBattleSubmission(submission, battle, canDownload) {
  const mapper = battle.phase === "ended" && submission.chartName ? `谱师：${escapeHtml(submission.chartName)}` : "";
  const collaborators = battle.phase === "ended" && submission.collaborators?.length ? `<span>合作：${submission.collaborators.map((item) => escapeHtml(item.chartName)).join("、")}</span>` : "";
  const download = canDownload ? `<a href="#" onclick="downloadBattleSubmission(event, '${escapeAttr(battle.id)}', '${escapeAttr(submission.id)}')">下载</a>` : `<span class="disabled-file-link">无下载权限</span>`;
  return `<article class="submission-item battle-submission-item"><img class="chart-thumb" src="${escapeHtml(submission.thumbnailUrl)}" alt="${escapeHtml(submission.songTitle || submission.songId)} 封面"><div><div class="item-top"><strong>${escapeHtml(submission.songTitle || submission.songId)} - ${escapeHtml(submission.songArtist || "未知")}</strong><span>${submissionDivisionLabel(submission)}</span></div><div class="submission-meta"><span>${escapeHtml(submission.songId)}</span>${mapper ? `<span>${mapper}</span>` : ""}${collaborators}<span>${formatBytes(submission.fileSize)}</span>${download}</div></div></article>`;
}

async function downloadBattleArchive(id) {
  await downloadBlob(`/api/battles/${encodeURIComponent(id)}/download-approved`, "battle-charts.zip");
}

async function downloadBattleSubmission(event, battleId, submissionId) {
  event.preventDefault();
  await downloadBlob(`/api/battles/${encodeURIComponent(battleId)}/submissions/${encodeURIComponent(submissionId)}/download`, "chart.zip");
}

async function downloadBattleRules(battleId) {
  const response = await fetch(`/api/battles/${encodeURIComponent(battleId)}/rules`, { headers: authHeaders() });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "下载失败" }));
    showInfoModal("提示", [payload.error || "下载失败"]);
    return;
  }
  await saveBlobResponse(response, "rules.pdf");
}

async function loadHostSubmissions() {
  const list = document.querySelector("#hostSubmissionList");
  if (!list || !currentBattleId) return;
  list.innerHTML = loadingText();
  try {
    const payload = await requestJson(`/api/host/battles/${encodeURIComponent(currentBattleId)}/submissions?status=approved`, { headers: authHeaders() });
    list.innerHTML = payload.submissions.length ? payload.submissions.map(renderHostSubmission).join("") : emptyText("暂无提交谱面。");
  } catch (error) {
    list.innerHTML = errorText(error.message);
  }
}

async function loadHostReviewSubmissions() {
  const list = document.querySelector("#hostReviewSubmissionList");
  if (!list || !currentBattleId) return;
  list.innerHTML = loadingText();
  try {
    const payload = await requestJson(`/api/host/battles/${encodeURIComponent(currentBattleId)}/submissions?status=review`, { headers: authHeaders() });
    list.innerHTML = payload.submissions.length ? payload.submissions.map(renderHostSubmission).join("") : emptyText("暂无待审核谱面。");
  } catch (error) {
    list.innerHTML = errorText(error.message);
  }
}

function renderHostSubmission(submission) {
  const reviewControls = ["pending", "waiting_collaboration"].includes(submission.status)
    ? `<div class="review-actions"><input placeholder="驳回时必填审核意见" data-host-note="${escapeAttr(submission.id)}"><button type="button" onclick="reviewHostSubmission('${escapeAttr(submission.id)}', 'approved')">通过</button><button type="button" class="danger-button" onclick="reviewHostSubmission('${escapeAttr(submission.id)}', 'rejected')">驳回</button></div>`
    : "";
  const fileLink = submission.fileDeleted || !submission.fileUrl
    ? `<span class="disabled-file-link" aria-disabled="true">下载文件</span>`
    : `<a href="#" onclick="downloadHostSubmission(event, '${escapeAttr(submission.id)}')">下载文件</a>`;
  return `<article class="submission-item"><div class="item-top"><strong>${escapeHtml(submission.songId)}</strong><span class="status ${escapeAttr(submission.status)}">${statusLabel(submission.status)}</span></div><div class="submission-meta"><span>谱师：${escapeHtml(submission.chartName)}</span><span>组别：${submissionDivisionLabel(submission)}</span><span>文件：${escapeHtml(submission.originalFileName || "无文件名")}</span><span>提交：${formatDate(submission.createdAt)}</span>${fileLink}</div>${submission.collaborators?.length ? `<p class="note">合作对象：${submission.collaborators.map((item) => `${escapeHtml(item.chartName)}（${collaboratorStatusLabel(item.status)}）`).join("、")}</p>` : ""}${submission.reviewNote && submission.status !== "approved" ? `<p class="note">审核意见：${escapeHtml(submission.reviewNote)}</p>` : ""}${reviewControls}</article>`;
}

async function reviewHostSubmission(id, status) {
  const note = document.querySelector(`[data-host-note="${id}"]`)?.value || "";
  if (status === "rejected" && !note.trim()) {
    alert("驳回谱面时需要填写审核意见");
    return;
  }
  await requestJson(`/api/host/battles/${encodeURIComponent(currentBattleId)}/submissions/${encodeURIComponent(id)}/review`, { method: "PATCH", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ status, reviewNote: note }) });
  await Promise.all([loadHostReviewSubmissions(), loadHostSubmissions(), refreshAccountPopover()]);
  if (!document.querySelector("#hostBattleTitle")) await setupBattleDetailPage();
}

async function downloadHostBattleArchive() {
  const button = document.querySelector("#hostDownloadArchiveButton");
  if (button?.disabled) return;
  await downloadBlob(`/api/host/battles/${encodeURIComponent(currentBattleId)}/download`, "host-battle-charts.zip");
}

async function downloadHostSubmission(event, id) {
  event.preventDefault();
  await downloadBlob(`/api/host/battles/${encodeURIComponent(currentBattleId)}/submissions/${encodeURIComponent(id)}/download`, "chart.zip");
}

async function downloadBlob(url, fallbackName) {
  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "下载失败" }));
    alert(payload.error || "下载失败");
    return;
  }
  await saveBlobResponse(response, fallbackName);
}

async function saveBlobResponse(response, fallbackName) {
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i);
  const filename = decodeURIComponent(match?.[1] || match?.[2] || fallbackName);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}

async function setupJacketCollectionPage() {
  const form = document.querySelector("#jacketCollectionForm");
  if (!form) return;
  if (!localStorage.getItem(tokenKey)) {
    form.innerHTML = `<h2>需要登录</h2><p class="message">请登录后提交封面。</p><button class="primary-link compact" onclick="openAuthModal()" type="button">去登录</button>`;
    return;
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("#jacketCollectionMessage", "正在提交...");
    try {
      await requestJson("/api/jacket-collections", { method: "POST", headers: authHeaders(), body: new FormData(form) });
      form.reset();
      setMessage("#jacketCollectionMessage", "封面已提交。", "success");
    } catch (error) {
      setMessage("#jacketCollectionMessage", error.message, "error");
    }
  });
}

function setupTreasureChest() {
  if (document.querySelector("#treasureChest")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="treasure-zone hidden" id="treasureZone">
      <div class="treasure-effect-layer" id="treasureEffectLayer"></div>
      <button class="treasure-chest" id="treasureChest" type="button" aria-label="今日宝箱">
        <img src="/assets/treasure-chest.svg" alt="">
      </button>
    </div>
  `);
  const zone = document.querySelector("#treasureZone");
  const update = () => {
    const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 24;
    zone.classList.toggle("hidden", !nearBottom);
  };
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  update();
  document.querySelector("#treasureChest").addEventListener("click", claimTreasure);
}

async function claimTreasure() {
  if (!localStorage.getItem(tokenKey)) {
    openAuthModal();
    return;
  }
  const chest = document.querySelector("#treasureChest");
  chest.classList.remove("treasure-pop");
  void chest.offsetWidth;
  chest.classList.add("treasure-pop");
  try {
    const payload = await requestJson("/api/treasure/claim", { method: "POST", headers: authHeaders() });
    showTreasureDrop(payload.drop);
  } catch (error) {
    showTreasureCooldown(error.message);
  }
}

function showTreasureDrop(drop) {
  const layer = document.querySelector("#treasureEffectLayer");
  if (!layer || !drop) return;
  const token = ++treasureEffectToken;
  layer.innerHTML = `
    <div class="treasure-burst" aria-hidden="true">
      ${Array.from({ length: 10 }, (_, index) => `<i style="--i:${index}"></i>`).join("")}
    </div>
    <div class="treasure-float-card">
      <img src="${escapeHtml(drop.imageUrl)}" alt="${escapeHtml(drop.name)}">
      <strong>${escapeHtml(drop.name)}</strong>
    </div>
  `;
  window.setTimeout(() => {
    if (layer && token === treasureEffectToken) layer.innerHTML = "";
  }, 3200);
}

function showTreasureCooldown(message) {
  const layer = document.querySelector("#treasureEffectLayer");
  if (!layer) return;
  const token = ++treasureEffectToken;
  layer.innerHTML = `<div class="treasure-cooldown">${escapeHtml(message)}</div>`;
  window.setTimeout(() => {
    if (layer && token === treasureEffectToken) layer.innerHTML = "";
  }, 2200);
}

async function setupSubmissionPage() {
  const form = document.querySelector("#submissionForm");
  if (!form) return;
  editingSubmissionId = new URLSearchParams(location.search).get("id") || "";
  const user = getStoredUser();
  const loginRequired = document.querySelector("#loginRequired");
  const noBattle = document.querySelector("#noBattleNotice");
  if (!user || user.role !== "user") {
    form.classList.add("hidden");
    noBattle.classList.add("hidden");
    loginRequired.classList.remove("hidden");
    return;
  }
  loginRequired.classList.add("hidden");
  await Promise.all([loadMappers(), loadActiveBattles()]);
  if (!activeBattles.length) {
    form.classList.add("hidden");
    noBattle.classList.remove("hidden");
    return;
  }
  noBattle.classList.add("hidden");
  form.classList.remove("hidden");
  fillBattleSelect();
  renderSubmitDivisionOptions();
  const params = new URLSearchParams(location.search);
  const presetBattleId = params.get("battleId");
  if (presetBattleId && activeBattles.some((battle) => battle.id === presetBattleId)) {
    form.battleId.value = presetBattleId;
    renderSubmitDivisionOptions();
  }
  const presetDivision = params.get("division");
  const presetDivisionInput = Array.from(form.querySelectorAll("input[name='division']")).find((input) => input.value === presetDivision);
  if (presetDivisionInput) presetDivisionInput.checked = true;
  if (params.get("songId")) form.songId.value = params.get("songId");
  fillCollaboratorSelects();
  setupDivisionControls();
  updateSubmitBattleLimitInfo();
  document.querySelector("#battleSelect")?.addEventListener("change", () => {
    bonusCollaboratorIds = [];
    renderSubmitDivisionOptions();
    fillCollaboratorSelects();
    setupDivisionControls();
    updateSubmitBattleLimitInfo();
  });
  if (editingSubmissionId) await loadSubmissionForEdit(editingSubmissionId);
  if (!form.dataset.ready) {
    form.dataset.ready = "true";
    form.addEventListener("submit", submitChart);
  }
}

async function loadSubmissionForEdit(id) {
  const payload = await requestJson(`/api/submissions/${encodeURIComponent(id)}`, { headers: authHeaders() });
  const submission = payload.submission;
  if (!submission.canEdit) {
    setMessage("#submitMessage", "对应无名战已不在开放时间内，无法修改。", "error");
    return;
  }
  const form = document.querySelector("#submissionForm");
  form.battleId.value = submission.battleId;
  renderSubmitDivisionOptions();
  fillCollaboratorSelects();
  Array.from(form.querySelectorAll("input[name='division']")).find((input) => input.value === submission.division)?.click();
  form.songId.value = submission.songId;
  if (form.bonusChart) form.bonusChart.checked = Boolean(submission.bonusChart);
  form.notes.value = submission.notes || "";
  bonusCollaboratorIds = [];
  const config = battleDivisionOptions(selectedSubmitBattle()).find((item) => item.id === submission.division);
  if (config?.collaborationMode === "duo") {
    document.querySelector("#collaboratorSelect").value = submission.collaborators?.[0]?.userId || "";
  }
  if (config?.collaborationMode === "multi") {
    bonusCollaboratorIds = (submission.collaborators || []).map((item) => item.userId);
    renderBonusCollaborators();
  }
  setupDivisionControls();
  form.querySelector("button[type='submit']").textContent = "保存修改";
  setMessage("#submitMessage", "正在修改已提交谱面，保存后会重新自动检查并重新审核。");
}

async function loadActiveBattles() {
  const payload = await requestJson("/api/battles/active", { headers: authHeaders() });
  activeBattles = payload.battles || [];
}

function fillBattleSelect() {
  const select = document.querySelector("#battleSelect");
  if (!select) return;
  select.innerHTML = activeBattles.map((battle) => `<option value="${escapeAttr(battle.id)}">${escapeHtml(battle.title)}</option>`).join("");
}

function selectedSubmitBattle() {
  const form = document.querySelector("#submissionForm");
  return activeBattles.find((item) => item.id === form?.battleId.value);
}

function battleDivisionOptions(battle) {
  if (!battle) return [];
  if (battle.divisionMode === "custom") return battle.customDivisions || [];
  return [
    { id: "solo", name: "个人", canCollaborate: false, collaborationMode: "none", limit: battle.submissionLimits?.solo ?? "" },
    { id: "collab", name: "合作", canCollaborate: true, collaborationMode: "duo", limit: battle.submissionLimits?.collab ?? "" },
    { id: "bonus", name: "Bonus", canCollaborate: true, collaborationMode: "multi", limit: battle.submissionLimits?.bonus ?? "" }
  ];
}

function renderSubmitDivisionOptions() {
  const form = document.querySelector("#submissionForm");
  const row = form?.querySelector("fieldset .radio-row");
  if (!form || !row) return;
  const current = new FormData(form).get("division");
  const options = battleDivisionOptions(selectedSubmitBattle());
  row.innerHTML = options.map((division, index) => {
    const details = customDivisionTooltip(division);
    return `<label title="${escapeAttr(details)}"><input type="radio" name="division" value="${escapeAttr(division.id)}" ${division.id === current || (!current && index === 0) ? "checked" : ""}>${escapeHtml(division.name)}</label>`;
  }).join("");
  if (!row.querySelector("input:checked")) row.querySelector("input")?.setAttribute("checked", "checked");
}

function customDivisionTooltip(division) {
  const parts = [];
  if (division.description) parts.push(division.description);
  parts.push(division.canCollaborate ? "可以合作" : "不可合作");
  if (division.canCollaborate) parts.push(division.collaborationMode === "multi" ? "允许多人合作" : "双人合作");
  if (division.canCollaborate && Number(division.minCollaborators || 0) > 0) parts.push("至少双人合作");
  return parts.join("；");
}

function updateSubmitBattleLimitInfo() {
  const box = document.querySelector("#submitBattleLimitInfo");
  const form = document.querySelector("#submissionForm");
  if (!box || !form) return;
  const battle = selectedSubmitBattle();
  if (!battle) {
    box.innerHTML = "";
    return;
  }
  const counts = battle.userSubmissionCounts || {};
  const divisions = battleDivisionOptions(battle);
  box.innerHTML = `
    <strong>投稿数量限制</strong>
    ${divisions.map((division) => `<span>${escapeHtml(division.name)}：${formatCountLimit(counts[division.id], division.limit)}</span>`).join("")}
    ${renderOptionalCheckLine(battle)}
  `;
  const bonusField = document.querySelector("#bonusChartField");
  const showBonusChart = battle.divisionMode === "custom" && !divisions.some((division) => /bonus/i.test(division.name));
  bonusField?.classList.toggle("hidden", !showBonusChart);
  if (!showBonusChart && form.bonusChart) form.bonusChart.checked = false;
}

function fillCollaboratorSelects() {
  const user = getStoredUser();
  const battle = selectedSubmitBattle();
  const options = allMappers
    .filter((mapper) => mapper.id !== user?.id)
    .filter((mapper) => !battle || canMapperAccessBattle(mapper, battle))
    .map((mapper) => `<option value="${escapeAttr(mapper.id)}">${escapeHtml(mapper.chartName)}</option>`)
    .join("");
  document.querySelector("#collaboratorSelect").innerHTML = options;
  document.querySelector("#bonusCollaboratorSelect").innerHTML = options;
}

function canMapperAccessBattle(mapper, battle) {
  const groupIds = battle.allowedGroupIds || (battle.allowedGroupId ? [battle.allowedGroupId] : []);
  if (!groupIds.length) return true;
  return groupIds.some((id) => (mapper.groupIds || []).includes(id));
}

function setupDivisionControls() {
  const form = document.querySelector("#submissionForm");
  const collaboratorField = document.querySelector("#collaboratorField");
  const bonusField = document.querySelector("#bonusCollaboratorField");
  const update = () => {
    const division = new FormData(form).get("division");
    const config = battleDivisionOptions(selectedSubmitBattle()).find((item) => item.id === division);
    collaboratorField.classList.toggle("hidden", config?.collaborationMode !== "duo");
    bonusField.classList.toggle("hidden", config?.collaborationMode !== "multi");
    updateSubmitBattleLimitInfo();
  };
  form.querySelectorAll("input[name='division']").forEach((input) => {
    if (!input.dataset.ready) {
      input.dataset.ready = "true";
      input.addEventListener("change", update);
    }
  });
  const addButton = document.querySelector("#addBonusCollaboratorButton");
  if (addButton && !addButton.dataset.ready) {
    addButton.dataset.ready = "true";
    addButton.addEventListener("click", addBonusCollaborator);
  }
  update();
}

function addBonusCollaborator() {
  const select = document.querySelector("#bonusCollaboratorSelect");
  const id = select.value;
  if (!id || bonusCollaboratorIds.includes(id)) return;
  bonusCollaboratorIds.push(id);
  renderBonusCollaborators();
}

function renderBonusCollaborators() {
  const list = document.querySelector("#bonusCollaboratorList");
  if (!list) return;
  list.innerHTML = bonusCollaboratorIds.map((id) => {
    const mapper = allMappers.find((item) => item.id === id);
    return `<button type="button" class="pill-button" onclick="removeBonusCollaborator('${escapeAttr(id)}')">${escapeHtml(mapper?.chartName || id)} ×</button>`;
  }).join("");
}

function removeBonusCollaborator(id) {
  bonusCollaboratorIds = bonusCollaboratorIds.filter((item) => item !== id);
  renderBonusCollaborators();
}

async function submitChart(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const division = data.get("division");
  const config = battleDivisionOptions(selectedSubmitBattle()).find((item) => item.id === division);
  let collaborators = [];
  if (config?.collaborationMode === "duo") collaborators = [document.querySelector("#collaboratorSelect").value].filter(Boolean);
  if (config?.collaborationMode === "multi") collaborators = bonusCollaboratorIds;
  data.append("collaborators", JSON.stringify(collaborators));
  setMessage("#submitMessage", "正在提交...");
  try {
    await requestJson(editingSubmissionId ? `/api/submissions/${encodeURIComponent(editingSubmissionId)}` : "/api/submissions", {
      method: editingSubmissionId ? "PATCH" : "POST",
      headers: authHeaders(),
      body: data
    });
    form.reset();
    bonusCollaboratorIds = [];
    renderBonusCollaborators();
    const successText = editingSubmissionId ? "修改已保存，谱面已重新进入检查与审核流程。" : "谱面提交成功";
    showAutoCheckModal(true, [successText]);
    setMessage("#submitMessage", successText, "success");
  } catch (error) {
    showAutoCheckModal(false, error.autoCheckErrors?.length ? error.autoCheckErrors : [error.message]);
    setMessage("#submitMessage", error.message, "error");
  }
}

async function setupProfilePage() {
  const form = document.querySelector("#profileForm");
  if (!form) return;
  if (!localStorage.getItem(tokenKey)) {
    document.querySelector(".page-stack").innerHTML = `<section class="panel"><h2>需要登录</h2><p class="message">请登录后查看资料。</p><button class="primary-link compact" onclick="openAuthModal()" type="button">去登录</button></section>`;
    return;
  }
  await refreshProfile();
  const user = getStoredUser();
  document.querySelector("#mySubmissionList")?.closest(".panel")?.classList.toggle("hidden", user?.role === "admin");
  await loadMapperGroups();
  if (user?.role !== "admin") await loadMySubmissions();
  await loadMyChartRequests();
  await loadCollaborationRequests();
  setupProfileEditModal();
  document.querySelector("#clearProcessedCollaborationButton")?.addEventListener("click", clearProcessedCollaborationRequests);
  if (!form.dataset.ready) {
    form.dataset.ready = "true";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("#profileMessage", "正在保存...");
      try {
        const payload = await requestJson("/api/profile", { method: "POST", headers: authHeaders(), body: new FormData(form) });
        localStorage.setItem(userKey, JSON.stringify(payload.user));
        fillProfile(payload.user);
        renderSession();
        setMessage("#profileMessage", "资料已保存。", "success");
      } catch (error) {
        setMessage("#profileMessage", error.message, "error");
      }
    });
  }
  const requestForm = document.querySelector("#chartNameRequestForm");
  if (requestForm && !requestForm.dataset.ready) {
    requestForm.dataset.ready = "true";
    requestForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      setMessage("#chartRequestMessage", "正在提交申请...");
      try {
        await requestJson("/api/chart-name-requests", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(data)
        });
        event.currentTarget.reset();
        setMessage("#chartRequestMessage", "申请已提交，等待管理员审核。", "success");
        await loadMyChartRequests();
      } catch (error) {
        setMessage("#chartRequestMessage", error.message, "error");
      }
    });
  }
}

async function refreshProfile() {
  const payload = await requestJson("/api/profile", { headers: authHeaders() });
  localStorage.setItem(userKey, JSON.stringify(payload.user));
  fillProfile(payload.user);
  renderSession();
}

function fillProfile(user) {
  const form = document.querySelector("#profileForm");
  if (!form) return;
  form.username.value = user.username || "";
  form.chartName.value = user.chartName || "";
  form.bilibili.value = user.bilibili || "";
  form.bio.value = user.bio || "";
  if (form.showSubmissions) form.showSubmissions.checked = Boolean(user.showSubmissions);
  document.querySelector("#profileTitle").textContent = user.chartName || user.username;
  document.querySelector("#profileSubtitle").textContent = roleLabel(user.role);
  document.querySelector("#profileAvatar").src = user.avatarUrl || "/assets/avatar-placeholder.svg";
  document.querySelector("#visitorPreviewButton")?.classList.toggle("hidden", user.role !== "user");
  renderProfileGroups(user);
  renderHostedBattles("#profileHostedBattlePanel", "#profileHostedBattleList", user.hostedBattles || []);
}

function fillProfileGroupControls() {
  const select = document.querySelector("#profileGroupSelect");
  if (!select) return;
  select.innerHTML = allGroups.map((group) => `<option value="${escapeAttr(group.id)}">${escapeHtml(group.name)}</option>`).join("");
}

function renderProfileGroups(user = getStoredUser()) {
  const list = document.querySelector("#profileGroupList");
  if (!list || !user) return;
  const groupIds = user.groupIds || [];
  list.innerHTML = groupIds.length ? groupIds.map((id) => {
    const group = allGroups.find((item) => item.id === id);
    return `<span class="pill-button">${escapeHtml(group?.name || id)}</span>`;
  }).join("") : `<span class="message">尚未加入谱师组。</span>`;
}

function setupProfileEditModal() {
  document.querySelector("#openProfileEditButton")?.addEventListener("click", () => openModal("#profileEditModal"));
  document.querySelector("#visitorPreviewButton")?.addEventListener("click", () => {
    const user = getStoredUser();
    if (user?.id) location.href = `/user.html?id=${encodeURIComponent(user.id)}`;
  });
  document.querySelector("#closeProfileEditButton")?.addEventListener("click", () => closeModal("#profileEditModal"));
  document.querySelector("#profileEditModal")?.addEventListener("click", (event) => {
    if (event.target.id === "profileEditModal") closeModal(event.currentTarget);
  });
  document.querySelector("#openPasswordModalButton")?.addEventListener("click", () => {
    closeModal("#profileEditModal");
    openModal("#passwordModal");
  });
  document.querySelector("#closePasswordModalButton")?.addEventListener("click", () => closeModal("#passwordModal"));
  document.querySelector("#passwordModal")?.addEventListener("click", (event) => {
    if (event.target.id === "passwordModal") closeModal(event.currentTarget);
  });
  setupPasswordForm();
}

function setupPasswordForm() {
  const form = document.querySelector("#passwordForm");
  if (!form || form.dataset.ready) return;
  form.dataset.ready = "true";
  const button = form.querySelector('button[type="submit"]');
  form.addEventListener("input", () => {
    if (!button) return;
    button.dataset.confirming = "";
    button.textContent = "修改密码";
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button?.dataset.confirming !== "true") {
      if (button) {
        button.dataset.confirming = "true";
        button.textContent = "再次点击确认修改密码";
      }
      return;
    }
    const data = Object.fromEntries(new FormData(form));
    setMessage("#passwordMessage", "正在修改...");
    if (button) button.disabled = true;
    try {
      await requestJson("/api/profile/password", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(data)
      });
      form.reset();
      if (button) {
        button.dataset.confirming = "";
        button.textContent = "修改密码";
      }
      setMessage("#passwordMessage", "密码已修改。", "success");
    } catch (error) {
      setMessage("#passwordMessage", error.message, "error");
    } finally {
      if (button) button.disabled = false;
    }
  });
}
async function joinSelectedMapperGroup() {
  const id = document.querySelector("#profileGroupSelect")?.value;
  if (!id) return;
  try {
    const payload = await requestJson(`/api/my/mapper-groups/${encodeURIComponent(id)}`, { method: "POST", headers: authHeaders() });
    localStorage.setItem(userKey, JSON.stringify(payload.user));
    renderProfileGroups(payload.user);
    setMessage("#profileGroupMessage", "已加入谱师组。", "success");
  } catch (error) {
    setMessage("#profileGroupMessage", error.message, "error");
  }
}

async function leaveMapperGroup(id) {
  const payload = await requestJson(`/api/my/mapper-groups/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() });
  localStorage.setItem(userKey, JSON.stringify(payload.user));
  renderProfileGroups(payload.user);
  setMessage("#profileGroupMessage", "已退出谱师组。", "success");
}

async function loadMySubmissions() {
  const list = document.querySelector("#mySubmissionList");
  if (!list) return;
  list.innerHTML = loadingText();
  try {
    const payload = await requestJson("/api/my/submissions", { headers: authHeaders() });
    list.innerHTML = renderMySubmissionList(payload.submissions || []);
  } catch {
    list.innerHTML = errorText("我的提交加载失败。");
  }
}

async function loadMyChartRequests() {
  const list = document.querySelector("#myChartRequests");
  if (!list) return;
  try {
    const payload = await requestJson("/api/my/chart-name-requests", { headers: authHeaders() });
    list.innerHTML = payload.requests.length ? payload.requests.map(renderChartRequest).join("") : emptyText("暂无修改申请。");
  } catch {
    list.innerHTML = errorText("申请记录加载失败。");
  }
}

async function loadCollaborationRequests() {
  const list = document.querySelector("#collaborationRequestList");
  if (!list) return;
  list.innerHTML = loadingText();
  try {
    const payload = await requestJson("/api/my/collaboration-requests", { headers: authHeaders() });
    list.innerHTML = payload.requests.length ? payload.requests.map(renderCollaborationRequest).join("") : emptyText("暂无合作申请。");
  } catch {
    list.innerHTML = errorText("合作申请加载失败。");
  }
}

async function clearProcessedCollaborationRequests() {
  const payload = await requestJson("/api/my/collaboration-requests/processed", { method: "DELETE", headers: authHeaders() });
  await loadCollaborationRequests();
  setMessage("#profileGroupMessage", `已清除 ${payload.count} 条已处理合作请求。`, "success");
}

async function setupPublicUserPage() {
  const title = document.querySelector("#publicChartName");
  if (!title) return;
  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    title.textContent = "用户不存在";
    return;
  }
  try {
    const payload = await requestJson(`/api/users/${encodeURIComponent(id)}`);
    const user = payload.user;
    document.querySelector("#publicAvatar").src = user.avatarUrl || "/assets/avatar-placeholder.svg";
    title.textContent = user.chartName;
    document.title = `${user.chartName}的个人资料 - Arcaea Anonymous Battles`;
    document.querySelector("#publicBio").textContent = user.bio || "这位谱师暂未填写简介。";
    document.querySelector("#publicProfileInfo").innerHTML = `
      <div><strong>谱师名义</strong><span>${escapeHtml(user.chartName)}</span></div>
      <div><strong>Bilibili 空间</strong><span>${user.bilibili ? `<a href="${escapeHtml(user.bilibili)}" target="_blank">访问空间</a>` : "未填写"}</span></div>
      <div><strong>注册时间</strong><span>${formatDate(user.createdAt)}</span></div>
    `;
    renderHostedBattles("#publicHostedBattlePanel", "#publicHostedBattleList", user.hostedBattles || []);
    renderPublicSubmissions(payload.submissions || []);
  } catch (error) {
    title.textContent = "加载失败";
    document.querySelector("#publicBio").textContent = error.message;
  }
}

async function setupAdminPage() {
  const dashboard = document.querySelector("#adminDashboard");
  if (!dashboard) return;
  const user = getStoredUser();
  const locked = document.querySelector("#adminLocked");
  const panels = [dashboard, document.querySelector("#adminReviewPanel"), document.querySelector("#adminSubmissionPanel"), document.querySelector("#adminContentTools"), document.querySelector("#adminBattleTools"), document.querySelector("#adminGroupTools"), document.querySelector("#adminTreasureTools")];
  if (!user || user.role !== "admin") {
    locked.classList.remove("hidden");
    panels.forEach((panel) => panel?.classList.add("hidden"));
    return;
  }
  locked.classList.add("hidden");
  panels.forEach((panel) => panel?.classList.remove("hidden"));
  document.querySelector("#generateCodeButton")?.addEventListener("click", generateCode);
  document.querySelector("#clearInvalidCodesButton")?.addEventListener("click", clearInvalidCodes);
  document.querySelector("#approveAllButton")?.addEventListener("click", approveAllSubmissions);
  document.querySelector("#clearExpiredReviewButton")?.addEventListener("click", clearExpiredReviewSubmissions);
  document.querySelector("#downloadApprovedButton")?.addEventListener("click", downloadApprovedChartsWithAuth);
  document.querySelector("#adminBattleFilter")?.addEventListener("change", (event) => {
    currentAdminBattleFilter = event.target.value;
    updateAdminArchiveButton();
    loadAdminSubmissions();
    loadAdminReviewSubmissions();
  });
  setupCollectionForm();
  setupBackgroundForm();
  setupTreasureDropForm();
  setupScheduleForm();
  setupBattleForm();
  setupMapperGroupForm();
  setupAdminGroupMemberTools();
  await Promise.all([loadCodes(), loadAdminSubmissions(), loadAdminReviewSubmissions(), loadAdminChartRequests(), loadAdminCollections(), loadAdminBackgrounds(), loadAdminTreasureDrops(), loadAdminSchedules(), loadAdminBattles(), loadAdminMapperGroups(), loadAdminUsers()]);
  if (location.hash === "#review") document.querySelector("#adminReviewPanel")?.scrollIntoView({ block: "start" });
}

function renderHostedBattles(panelSelector, listSelector, battles) {
  const panel = document.querySelector(panelSelector);
  const list = document.querySelector(listSelector);
  if (!panel || !list) return;
  panel.classList.toggle("hidden", !battles.length);
  list.innerHTML = battles.length ? battles.map(renderHostedBattleCard).join("") : "";
}

function renderHostedBattleCard(battle) {
  return `<a class="battle-card" href="/battle.html?id=${encodeURIComponent(battle.id)}"><img src="${escapeHtml(battle.bannerUrl)}" alt="${escapeHtml(battle.title)} banner"><div><span class="status ${escapeAttr(battle.phase)}">${escapeHtml(battle.phaseLabel)}</span><strong>${escapeHtml(battle.title)}</strong><p>${escapeHtml(battle.description || "暂无简介。")}</p><small>${formatDate(battle.startTime)} - ${formatDate(battle.endTime)}</small></div></a>`;
}

function renderMySubmissionList(submissions) {
  if (!submissions.length) return emptyText("你还没有提交过谱面。");
  const editable = submissions.filter((submission) => submission.canEdit);
  const closed = submissions.filter((submission) => !submission.canEdit);
  const closedHtml = closed.length ? `
    <details class="ended-timeline-section">
      <summary>已截止提交的无名战投稿（${closed.length}）</summary>
      <div class="submission-list ended-timeline-list">${closed.map(renderSubmissionItem).join("")}</div>
    </details>
  ` : "";
  return `${editable.map(renderSubmissionItem).join("")}${closedHtml}`;
}

async function clearInvalidCodes() {
  const payload = await requestJson("/api/admin/register-codes/invalid", { method: "DELETE", headers: authHeaders() });
  setMessage("#codeMessage", `已清空 ${payload.removed} 个失效验证码。`, "success");
  await loadCodes();
}

async function approveAllSubmissions() {
  await requestJson("/api/admin/submissions/approve-all", { method: "POST", headers: authHeaders() });
  await Promise.all([loadAdminSubmissions(), loadAdminReviewSubmissions()]);
}

async function clearExpiredReviewSubmissions() {
  const payload = await requestJson("/api/admin/submissions/clear-expired-review", { method: "POST", headers: authHeaders() });
  setMessage("#reviewMessage", `已清除 ${payload.removed} 条过期内容。`, "success");
  await Promise.all([loadAdminSubmissions(), loadAdminReviewSubmissions()]);
}


async function generateCode() {
  setMessage("#codeMessage", "正在生成...");
  try {
    const payload = await requestJson("/api/admin/register-codes", { method: "POST", headers: authHeaders() });
    setMessage("#codeMessage", `新验证码：${payload.code.code}，20 分钟内有效。`, "success");
    await loadCodes();
  } catch (error) {
    setMessage("#codeMessage", error.message, "error");
  }
}

async function loadCodes() {
  const list = document.querySelector("#codeList");
  if (!list) return;
  const payload = await requestJson("/api/admin/register-codes", { headers: authHeaders() });
  list.innerHTML = payload.codes.length ? payload.codes.map((code) => `<article class="submission-item"><strong>${escapeHtml(code.code)}</strong><div class="submission-meta"><span>${statusLabel(code.status)}</span><span>过期：${formatDate(code.expiresAt)}</span></div></article>`).join("") : emptyText("暂无验证码。");
}

async function loadAdminSubmissions() {
  const list = document.querySelector("#adminSubmissionList");
  if (!list) return;
  const url = currentAdminBattleFilter ? `/api/admin/submissions?status=approved&battleId=${encodeURIComponent(currentAdminBattleFilter)}` : "/api/admin/submissions?status=approved";
  const payload = await requestJson(url, { headers: authHeaders() });
  list.innerHTML = payload.submissions.length ? payload.submissions.map(renderAdminSubmission).join("") : emptyText("暂无已通过谱面。");
  updateAdminArchiveButton(payload.submissions.length);
}

async function loadAdminReviewSubmissions() {
  const list = document.querySelector("#adminReviewSubmissionList");
  if (!list) return;
  const url = currentAdminBattleFilter ? `/api/admin/submissions?status=review&battleId=${encodeURIComponent(currentAdminBattleFilter)}` : "/api/admin/submissions?status=review";
  const payload = await requestJson(url, { headers: authHeaders() });
  list.innerHTML = payload.submissions.length ? payload.submissions.map(renderAdminSubmission).join("") : emptyText("暂无待审核谱面。");
}
async function loadAdminChartRequests() {
  const list = document.querySelector("#adminChartRequests");
  if (!list) return;
  const payload = await requestJson("/api/admin/chart-name-requests", { headers: authHeaders() });
  list.innerHTML = payload.requests.length ? payload.requests.map(renderAdminChartRequest).join("") : emptyText("暂无修改申请。");
}

function setupCollectionForm() {
  const form = document.querySelector("#collectionForm");
  if (!form || form.dataset.ready) return;
  form.dataset.ready = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = form.elements.id.value;
    setMessage("#collectionMessage", "正在保存...");
    try {
      await requestJson(id ? `/api/admin/collections/${id}` : "/api/admin/collections", {
        method: id ? "PATCH" : "POST",
        headers: authHeaders(),
        body: new FormData(form)
      });
      form.reset();
      setMessage("#collectionMessage", "合集已保存。", "success");
      await loadAdminCollections();
    } catch (error) {
      setMessage("#collectionMessage", error.message, "error");
    }
  });
  document.querySelector("#resetCollectionButton")?.addEventListener("click", () => form.reset());
}

async function loadAdminCollections() {
  const list = document.querySelector("#adminCollectionList");
  if (!list) return;
  const payload = await requestJson("/api/admin/collections", { headers: authHeaders() });
  list.innerHTML = payload.collections.length ? payload.collections.map(renderAdminCollection).join("") : emptyText("暂无合集。");
}

function setupBackgroundForm() {
  const form = document.querySelector("#backgroundForm");
  if (!form || form.dataset.ready) return;
  form.dataset.ready = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    setMessage("#backgroundMessage", "正在保存...");
    try {
      await requestJson("/api/admin/backgrounds", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(data)
      });
      form.reset();
      setMessage("#backgroundMessage", "bg 名已添加。", "success");
      await loadAdminBackgrounds();
    } catch (error) {
      setMessage("#backgroundMessage", error.message, "error");
    }
  });
}

async function loadAdminBackgrounds() {
  const list = document.querySelector("#adminBackgroundList");
  if (!list) return;
  const payload = await requestJson("/api/admin/backgrounds", { headers: authHeaders() });
  list.innerHTML = payload.backgrounds.length ? payload.backgrounds.map(renderAdminBackground).join("") : emptyText("暂无 bg 名。");
}

function setupTreasureDropForm() {
  const form = document.querySelector("#treasureDropForm");
  if (!form || form.dataset.ready) return;
  form.dataset.ready = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = form.elements.id.value;
    const data = new FormData(form);
    if (id && !form.image.files.length) data.delete("image");
    setMessage("#treasureDropMessage", "正在保存...");
    try {
      await requestJson(id ? `/api/admin/treasure-drops/${encodeURIComponent(id)}` : "/api/admin/treasure-drops", {
        method: id ? "PATCH" : "POST",
        headers: authHeaders(),
        body: data
      });
      form.reset();
      setMessage("#treasureDropMessage", "宝箱掉落已保存。", "success");
      await loadAdminTreasureDrops();
    } catch (error) {
      setMessage("#treasureDropMessage", error.message, "error");
    }
  });
  document.querySelector("#resetTreasureDropButton")?.addEventListener("click", () => form.reset());
}

async function loadAdminTreasureDrops() {
  const list = document.querySelector("#adminTreasureDropList");
  if (!list) return;
  const payload = await requestJson("/api/admin/treasure-drops", { headers: authHeaders() });
  list.innerHTML = payload.drops.length ? payload.drops.map(renderAdminTreasureDrop).join("") : emptyText("暂无宝箱掉落。");
}

function setupScheduleForm() {
  const form = document.querySelector("#scheduleForm");
  if (!form || form.dataset.ready) return;
  form.dataset.ready = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = form.elements.id.value;
    const data = Object.fromEntries(new FormData(form));
    setMessage("#scheduleMessage", "正在保存...");
    try {
      await requestJson(id ? `/api/admin/schedules/${id}` : "/api/admin/schedules", {
        method: id ? "PATCH" : "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(data)
      });
      form.reset();
      setMessage("#scheduleMessage", "日程已保存。", "success");
      await loadAdminSchedules();
    } catch (error) {
      setMessage("#scheduleMessage", error.message, "error");
    }
  });
  document.querySelector("#resetScheduleButton")?.addEventListener("click", () => form.reset());
}

async function loadAdminSchedules() {
  const list = document.querySelector("#adminScheduleList");
  if (!list) return;
  const payload = await requestJson("/api/admin/schedules", { headers: authHeaders() });
  list.innerHTML = payload.schedules.length ? payload.schedules.map(renderAdminSchedule).join("") : emptyText("暂无日程。");
}

function ensureBattleFormModal() {
  const form = document.querySelector("#battleForm");
  if (!form || document.querySelector("#battleFormModal")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="modal-backdrop hidden" id="battleFormModal">
      <div class="modal-panel battle-form-modal">
        <div class="modal-heading">
          <h2 id="battleFormModalTitle">创建无名战</h2>
          <button class="ghost-button compact" id="closeBattleModalButton" type="button">关闭</button>
        </div>
        <div id="battleFormMount"></div>
      </div>
    </div>
  `);
  document.querySelector("#battleFormMount").appendChild(form);
  document.querySelector("#resetBattleButton")?.remove();
  const close = () => closeBattleFormModal();
  document.querySelector("#closeBattleModalButton")?.addEventListener("click", close);
  document.querySelector("#battleFormModal")?.addEventListener("click", (event) => {
    if (event.target.id === "battleFormModal") close();
  });
}

function openBattleFormModal(mode = "create") {
  ensureBattleFormModal();
  const modal = document.querySelector("#battleFormModal");
  const title = document.querySelector("#battleFormModalTitle");
  const form = document.querySelector("#battleForm");
  const submitButton = form?.querySelector('button[type="submit"]');
  if (title) title.textContent = mode === "edit" ? "修改无名战" : "创建无名战";
  if (submitButton) submitButton.textContent = mode === "edit" ? "保存无名战" : "创建无名战";
  if (form) updateBattleSettingsVisibility(form);
  openModal(modal);
}

function closeBattleFormModal() {
  closeModal("#battleFormModal");
}

function setupBattleForm() {
  const form = document.querySelector("#battleForm");
  if (!form || form.dataset.ready) return;
  form.dataset.ready = "true";
  ensureBattleFormModal();
  setupCustomDivisionEditor("battle");
  document.querySelector("#openBattleModalButton")?.addEventListener("click", () => {
    form.reset();
    selectDefaultBattleHosts();
    fillDivisionSettings(form, { divisionMode: "standard", customDivisions: [] }, "battle");
    setMessage("#battleMessage", "");
    openBattleFormModal("create");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = form.elements.id.value;
    syncBattleHostIds();
    syncCustomDivisionInput("battle");
    syncBattlePhaseTimeFields(form);
    setMessage("#battleMessage", "正在保存...");
    try {
      await requestJson(id ? `/api/admin/battles/${id}` : "/api/admin/battles", {
        method: id ? "PATCH" : "POST",
        headers: authHeaders(),
        body: new FormData(form)
      });
      form.reset();
      setMessage("#battleMessage", "无名战已保存。", "success");
      closeBattleFormModal();
      await loadAdminBattles();
    } catch (error) {
      setMessage("#battleMessage", error.message, "error");
    }
  });
  document.querySelector("#resetBattleButton")?.addEventListener("click", () => {
    form.reset();
    selectDefaultBattleHosts();
    fillDivisionSettings(form, { divisionMode: "standard", customDivisions: [] }, "battle");
    setMessage("#battleMessage", "");
    openBattleFormModal("create");
  });
  document.querySelector("#battleHostSelect")?.addEventListener("change", syncBattleHostIds);
}

async function loadAdminBattles() {
  const list = document.querySelector("#adminBattleList");
  if (!list) return;
  const payload = await requestJson("/api/admin/battles", { headers: authHeaders() });
  adminBattles = payload.battles || [];
  const filter = document.querySelector("#adminBattleFilter");
  if (filter) {
    const current = filter.value;
    filter.innerHTML = `<option value="">全部无名战</option>${adminBattles.map((battle) => `<option value="${escapeAttr(battle.id)}">${escapeHtml(battle.title)}</option>`).join("")}`;
    filter.value = current;
    currentAdminBattleFilter = filter.value;
  }
  updateAdminArchiveButton();
  list.innerHTML = adminBattles.length ? adminBattles.map(renderAdminBattle).join("") : emptyText("暂无无名战。");
}

function updateAdminArchiveButton(currentApprovedCount = null) {
  const button = document.querySelector("#downloadApprovedButton");
  if (!button) return;
  const battle = adminBattles.find((item) => item.id === currentAdminBattleFilter);
  const count = battle ? Number(battle.finalSubmissionCount || 0) : Number(currentApprovedCount || 0);
  const enabled = Boolean(currentAdminBattleFilter && count > 0);
  button.disabled = !enabled;
  button.title = currentAdminBattleFilter ? (enabled ? "" : "暂无可下载谱面") : "请先选择一个无名战";
}

function setupMapperGroupForm() {
  const form = document.querySelector("#mapperGroupForm");
  if (!form || form.dataset.ready) return;
  form.dataset.ready = "true";
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = form.elements.id.value;
    const data = Object.fromEntries(new FormData(form));
    setMessage("#mapperGroupMessage", "正在保存...");
    try {
      await requestJson(id ? `/api/admin/mapper-groups/${encodeURIComponent(id)}` : "/api/admin/mapper-groups", {
        method: id ? "PATCH" : "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(data)
      });
      form.reset();
      setMessage("#mapperGroupMessage", "谱师组已保存。", "success");
      await loadAdminMapperGroups();
    } catch (error) {
      setMessage("#mapperGroupMessage", error.message, "error");
    }
  });
  document.querySelector("#resetMapperGroupButton")?.addEventListener("click", () => form.reset());
}

async function loadAdminMapperGroups() {
  const list = document.querySelector("#adminMapperGroupList");
  if (!list) return;
  const payload = await requestJson("/api/admin/mapper-groups", { headers: authHeaders() });
  allGroups = payload.groups || [];
  fillBattleGroupSelect();
  fillAdminGroupControls();
  list.innerHTML = allGroups.length ? allGroups.map(renderAdminMapperGroup).join("") : emptyText("暂无谱师组。");
}

function setupAdminGroupMemberTools() {
  document.querySelector("#adminGroupSelect")?.addEventListener("change", renderAdminGroupMembers);
  document.querySelector("#addUserToGroupButton")?.addEventListener("click", addSelectedUserToGroup);
}

async function loadAdminUsers() {
  const select = document.querySelector("#adminGroupUserSelect");
  if (!select) return;
  const payload = await requestJson("/api/admin/users", { headers: authHeaders() });
  adminUsers = payload.users || [];
  fillAdminGroupControls();
  fillBattleHostControls();
}

function fillBattleHostControls() {
  const select = document.querySelector("#battleHostSelect");
  if (!select) return;
  const current = new Set(Array.from(select.selectedOptions).map((option) => option.value));
  select.innerHTML = adminUsers.map((user) => `<option value="${escapeAttr(user.id)}">${escapeHtml(user.chartName)}（${escapeHtml(user.username)}）</option>`).join("");
  Array.from(select.options).forEach((option) => {
    option.selected = current.size ? current.has(option.value) : adminUsers.find((user) => user.id === option.value)?.role === "admin";
  });
  syncBattleHostIds();
}

function selectDefaultBattleHosts() {
  const select = document.querySelector("#battleHostSelect");
  if (!select) return;
  Array.from(select.options).forEach((option) => {
    option.selected = adminUsers.find((user) => user.id === option.value)?.role === "admin";
  });
  syncBattleHostIds();
}

function syncBattleHostIds() {
  const select = document.querySelector("#battleHostSelect");
  const input = document.querySelector("#battleHostIds");
  if (!select || !input) return;
  const ids = Array.from(select.selectedOptions).map((option) => option.value);
  input.value = JSON.stringify(ids);
}

function fillAdminGroupControls() {
  const groupSelect = document.querySelector("#adminGroupSelect");
  const userSelect = document.querySelector("#adminGroupUserSelect");
  if (groupSelect) {
    const current = groupSelect.value;
    groupSelect.innerHTML = allGroups.map((group) => `<option value="${escapeAttr(group.id)}">${escapeHtml(group.name)}</option>`).join("");
    groupSelect.value = current || groupSelect.options[0]?.value || "";
  }
  if (userSelect) {
    const current = userSelect.value;
    userSelect.innerHTML = adminUsers.filter((user) => user.role === "user").map((user) => `<option value="${escapeAttr(user.id)}">${escapeHtml(user.chartName)}（${escapeHtml(user.username)}）</option>`).join("");
    userSelect.value = current || userSelect.options[0]?.value || "";
  }
  renderAdminGroupMembers();
}

function renderAdminGroupMembers() {
  const list = document.querySelector("#adminGroupMemberList");
  const groupId = document.querySelector("#adminGroupSelect")?.value;
  if (!list) return;
  if (!groupId) {
    list.innerHTML = emptyText("请选择谱师组。");
    return;
  }
  const users = adminUsers.filter((user) => user.role === "user" && (user.groupIds || []).includes(groupId));
  list.innerHTML = users.length ? users.map((user) => `<article class="submission-item"><div class="item-top"><strong>${escapeHtml(user.chartName)}</strong><button class="danger-button compact" type="button" onclick="removeUserFromGroup('${escapeAttr(user.id)}', '${escapeAttr(groupId)}')">移出</button></div><div class="submission-meta"><span>${escapeHtml(user.username)}</span></div></article>`).join("") : emptyText("该谱师组暂无成员。");
}

async function addSelectedUserToGroup() {
  const userId = document.querySelector("#adminGroupUserSelect")?.value;
  const groupId = document.querySelector("#adminGroupSelect")?.value;
  if (!userId || !groupId) return;
  try {
    await requestJson(`/api/admin/users/${encodeURIComponent(userId)}/mapper-groups/${encodeURIComponent(groupId)}`, { method: "POST", headers: authHeaders() });
    setMessage("#adminGroupMemberMessage", "已加入谱师组。", "success");
    await loadAdminUsers();
  } catch (error) {
    setMessage("#adminGroupMemberMessage", error.message, "error");
  }
}

function renderPublicSubmissions(submissions) {
  const panel = document.querySelector("#publicSubmissionPanel");
  const list = document.querySelector("#publicSubmissionList");
  if (!panel || !list) return;
  panel.classList.toggle("hidden", !submissions.length);
  list.innerHTML = submissions.map((submission) => `
    <article class="submission-item battle-submission-item">
      <img class="chart-thumb" src="${escapeHtml(submission.thumbnailUrl)}" alt="${escapeHtml(submission.songTitle || submission.songId)} 封面">
      <div>
        <div class="item-top"><strong>${escapeHtml(submission.songTitle || submission.songId)} - ${escapeHtml(submission.songArtist || "未知")}</strong><span>${submissionDivisionLabel(submission)}</span></div>
        <div class="submission-meta"><span>${escapeHtml(submission.battleTitle)} 参赛</span></div>
      </div>
    </article>
  `).join("");
}

async function removeUserFromGroup(userId, groupId) {
  await requestJson(`/api/admin/users/${encodeURIComponent(userId)}/mapper-groups/${encodeURIComponent(groupId)}`, { method: "DELETE", headers: authHeaders() });
  await loadAdminUsers();
}

async function downloadApprovedChartsWithAuth() {
  const button = document.querySelector("#downloadApprovedButton");
  if (button?.disabled) return;
  if (!currentAdminBattleFilter) {
    setMessage("#battleMessage", "请先在全部提交谱面栏目选择一个无名战。", "error");
    return;
  }
  try {
    const response = await fetch(`/api/admin/battles/${encodeURIComponent(currentAdminBattleFilter)}/download-approved`, {
      headers: authHeaders()
    });
    if (!response.ok) {
      let message = "下载失败";
      try {
        const payload = await response.json();
        message = payload.error || message;
      } catch {
        // The download endpoint normally returns a zip, so JSON may not be available.
      }
      throw new Error(message);
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i);
    const filename = decodeURIComponent(match?.[1] || match?.[2] || "approved-charts.zip");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();
    setMessage("#battleMessage", "已开始下载通过审核的参赛谱面。", "success");
  } catch (error) {
    setMessage("#battleMessage", error.message, "error");
  }
}

function renderAdminMapperGroup(group) {
  return `<article class="submission-item"><div class="item-top"><strong>${escapeHtml(group.name)}</strong><span class="submission-meta">${formatDate(group.updatedAt || group.createdAt)}</span></div><div class="review-actions"><button type="button" data-id="${escapeAttr(group.id)}" data-name="${escapeAttr(group.name)}" onclick="editMapperGroupFromButton(this)">编辑</button><button type="button" class="danger-button" onclick="deleteMapperGroup('${escapeAttr(group.id)}')">删除</button></div></article>`;
}

function renderCollectionCard(collection) {
  return `<a class="collection-card" href="${escapeHtml(collection.link)}" target="_blank"><img src="${escapeHtml(collection.coverUrl)}" alt="${escapeHtml(collection.title)}封面"><strong>${escapeHtml(collection.title)}</strong></a>`;
}

function renderTimelineItem(item, type) {
  const state = timelineState(item.startTime, item.endTime);
  const title = type === "battle" ? item.title : item.name;
  const label = type === "battle" ? item.phaseLabel : state.text;
  const titleHtml = type === "battle" ? `<a href="/battle.html?id=${encodeURIComponent(item.id)}">${escapeHtml(title)}</a>` : escapeHtml(title);
  return `<article class="schedule-item ${state.kind}"><strong title="${escapeAttr(item.note || "")}">${titleHtml}</strong><span>${escapeHtml(label)}</span><small>${formatDate(item.startTime)} - ${formatDate(item.endTime)}</small></article>`;
}

function renderSubmissionItem(submission) {
  const retryUrl = `/submit.html?battleId=${encodeURIComponent(submission.battleId || "")}&division=${encodeURIComponent(submission.division || "")}&songId=${encodeURIComponent(submission.songId || "")}`;
  const editLink = submission.canEdit ? `<a href="/submit.html?id=${encodeURIComponent(submission.id)}">修改</a>` : "";
  const retryLink = submission.status === "rejected" ? `<a class="primary-link compact" href="${retryUrl}">重新提交</a>` : "";
  const withdrawButton = submission.canWithdraw ? `<button class="danger-button soft-danger compact" type="button" onclick="confirmWithdrawSubmission(this, '${escapeAttr(submission.id)}')">撤回</button>` : "";
  const collaboratorText = submission.collaborators?.length ? `<p class="note">合作对象：${submission.collaborators.map((item) => `${escapeHtml(item.chartName)}（${collaboratorStatusLabel(item.status)}）`).join("、")}</p>` : "";
  const rejection = submission.status === "rejected" && submission.reviewNote ? `<p class="note">谱面打回：${escapeHtml(submission.reviewNote)}</p>` : "";
  return `<article class="submission-item"><div class="item-top"><strong>${escapeHtml(submission.songId || submission.battleTitle)}</strong><div class="item-top-actions"><span class="status ${submission.status}">${statusLabel(submission.status)}</span>${retryLink}${withdrawButton}</div></div><div class="submission-meta"><span>${submissionDivisionLabel(submission)}</span><span>${escapeHtml(submission.battleTitle)}</span><span>${escapeHtml(submission.originalFileName || "无文件名")}</span><span>${formatBytes(submission.fileSize)}</span><span>提交：${formatDate(submission.createdAt)}</span>${editLink}</div>${collaboratorText}${rejection}</article>`;
}


function renderAdminSubmission(submission) {
  const reviewControls = submission.status === "approved" ? "" : `<div class="review-actions"><input placeholder="驳回时必填审核意见" data-note="${escapeAttr(submission.id)}"><button type="button" onclick="reviewSubmission('${escapeAttr(submission.id)}', 'approved')">通过</button><button type="button" class="danger-button" onclick="reviewSubmission('${escapeAttr(submission.id)}', 'rejected')">驳回</button></div>`;
  const fileLink = submission.fileDeleted || !submission.fileUrl
    ? `<span class="disabled-file-link" aria-disabled="true">查看文件</span>`
    : `<a href="${escapeHtml(submission.fileUrl)}" target="_blank">查看文件</a>`;
  return `<article class="submission-item"><div class="item-top"><strong>${escapeHtml(submission.songId)}</strong><span class="status ${escapeAttr(submission.status)}">${statusLabel(submission.status)}</span></div><div class="submission-meta"><span>谱师：${escapeHtml(submission.chartName)}</span><span>组别：${submissionDivisionLabel(submission)}</span><span>无名战：${escapeHtml(submission.battleTitle)}</span><span>提交：${formatDate(submission.createdAt)}</span>${fileLink}</div>${submission.collaborators?.length ? `<p class="note">合作对象：${submission.collaborators.map((item) => `${escapeHtml(item.chartName)}（${statusLabel(item.status)}）`).join("、")}</p>` : ""}${submission.reviewNote && submission.status !== "approved" ? `<p class="note">审核意见：${escapeHtml(submission.reviewNote)}</p>` : ""}${reviewControls}</article>`;
}

function renderCollaborationRequest(request) {
  const actions = request.status === "pending" ? `<div class="review-actions" data-collaboration-actions="${escapeAttr(request.submissionId)}"><button type="button" onclick="confirmCollaborationResponse(this, '${request.submissionId}', 'accepted')">同意</button><button type="button" class="danger-button" onclick="confirmCollaborationResponse(this, '${request.submissionId}', 'rejected')">拒绝</button></div>` : "";
  return `<article class="submission-item"><div class="item-top"><strong>${escapeHtml(request.songId)}</strong><span class="status ${request.status}">${statusLabel(request.status)}</span></div><div class="submission-meta"><span>${escapeHtml(request.battleTitle)}</span><span>发起人：${escapeHtml(request.ownerChartName)}</span><span>${submissionDivisionLabel(request)}</span></div>${actions}</article>`;
}

function renderChartRequest(request) {
  return `<article class="submission-item"><strong>${escapeHtml(request.currentChartName)} -> ${escapeHtml(request.requestedChartName)}</strong><p>${escapeHtml(request.reason || "未填写理由")}</p><div class="submission-meta"><span>${statusLabel(request.status)}</span><span>${formatDate(request.createdAt)}</span></div>${request.reviewNote ? `<p class="note">审核意见：${escapeHtml(request.reviewNote)}</p>` : ""}</article>`;
}

function renderAdminChartRequest(request) {
  return `<article class="submission-item"><div class="item-top"><strong>${escapeHtml(request.username)}：${escapeHtml(request.currentChartName)} -> ${escapeHtml(request.requestedChartName)}</strong><span class="status ${request.status}">${statusLabel(request.status)}</span></div><p>${escapeHtml(request.reason || "未填写理由")}</p><div class="review-actions"><input placeholder="审核意见" data-request-note="${request.id}"><button type="button" onclick="reviewChartRequest('${request.id}', 'approved')">通过</button><button type="button" class="danger-button" onclick="reviewChartRequest('${request.id}', 'rejected')">驳回</button></div></article>`;
}

function renderAdminCollection(collection) {
  return `<article class="submission-item"><div class="admin-media-row"><img src="${escapeHtml(collection.coverUrl)}" alt="${escapeHtml(collection.title)}封面"><div><strong>${escapeHtml(collection.title)}</strong><div class="submission-meta"><a href="${escapeHtml(collection.link)}" target="_blank">打开链接</a></div></div></div><div class="review-actions"><button type="button" data-id="${escapeAttr(collection.id)}" data-title="${escapeAttr(collection.title)}" data-link="${escapeAttr(collection.link)}" onclick="editCollectionFromButton(this)">编辑</button><button type="button" class="danger-button" onclick="deleteCollection('${collection.id}')">删除</button></div></article>`;
}

function renderAdminBackground(background) {
  return `<article class="submission-item"><div class="item-top"><strong>${escapeHtml(background.name)}</strong><button type="button" class="danger-button compact" onclick="deleteBackground('${escapeAttr(background.id)}')">删除</button></div><div class="submission-meta"><span>${formatDate(background.createdAt)}</span></div></article>`;
}

function renderAdminTreasureDrop(drop) {
  return `<article class="submission-item"><div class="admin-media-row"><img src="${escapeHtml(drop.imageUrl)}" alt="${escapeHtml(drop.name)}"><div><strong>${escapeHtml(drop.name)}</strong><div class="submission-meta"><span>概率权重：${escapeHtml(drop.probability)}</span></div></div></div><div class="review-actions"><button type="button" data-id="${escapeAttr(drop.id)}" data-name="${escapeAttr(drop.name)}" data-probability="${escapeAttr(drop.probability)}" onclick="editTreasureDropFromButton(this)">编辑</button><button type="button" class="danger-button" onclick="deleteTreasureDrop('${escapeAttr(drop.id)}')">删除</button></div></article>`;
}

function renderAdminSchedule(schedule) {
  return `<article class="submission-item"><strong>${escapeHtml(schedule.name)}</strong><p>${escapeHtml(schedule.note || "无备注")}</p><div class="submission-meta"><span>${formatDate(schedule.startTime)}</span><span>${formatDate(schedule.endTime)}</span></div><div class="review-actions"><button type="button" data-id="${escapeAttr(schedule.id)}" data-name="${escapeAttr(schedule.name)}" data-note="${escapeAttr(schedule.note || "")}" data-start="${escapeAttr(schedule.startTime)}" data-end="${escapeAttr(schedule.endTime)}" onclick="editScheduleFromButton(this)">编辑</button><button type="button" class="danger-button" onclick="deleteSchedule('${schedule.id}')">删除</button></div></article>`;
}

function renderAdminBattle(battle) {
  const groupText = battle.allowedGroupName ? `开放谱师组：${escapeHtml(battle.allowedGroupName)}` : "开放谱师组：全部谱师";
  const hosts = battle.hosts?.length ? `主催：${battle.hosts.map((host) => escapeHtml(host.chartName)).join("、")}` : "主催：未指定";
  const limits = battle.submissionLimits || {};
  const checks = battle.optionalChecks || {};
  const locks = battle.settingLocks || {};
  const limitText = `上限：个人 ${formatLimit(limits.solo)} / 合作 ${formatLimit(limits.collab)} / Bonus ${formatLimit(limits.bonus)}`;
  const divisionText = battle.divisionMode === "custom" ? `自定义分组：${(battle.customDivisions || []).map((item) => escapeHtml(item.name)).join("、")}` : "标准分组";
  const optionalText = battle.optionalCheckDescriptions?.length ? `可选检查：${battle.optionalCheckDescriptions.map(escapeHtml).join("；")}` : "可选检查：未启用";
  return `<article class="submission-item"><strong>${escapeHtml(battle.title)}</strong><p>${escapeHtml(battle.description || "暂无简介")}</p><div class="submission-meta"><span>${escapeHtml(battle.phaseLabel)}</span><span>${groupText}</span><span>${hosts}</span><span>${limitText}</span><span>${divisionText}</span><span>${optionalText}</span><span>写谱：${formatDate(battle.writingStartTime)} - ${formatDate(battle.writingEndTime)}</span><span>整理：${formatDate(battle.packingStartTime)} - ${formatDate(battle.packingEndTime)}</span><span>狙击：${formatDate(battle.snipingStartTime)} - ${formatDate(battle.snipingEndTime)}</span></div><div class="review-actions"><button type="button" data-id="${escapeAttr(battle.id)}" data-title="${escapeAttr(battle.title)}" data-description="${escapeAttr(battle.description || "")}" data-allowed-group-id="${escapeAttr(battle.allowedGroupId || "")}" data-host-user-ids="${escapeAttr(JSON.stringify(battle.hostUserIds || []))}" data-solo-limit="${escapeAttr(limits.solo ?? "")}" data-collab-limit="${escapeAttr(limits.collab ?? "")}" data-bonus-limit="${escapeAttr(limits.bonus ?? "")}" data-duration-enabled="${checks.duration?.enabled ? "true" : ""}" data-duration-min="${escapeAttr(checks.duration?.min ?? "")}" data-duration-max="${escapeAttr(checks.duration?.max ?? "")}" data-difficulty-enabled="${checks.difficulty?.enabled ? "true" : ""}" data-difficulty-min="${escapeAttr(checks.difficulty?.min ?? "")}" data-difficulty-max="${escapeAttr(checks.difficulty?.max ?? "")}" data-no-eternal="${checks.noEternal ? "true" : ""}" data-aff-type-check="${checks.affTypeCheck ? "true" : ""}" data-aaf-acc-normalize="${checks.aafAccNormalize ? "true" : ""}" data-aff-syntax="${escapeAttr(JSON.stringify(checks.affSyntax || {}))}" data-lock-description="${locks.description ? "true" : ""}" data-lock-banner="${locks.banner ? "true" : ""}" data-lock-rules="${locks.rules ? "true" : ""}" data-lock-duration-check="${optionalCheckLocked(locks, "duration") ? "true" : ""}" data-lock-difficulty-check="${optionalCheckLocked(locks, "difficulty") ? "true" : ""}" data-lock-no-eternal-check="${optionalCheckLocked(locks, "noEternal") ? "true" : ""}" data-lock-aff-type-check="${optionalCheckLocked(locks, "affTypeCheck") ? "true" : ""}" data-lock-aaf-acc-normalize-check="${optionalCheckLocked(locks, "aafAccNormalize") ? "true" : ""}" data-division-mode="${escapeAttr(battle.divisionMode || "standard")}" data-custom-divisions="${escapeAttr(JSON.stringify(battle.customDivisions || []))}" data-writing-start="${escapeAttr(battle.writingStartTime)}" data-writing-end="${escapeAttr(battle.writingEndTime)}" data-packing-start="${escapeAttr(battle.packingStartTime)}" data-packing-end="${escapeAttr(battle.packingEndTime)}" data-sniping-start="${escapeAttr(battle.snipingStartTime)}" data-sniping-end="${escapeAttr(battle.snipingEndTime)}" onclick="editBattleFromButton(this)">编辑</button><button type="button" class="danger-button" onclick="deleteBattle('${battle.id}')">删除</button></div></article>`;
}

async function reviewSubmission(id, status) {
  const note = document.querySelector(`[data-note="${id}"]`)?.value || "";
  if (status === "rejected" && !note.trim()) {
    alert("驳回谱面时需要填写审核意见");
    return;
  }
  await requestJson(`/api/admin/submissions/${id}/review`, { method: "PATCH", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ status, reviewNote: note }) });
  await Promise.all([loadAdminSubmissions(), loadAdminReviewSubmissions()]);
}

async function reviewChartRequest(id, status) {
  const note = document.querySelector(`[data-request-note="${id}"]`)?.value || "";
  await requestJson(`/api/admin/chart-name-requests/${id}/review`, { method: "PATCH", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ status, reviewNote: note }) });
  await loadAdminChartRequests();
}

async function confirmCollaborationResponse(button, id, action) {
  if (button.dataset.confirming !== "true") {
    button.dataset.confirming = "true";
    button.textContent = action === "accepted" ? "再次点击确认同意" : "再次点击确认拒绝";
    return;
  }
  const actions = button.closest(".review-actions");
  actions?.querySelectorAll("button").forEach((item) => item.disabled = true);
  await respondCollaboration(id, action);
  if (actions) actions.remove();
}

async function respondCollaboration(id, action) {
  await requestJson(`/api/my/collaboration-requests/${id}`, { method: "PATCH", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ action }) });
  await Promise.all([loadCollaborationRequests(), loadMySubmissions()]);
}

async function confirmWithdrawSubmission(button, id) {
  if (button.dataset.confirming !== "true") {
    button.dataset.confirming = "true";
    button.textContent = "再次点击确认撤回";
    return;
  }
  button.disabled = true;
  await requestJson(`/api/submissions/${encodeURIComponent(id)}/withdraw`, { method: "PATCH", headers: authHeaders() });
  await loadMySubmissions();
}

function editCollectionFromButton(button) {
  const form = document.querySelector("#collectionForm");
  form.elements.id.value = button.dataset.id;
  form.title.value = button.dataset.title;
  form.link.value = button.dataset.link;
  form.cover.value = "";
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function deleteCollection(id) {
  await requestJson(`/api/admin/collections/${id}`, { method: "DELETE", headers: authHeaders() });
  await loadAdminCollections();
}

async function deleteBackground(id) {
  await requestJson(`/api/admin/backgrounds/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() });
  await loadAdminBackgrounds();
}

function editTreasureDropFromButton(button) {
  const form = document.querySelector("#treasureDropForm");
  form.elements.id.value = button.dataset.id;
  form.name.value = button.dataset.name;
  form.probability.value = button.dataset.probability;
  form.image.value = "";
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function deleteTreasureDrop(id) {
  await requestJson(`/api/admin/treasure-drops/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() });
  await loadAdminTreasureDrops();
}

function editScheduleFromButton(button) {
  const form = document.querySelector("#scheduleForm");
  form.elements.id.value = button.dataset.id;
  form.name.value = button.dataset.name;
  form.note.value = button.dataset.note;
  form.startTime.value = toDatetimeLocal(button.dataset.start);
  form.endTime.value = toDatetimeLocal(button.dataset.end);
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function deleteSchedule(id) {
  await requestJson(`/api/admin/schedules/${id}`, { method: "DELETE", headers: authHeaders() });
  await loadAdminSchedules();
}

function editBattleFromButton(button) {
  const form = document.querySelector("#battleForm");
  form.elements.id.value = button.dataset.id;
  form.title.value = button.dataset.title;
  form.description.value = button.dataset.description;
  form.allowedGroupId.value = button.dataset.allowedGroupId || "";
  form.soloLimit.value = button.dataset.soloLimit || "";
  form.collabLimit.value = button.dataset.collabLimit || "";
  form.bonusLimit.value = button.dataset.bonusLimit || "";
  form.durationEnabled.checked = button.dataset.durationEnabled === "true";
  form.durationMin.value = button.dataset.durationMin || "";
  form.durationMax.value = button.dataset.durationMax || "";
  if (form.difficultyEnabled) form.difficultyEnabled.checked = button.dataset.difficultyEnabled === "true";
  if (form.difficultyMin) form.difficultyMin.value = button.dataset.difficultyMin || "";
  if (form.difficultyMax) form.difficultyMax.value = button.dataset.difficultyMax || "";
  form.noEternal.checked = button.dataset.noEternal === "true";
  if (form.affTypeCheck) form.affTypeCheck.checked = button.dataset.affTypeCheck === "true";
  if (form.aafAccNormalize) form.aafAccNormalize.checked = button.dataset.aafAccNormalize === "true";
  fillAffSyntaxInputs(form, parseSafeJsonObject(button.dataset.affSyntax));
  if (form.lockDescription) form.lockDescription.checked = button.dataset.lockDescription === "true";
  if (form.lockBanner) form.lockBanner.checked = button.dataset.lockBanner === "true";
  if (form.lockRules) form.lockRules.checked = button.dataset.lockRules === "true";
  if (form.lockDurationCheck) form.lockDurationCheck.checked = button.dataset.lockDurationCheck === "true";
  if (form.lockDifficultyCheck) form.lockDifficultyCheck.checked = button.dataset.lockDifficultyCheck === "true";
  if (form.lockNoEternalCheck) form.lockNoEternalCheck.checked = button.dataset.lockNoEternalCheck === "true";
  if (form.lockAffTypeCheck) form.lockAffTypeCheck.checked = button.dataset.lockAffTypeCheck === "true";
  if (form.lockAafAccNormalizeCheck) form.lockAafAccNormalizeCheck.checked = button.dataset.lockAafAccNormalizeCheck === "true";
  fillDivisionSettings(form, { divisionMode: button.dataset.divisionMode || "standard", customDivisions: parseSafeJsonArray(button.dataset.customDivisions) }, "battle");
  const hostIds = parseSafeJsonArray(button.dataset.hostUserIds);
  const hostSelect = document.querySelector("#battleHostSelect");
  if (hostSelect) {
    Array.from(hostSelect.options).forEach((option) => {
      option.selected = hostIds.includes(option.value);
    });
    syncBattleHostIds();
  }
  form.banner.value = "";
  form.rules.value = "";
  form.writingStartTime.value = toDatetimeLocal(button.dataset.writingStart);
  form.writingEndTime.value = toDatetimeLocal(button.dataset.writingEnd);
  form.packingStartTime.value = toDatetimeLocal(button.dataset.packingStart);
  form.packingEndTime.value = toDatetimeLocal(button.dataset.packingEnd);
  form.snipingStartTime.value = toDatetimeLocal(button.dataset.snipingStart);
  form.snipingEndTime.value = toDatetimeLocal(button.dataset.snipingEnd);
  syncBattlePhaseTimeFields(form);
  setMessage("#battleMessage", "");
  openBattleFormModal("edit");
}

async function deleteBattle(id) {
  await requestJson(`/api/admin/battles/${id}`, { method: "DELETE", headers: authHeaders() });
  await loadAdminBattles();
}

function editMapperGroupFromButton(button) {
  const form = document.querySelector("#mapperGroupForm");
  form.elements.id.value = button.dataset.id;
  form.name.value = button.dataset.name;
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function deleteMapperGroup(id) {
  await requestJson(`/api/admin/mapper-groups/${encodeURIComponent(id)}`, { method: "DELETE", headers: authHeaders() });
  await Promise.all([loadAdminMapperGroups(), loadMapperGroups(), loadMappers()]);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error || "操作失败");
    error.autoCheckErrors = payload.autoCheckErrors || [];
    throw error;
  }
  return payload;
}

function sortTimelineItems(a, b) {
  const rankDiff = timelineRank(a) - timelineRank(b);
  if (rankDiff !== 0) return rankDiff;
  return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
}

function timelineRank(item) {
  const now = Date.now();
  const start = new Date(item.startTime).getTime();
  const end = new Date(item.endTime).getTime();
  if (now > end) return 0;
  if (now >= start && now <= end) return 1;
  return 2;
}

function timelineState(startValue, endValue) {
  const now = Date.now();
  const start = new Date(startValue).getTime();
  const end = new Date(endValue).getTime();
  if (now > end) return { kind: "ended", text: "已结束" };
  if (now < start) return { kind: "upcoming", text: `${formatRemainingTime(start - now)}后开始` };
  return { kind: "running", text: formatRemainingTime(end - now) };
}

function formatCountdown(value) {
  const target = new Date(value).getTime();
  if (!target || Number.isNaN(target)) return "";
  return formatRemainingTime(target - Date.now());
}

function formatRemainingTime(value) {
  const remaining = Math.max(0, Number(value || 0));
  const day = 86400000;
  const hour = 3600000;
  const minute = 60000;
  const second = 1000;
  if (remaining >= 14 * day) return `剩余${Math.max(1, Math.ceil(remaining / day))}天`;
  if (remaining >= day) {
    const days = Math.floor(remaining / day);
    const hours = Math.floor((remaining % day) / hour);
    return `剩余${days}天${hours}小时`;
  }
  if (remaining >= 6 * hour) {
    const hours = Math.floor(remaining / hour);
    const minutes = Math.floor((remaining % hour) / minute);
    return `剩余${hours}小时${minutes}分`;
  }
  const hours = Math.floor(remaining / hour);
  const minutes = Math.floor((remaining % hour) / minute);
  const seconds = Math.max(0, Math.floor((remaining % minute) / second));
  return `剩余${hours}小时${minutes}分${seconds}秒`;
}

function countdownRefreshDelay(value) {
  const remaining = Math.max(0, Number(value || 0));
  const day = 86400000;
  const hour = 3600000;
  const minute = 60000;
  const second = 1000;
  if (remaining <= 0) return second;
  if (remaining >= 14 * day) return delayToNextUnit(remaining, day);
  if (remaining >= day) return delayToNextUnit(remaining, hour);
  if (remaining >= 6 * hour) return delayToNextUnit(remaining, minute);
  return delayToNextUnit(remaining, second);
}

function delayToNextUnit(remaining, unit) {
  const delay = remaining % unit || unit;
  return Math.max(1000, Math.min(delay + 50, 2147483647));
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(userKey));
  } catch {
    return null;
  }
}

function setMessage(selector, text, type = "") {
  const element = document.querySelector(selector);
  if (!element) return;
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function formatBytes(value) {
  const size = Number(value || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function roleLabel(role) {
  return role === "admin" ? "管理员" : "普通用户";
}

function formatLimit(value) {
  return value === "" || value === undefined || value === null ? "无限制" : String(value);
}

function formatCountLimit(count, limit) {
  return `${Number(count || 0)} / ${formatLimit(limit)}`;
}

function parseSafeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseSafeJsonObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function divisionLabel(division) {
  return { solo: "个人", collab: "合作", bonus: "Bonus" }[division] || division || "";
}

function submissionDivisionLabel(item) {
  return escapeHtml(item?.divisionName || divisionLabel(item?.division));
}

function statusLabel(status) {
  return {
    pending: "待审核",
    approved: "已通过",
    rejected: "已驳回",
    waiting_collaboration: "等待合作对象",
    collaboration_rejected: "合作已拒绝",
    withdrawn: "已撤回",
    accepted: "已同意",
    active: "可用",
    used: "已使用",
    expired: "已过期",
    invalidated: "已失效"
  }[status] || status;
}

function collaboratorStatusLabel(status) {
  return status === "pending" ? "待接受" : statusLabel(status);
}

function loadingText() {
  return "<p class=\"message\">正在加载...</p>";
}

function emptyText(text) {
  return `<p class="message">${text}</p>`;
}

function errorText(text) {
  return `<p class="message error">${text}</p>`;
}
