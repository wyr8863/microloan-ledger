const STORAGE_KEY = "lender-interest-console-v3";
const API_STATE_ENDPOINT = "/api/state";
const AUTH_SESSION_KEY = "lender-console-authenticated";
const DEFAULT_AUTH_USERNAME = "WWW";
const DEFAULT_AUTH_PASSWORD = "118119";

const sampleLoans = [
  createLoan({
    borrower: "张先生",
    principal: 50000,
    annualRate: 12,
    startDate: "2026-01-15",
    termMonths: 12,
    firstDueDate: "2026-02-15",
    reminderDays: 3,
    interestMode: "monthly",
    status: "active",
    notes: "每月中旬收息，线下转账。",
    fundingSources: [
      { name: "自有资金", amount: 20000, annualCostRate: 0 },
      { name: "合伙资金 A", amount: 30000, annualCostRate: 6.5 }
    ]
  }),
  createLoan({
    borrower: "李女士",
    principal: 80000,
    annualRate: 10.8,
    startDate: "2026-03-02",
    termMonths: 6,
    firstDueDate: "2026-06-02",
    reminderDays: 5,
    interestMode: "quarterly",
    status: "active",
    notes: "按季度收息，月底确认成本结算。",
    fundingSources: [
      { name: "自有资金", amount: 50000, annualCostRate: 0 },
      { name: "拆入资金 B", amount: 30000, annualCostRate: 7.2 }
    ]
  })
];

sampleLoans[0].schedule[0].received = true;
sampleLoans[0].schedule[0].receivedDate = "2026-02-15";
sampleLoans[0].schedule[0].receivedInterestAmount = sampleLoans[0].schedule[0].interest;
sampleLoans[0].schedule[0].costPaid = true;
sampleLoans[0].schedule[0].costPaidDate = "2026-02-15";
sampleLoans[0].schedule[0].costPaidAmount = sampleLoans[0].schedule[0].fundingCostExpected;
sampleLoans[0].schedule[1].received = true;
sampleLoans[0].schedule[1].receivedDate = "2026-03-15";
sampleLoans[0].schedule[1].receivedInterestAmount = sampleLoans[0].schedule[1].interest;
sampleLoans[1].schedule[0].received = true;
sampleLoans[1].schedule[0].receivedDate = "2026-06-02";
sampleLoans[1].schedule[0].receivedInterestAmount = sampleLoans[1].schedule[0].interest;
sampleLoans[1].schedule[0].costPaid = true;
sampleLoans[1].schedule[0].costPaidDate = "2026-06-02";
sampleLoans[1].schedule[0].costPaidAmount = sampleLoans[1].schedule[0].fundingCostExpected;

let state = loadState();
let activeLoanId = null;
let formStepIndex = 0;
let editingLoanId = null;
let reminderRangeDays = 30;
let advancedExpanded = false;
let currentLoanFilter = "all";

const metricsGrid = document.querySelector("#metrics-grid");
const authOverlay = document.querySelector("#auth-overlay");
const authForm = document.querySelector("#auth-form");
const authError = document.querySelector("#auth-error");
const authSettingsDialog = document.querySelector("#auth-settings-dialog");
const authSettingsForm = document.querySelector("#auth-settings-form");
const authSettingsError = document.querySelector("#auth-settings-error");
const mobileSummary = document.querySelector("#mobile-summary");
const upcomingReminders = document.querySelector("#upcoming-reminders");
const loansTableBody = document.querySelector("#loans-table-body");
const todayReminders = document.querySelector("#today-reminders");
const monthPlan = document.querySelector("#month-plan");
const monthlyStats = document.querySelector("#monthly-stats");
const statusStats = document.querySelector("#status-stats");
const funderSummary = document.querySelector("#funder-summary");
const funderBreakdown = document.querySelector("#funder-breakdown");
const loanForm = document.querySelector("#loan-form");
const searchInput = document.querySelector("#search-input");
const loanFilterBar = document.querySelector("#loan-filter-bar");
const reminderRangeSelect = document.querySelector("#reminder-range-select");
const toggleAdvancedBtn = document.querySelector("#toggle-advanced-btn");
const interestModeSelect = document.querySelector("#interest-mode-select");
const customScheduleWrap = document.querySelector("#custom-schedule-wrap");
const advancedFields = document.querySelector("#advanced-fields");
const detailDialog = document.querySelector("#detail-dialog");
const detailTitle = document.querySelector("#detail-title");
const detailSummary = document.querySelector("#detail-summary");
const extensionList = document.querySelector("#extension-list");
const scheduleList = document.querySelector("#schedule-list");
const loansCards = document.querySelector("#loans-cards");
const formSteps = Array.from(document.querySelectorAll("[data-form-step]"));
const stepDots = Array.from(document.querySelectorAll("[data-step-dot]"));
const prevStepBtn = document.querySelector("#prev-step-btn");
const nextStepBtn = document.querySelector("#next-step-btn");
const submitLoanBtn = document.querySelector("#submit-loan-btn");
const fundingSourcesList = document.querySelector("#funding-sources-list");
const addFundingSourceBtn = document.querySelector("#add-funding-source-btn");
const fundingTotalNote = document.querySelector("#funding-total-note");
const authSettingsBtn = document.querySelector("#auth-settings-btn");
const closeAuthSettingsBtn = document.querySelector("#close-auth-settings-btn");
const logoutBtn = document.querySelector("#logout-btn");
const recordPrincipalBtn = document.querySelector("#record-principal-btn");
const earlySettleBtn = document.querySelector("#early-settle-btn");
const extendLoanBtn = document.querySelector("#extend-loan-btn");

init();

function init() {
  renderFundingSourcesEditor();
  setDefaultDates();
  bindEvents();
  syncInterestModeUI();
  syncAdvancedUI();
  syncAuthUI();
  render();
  if (isAuthenticated()) {
    hydrateSharedState();
    notifyUpcomingIfAllowed();
  }
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.loans) {
        return {
          loans: parsed.loans.map(normalizeLoan),
          auth: normalizeAuthConfig(parsed.auth)
        };
      }
    } catch (error) {
      console.warn("Failed to read local state.", error);
    }
  }
  return {
    loans: structuredClone(sampleLoans).map(normalizeLoan),
    auth: normalizeAuthConfig()
  };
}

function normalizeAuthConfig(auth) {
  return {
    username: String(auth?.username || DEFAULT_AUTH_USERNAME).trim() || DEFAULT_AUTH_USERNAME,
    password: String(auth?.password || DEFAULT_AUTH_PASSWORD)
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  persistSharedState();
}

function normalizeLoan(loan) {
  const principal = roundMoney(Number(loan.principal || 0));
  const fundingSources = normalizeFundingSources(loan.fundingSources, principal);
  const monthlyFundingCost = sum(fundingSources.map((item) => monthlyCost(item.amount, item.annualCostRate)));
  const interestMode = normalizeInterestMode(loan.interestMode || loan.repaymentType);
  const schedule = (Array.isArray(loan.schedule) ? loan.schedule : []).map((item, index) => normalizeScheduleItem(item, index, monthlyFundingCost));
  const normalized = {
    ...loan,
    principal,
    annualRate: roundRate(Number(loan.annualRate || 0)),
    termMonths: Number(loan.termMonths || schedule.length || 0),
    reminderDays: Number(loan.reminderDays || 0),
    interestMode,
    customSchedule: typeof loan.customSchedule === "string" ? loan.customSchedule : "",
    status: loan.status || "active",
    fundingSources,
    monthlyFundingCost,
    weightedFundingCostRate: roundRate(principal ? monthlyFundingCost * 12 / principal * 100 : 0),
    extensions: normalizeExtensions(loan.extensions),
    schedule: schedule.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.period - b.period)
  };
  syncLoanStatus(normalized);
  return normalized;
}

function normalizeScheduleItem(item, index, monthlyFundingCost) {
  const interest = roundMoney(Number(item.interest || 0));
  const principalDue = roundMoney(Number(item.principalDue || 0));
  const fundingCostExpected = roundMoney(Number(item.fundingCostExpected ?? monthlyFundingCost));
  return {
    id: item.id || crypto.randomUUID(),
    period: Number(item.period || index + 1),
    dueDate: item.dueDate || todayString(),
    phase: item.phase || "original",
    phaseLabel: item.phaseLabel || "原合同",
    collectionKind: item.collectionKind || inferCollectionKind(interest, principalDue, fundingCostExpected),
    interest,
    principalDue,
    fundingCostExpected,
    netInterestExpected: roundMoney(Number(item.netInterestExpected ?? (interest - fundingCostExpected))),
    received: Boolean(item.received),
    receivedDate: item.receivedDate || "",
    receivedInterestAmount: roundMoney(Number(item.receivedInterestAmount ?? item.receivedAmount ?? 0)),
    receivedPrincipalAmount: roundMoney(Number(item.receivedPrincipalAmount || 0)),
    costPaid: Boolean(item.costPaid),
    costPaidDate: item.costPaidDate || "",
    costPaidAmount: roundMoney(Number(item.costPaidAmount || 0)),
    shareholderPayouts: normalizeShareholderPayouts(item.shareholderPayouts),
    voided: Boolean(item.voided),
    voidReason: item.voidReason || ""
  };
}

function normalizeShareholderPayouts(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    sourceId: item.sourceId || "",
    sourceName: String(item.sourceName || "").trim() || "资金方",
    expectedAmount: roundMoney(Number(item.expectedAmount || 0)),
    paidAmount: roundMoney(Number(item.paidAmount || 0)),
    paidDate: item.paidDate || "",
    paid: Boolean(item.paid)
  }));
}

function normalizeExtensions(extensions) {
  return (Array.isArray(extensions) ? extensions : []).map((item) => ({
    id: item.id || crypto.randomUUID(),
    extensionDate: item.extensionDate || "",
    startDate: item.startDate || item.extensionDate || "",
    termMonths: Number(item.termMonths || 0),
    annualRate: roundRate(Number(item.annualRate || 0)),
    interestMode: normalizeInterestMode(item.interestMode),
    firstDueDate: item.firstDueDate || "",
    notes: item.notes || ""
  })).sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function normalizeInterestMode(value) {
  const normalized = value === "interest_only" || value === "equal_interest" ? "monthly" : value;
  return ["monthly", "quarterly", "advance_once", "maturity", "custom"].includes(normalized) ? normalized : "monthly";
}

function normalizeFundingSources(input, principal) {
  const sourceList = Array.isArray(input) ? input : [];
  const cleaned = sourceList
    .map((item) => ({
      id: item.id || crypto.randomUUID(),
      name: String(item.name || "").trim() || "资金来源",
      amount: roundMoney(Number(item.amount || 0)),
      annualCostRate: roundRate(Number(item.annualCostRate || 0)),
      interestShareRate: roundRate(Number(item.interestShareRate ?? defaultInterestShareRate(item.name)))
    }))
    .filter((item) => item.amount > 0);

  if (!cleaned.length) {
    return [{ id: crypto.randomUUID(), name: "自有资金", amount: principal, annualCostRate: 0, interestShareRate: 0 }];
  }

  const total = sum(cleaned.map((item) => item.amount));
  if (total < principal) {
    cleaned.push({
      id: crypto.randomUUID(),
      name: "自有资金",
      amount: roundMoney(principal - total),
      annualCostRate: 0,
      interestShareRate: 0
    });
  }

  return cleaned;
}

function defaultInterestShareRate(name) {
  const text = String(name || "").trim();
  return text.includes("自有") || text.includes("鑷湁") ? 0 : 100;
}

function bindEvents() {
  authForm?.addEventListener("submit", handleLoginSubmit);
  authSettingsBtn?.addEventListener("click", openAuthSettingsDialog);
  closeAuthSettingsBtn?.addEventListener("click", () => {
    if (authSettingsDialog?.open) {
      authSettingsDialog.close();
    }
  });
  authSettingsForm?.addEventListener("submit", handleAuthSettingsSubmit);
  logoutBtn?.addEventListener("click", handleLogout);
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  document.querySelectorAll(".mobile-tab").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  document.querySelectorAll("[data-view-jump]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.viewJump));
  });

  prevStepBtn.addEventListener("click", () => changeFormStep(-1));
  nextStepBtn.addEventListener("click", () => changeFormStep(1));
  addFundingSourceBtn.addEventListener("click", () => {
    renderFundingSourcesEditor([...readFundingSourcesFromForm(), createEmptyFundingSource()]);
  });

  loanForm.addEventListener("input", handleFundingInputChange);
  loanForm.addEventListener("click", handleFundingInputChange);
  loanForm.addEventListener("submit", handleLoanSubmit);
  interestModeSelect?.addEventListener("change", syncInterestModeUI);
  toggleAdvancedBtn?.addEventListener("click", () => {
    advancedExpanded = !advancedExpanded;
    syncAdvancedUI();
  });
  searchInput.addEventListener("input", renderLoansTable);
  loanFilterBar?.querySelectorAll("[data-loan-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      currentLoanFilter = button.dataset.loanFilter;
      syncLoanFilterUI();
      renderLoansTable();
    });
  });
  reminderRangeSelect?.addEventListener("change", () => {
    reminderRangeDays = Number(reminderRangeSelect.value || 30);
    renderReminderCenter();
  });

  document.querySelector("#seed-data-btn").addEventListener("click", () => {
    state = { loans: structuredClone(sampleLoans).map(normalizeLoan), auth: normalizeAuthConfig(state.auth) };
    saveState();
    render();
  });

  document.querySelector("#export-btn").addEventListener("click", exportData);
  document.querySelector("#export-loans-csv-btn")?.addEventListener("click", exportLoansCsv);
  document.querySelector("#export-funders-csv-btn")?.addEventListener("click", exportFundersCsv);
  document.querySelector("#export-schedules-csv-btn")?.addEventListener("click", exportSchedulesCsv);
  document.querySelector("#notify-btn").addEventListener("click", requestNotificationPermission);
  document.querySelector("#close-dialog-btn").addEventListener("click", () => {
    if (detailDialog.open) {
      detailDialog.close();
    }
  });
  recordPrincipalBtn?.addEventListener("click", handleRecordPrincipal);
  earlySettleBtn?.addEventListener("click", handleEarlySettlement);
  extendLoanBtn?.addEventListener("click", handleExtendLoan);

  window.addEventListener("resize", syncResponsiveState);
}

function handleFundingInputChange(event) {
  if (event.target.matches("[data-funding-remove]")) {
    const id = event.target.dataset.fundingRemove;
    const nextRows = readFundingSourcesFromForm().filter((item) => item.id !== id);
    renderFundingSourcesEditor(nextRows.length ? nextRows : [createEmptyFundingSource()]);
    return;
  }
  updateFundingTotalNote();
}

function handleLoanSubmit(event) {
  event.preventDefault();

  const firstInvalidStep = getFirstInvalidStepIndex();
  if (firstInvalidStep !== -1) {
    formStepIndex = firstInvalidStep;
    syncResponsiveState();
    const invalidField = getStepFields(formSteps[firstInvalidStep]).find((field) => !field.checkValidity());
    if (invalidField) {
      invalidField.reportValidity();
      invalidField.focus();
    }
    return;
  }

  const fundingSources = buildFundingSourcesPayload();
  if (!fundingSources) {
    formStepIndex = 2;
    syncResponsiveState();
    return;
  }

  const formData = new FormData(loanForm);
  const payload = Object.fromEntries(formData.entries());
  payload.fundingSources = fundingSources;

  if (payload.interestMode === "custom" && !parseCustomSchedule(payload.customSchedule).length) {
    window.alert("自定义节点至少需要一行有效数据，例如：2026-05-15,1500,0");
    return;
  }

  const loan = createLoan(payload);
  if (editingLoanId) {
    const index = state.loans.findIndex((item) => item.id === editingLoanId);
    if (index !== -1) {
      const existing = state.loans[index];
      loan.id = existing.id;
      loan.createdAt = existing.createdAt || todayString();
      loan.extensions = existing.extensions || [];
      state.loans[index] = normalizeLoan(loan);
    }
  } else {
    state.loans.unshift(loan);
  }
  saveState();
  loanForm.reset();
  editingLoanId = null;
  advancedExpanded = false;
  formStepIndex = 0;
  renderFundingSourcesEditor();
  setDefaultDates();
  submitLoanBtn.textContent = "保存借款并生成收款计划";
  render();
}

function setDefaultDates() {
  const today = todayString();
  const nextMonth = addMonths(today, 1);
  loanForm.elements.startDate.value = loanForm.elements.startDate.value || today;
  loanForm.elements.firstDueDate.value = loanForm.elements.firstDueDate.value || nextMonth;
  if (loanForm.elements.reminderDays) {
    loanForm.elements.reminderDays.value = loanForm.elements.reminderDays.value || 3;
  }
  updateFundingTotalNote();
  syncInterestModeUI();
  syncAdvancedUI();
}

function syncInterestModeUI() {
  if (!interestModeSelect || !customScheduleWrap) {
    return;
  }
  const isCustom = interestModeSelect.value === "custom";
  customScheduleWrap.hidden = !isCustom;
  if (loanForm.elements.customSchedule) {
    loanForm.elements.customSchedule.required = isCustom;
  }
}

function syncAdvancedUI() {
  if (!advancedFields || !toggleAdvancedBtn) {
    return;
  }
  const isDesktop = window.innerWidth > 720;
  advancedFields.classList.toggle("is-collapsed", isDesktop && !advancedExpanded);
  toggleAdvancedBtn.textContent = advancedExpanded ? "收起高级设置" : "展开高级设置";
}

function isAuthenticated() {
  return sessionStorage.getItem(AUTH_SESSION_KEY) === "true";
}

function syncAuthUI() {
  const authenticated = isAuthenticated();
  document.body.classList.toggle("auth-locked", !authenticated);
  authOverlay?.classList.toggle("is-visible", !authenticated);
  if (authError) {
    authError.hidden = true;
  }
  if (!authenticated) {
    authForm?.reset();
    authForm?.elements.username?.focus();
  }
}

function handleLoginSubmit(event) {
  event.preventDefault();
  const formData = new FormData(authForm);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (username === state.auth.username && password === state.auth.password) {
    sessionStorage.setItem(AUTH_SESSION_KEY, "true");
    syncAuthUI();
    hydrateSharedState();
    render();
    notifyUpcomingIfAllowed();
    return;
  }

  if (authError) {
    authError.hidden = false;
  }
}

function openAuthSettingsDialog() {
  if (!authSettingsDialog || !authSettingsForm) {
    return;
  }
  authSettingsForm.reset();
  authSettingsForm.elements.currentUsername.value = state.auth.username;
  authSettingsForm.elements.newUsername.value = state.auth.username;
  if (authSettingsError) {
    authSettingsError.hidden = true;
    authSettingsError.textContent = "";
  }
  authSettingsDialog.showModal();
}

function handleAuthSettingsSubmit(event) {
  event.preventDefault();
  const formData = new FormData(authSettingsForm);
  const currentPassword = String(formData.get("currentPassword") || "");
  const newUsername = String(formData.get("newUsername") || "").trim();
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (currentPassword !== state.auth.password) {
    return showAuthSettingsError("当前密码不正确。");
  }
  if (!newUsername) {
    return showAuthSettingsError("新账号不能为空。");
  }
  if (newPassword.length < 4) {
    return showAuthSettingsError("新密码至少需要 4 位。");
  }
  if (newPassword !== confirmPassword) {
    return showAuthSettingsError("两次输入的新密码不一致。");
  }

  state.auth = normalizeAuthConfig({ username: newUsername, password: newPassword });
  saveState();
  if (authSettingsDialog?.open) {
    authSettingsDialog.close();
  }
  window.alert("账号设置已更新。下次登录请使用新的账号和密码。");
}

function showAuthSettingsError(message) {
  if (!authSettingsError) {
    return;
  }
  authSettingsError.hidden = false;
  authSettingsError.textContent = message;
}

function handleLogout() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  if (detailDialog?.open) {
    detailDialog.close();
  }
  syncAuthUI();
}

function createLoan(payload) {
  const principal = roundMoney(Number(payload.principal || 0));
  const annualRate = roundRate(Number(payload.annualRate || 0));
  const termMonths = Number(payload.termMonths || 0);
  const reminderDays = Number(payload.reminderDays || 0);
  const interestMode = normalizeInterestMode(payload.interestMode);
  const fundingSources = normalizeFundingSources(payload.fundingSources, principal);
  const monthlyFundingCost = sum(fundingSources.map((item) => monthlyCost(item.amount, item.annualCostRate)));
  const customSchedule = String(payload.customSchedule || "").trim();

  return normalizeLoan({
    id: crypto.randomUUID(),
    borrower: String(payload.borrower || "").trim(),
    principal,
    annualRate,
    startDate: payload.startDate,
    termMonths,
    firstDueDate: payload.firstDueDate,
    reminderDays,
    interestMode,
    customSchedule,
    status: payload.status || "active",
    notes: String(payload.notes || "").trim(),
    createdAt: todayString(),
    fundingSources,
    extensions: [],
    schedule: buildSchedulePlan({
      principal,
      annualRate,
      termMonths,
      startDate: payload.startDate,
      firstDueDate: payload.firstDueDate,
      interestMode,
      customSchedule,
      monthlyFundingCost,
      phase: "original",
      phaseLabel: "原合同"
    })
  });
}

function buildSchedulePlan(config) {
  if (config.interestMode === "custom") {
    return buildCustomSchedulePlan(config);
  }

  const monthlyInterest = roundMoney(config.principal * (config.annualRate / 100) / 12);
  return Array.from({ length: config.termMonths }, (_, index) => {
    const isLast = index === config.termMonths - 1;
    let interest = 0;

    if (config.interestMode === "monthly") {
      interest = monthlyInterest;
    } else if (config.interestMode === "quarterly" && ((index + 1) % 3 === 0 || isLast)) {
      const intervalMonths = isLast && config.termMonths % 3 !== 0 ? (config.termMonths % 3 || 3) : 3;
      interest = roundMoney(monthlyInterest * intervalMonths);
    } else if (config.interestMode === "maturity" && isLast) {
      interest = roundMoney(monthlyInterest * config.termMonths);
    } else if (config.interestMode === "advance_once" && index === 0) {
      interest = roundMoney(monthlyInterest * config.termMonths);
    }

    return createScheduleNode({
      period: index + 1,
      dueDate: addMonths(config.firstDueDate, index),
      interest,
      principalDue: isLast ? config.principal : 0,
      fundingCostExpected: config.monthlyFundingCost,
      phase: config.phase,
      phaseLabel: config.phaseLabel
    });
  });
}

function buildCustomSchedulePlan(config) {
  const rows = parseCustomSchedule(config.customSchedule);
  if (!rows.length) {
    return [createScheduleNode({
      period: 1,
      dueDate: config.firstDueDate || config.startDate,
      interest: roundMoney(config.principal * (config.annualRate / 100) / 12),
      principalDue: config.principal,
      fundingCostExpected: config.monthlyFundingCost,
      phase: config.phase,
      phaseLabel: config.phaseLabel
    })];
  }

  let previousDate = config.startDate;
  return rows.map((row, index) => {
    const monthsGap = Math.max(1, monthSpanBetween(previousDate, row.dueDate));
    previousDate = row.dueDate;
    return createScheduleNode({
      period: index + 1,
      dueDate: row.dueDate,
      interest: row.interest,
      principalDue: index === rows.length - 1 ? (row.principalDue || config.principal) : row.principalDue,
      fundingCostExpected: roundMoney(config.monthlyFundingCost * monthsGap),
      phase: config.phase,
      phaseLabel: config.phaseLabel
    });
  });
}

function createScheduleNode({ period, dueDate, interest, principalDue, fundingCostExpected, phase, phaseLabel }) {
  return {
    id: crypto.randomUUID(),
    period,
    dueDate,
    phase,
    phaseLabel,
    collectionKind: inferCollectionKind(interest, principalDue, fundingCostExpected),
    interest: roundMoney(interest),
    principalDue: roundMoney(principalDue),
    fundingCostExpected: roundMoney(fundingCostExpected),
    netInterestExpected: roundMoney(interest - fundingCostExpected),
    received: false,
    receivedDate: "",
    receivedInterestAmount: 0,
    receivedPrincipalAmount: 0,
    costPaid: false,
    costPaidDate: "",
    costPaidAmount: 0,
    shareholderPayouts: [],
    voided: false,
    voidReason: ""
  };
}

function parseCustomSchedule(input) {
  return String(input || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [dueDate, interest, principalDue] = line.split(",").map((part) => part?.trim() || "");
      return {
        dueDate,
        interest: roundMoney(Number(interest || 0)),
        principalDue: roundMoney(Number(principalDue || 0))
      };
    })
    .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate) && Number.isFinite(item.interest) && Number.isFinite(item.principalDue))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

async function hydrateSharedState() {
  if (!isSharedMode()) {
    return;
  }

  try {
    const response = await fetch(API_STATE_ENDPOINT, { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const remoteState = await response.json();
    if (remoteState?.loans) {
      state = {
        loans: remoteState.loans.map(normalizeLoan),
        auth: normalizeAuthConfig(remoteState.auth)
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      render();
    }
  } catch (error) {
    console.warn("Failed to load shared LAN data.", error);
  }
}

function persistSharedState() {
  if (!isSharedMode()) {
    return;
  }

  fetch(API_STATE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state)
  }).catch((error) => {
    console.warn("Failed to save shared LAN data.", error);
  });
}

function render() {
  renderMobileSummary();
  renderMetrics();
  renderUpcomingReminders();
  syncLoanFilterUI();
  renderLoansTable();
  renderFunders();
  renderReminderCenter();
  renderStats();
  syncResponsiveState();
  if (activeLoanId) {
    openDetail(activeLoanId);
  }
}

function syncLoanFilterUI() {
  loanFilterBar?.querySelectorAll("[data-loan-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.loanFilter === currentLoanFilter);
  });
}

function renderFundingSourcesEditor(rows = [createEmptyFundingSource()]) {
  fundingSourcesList.innerHTML = rows.map((row) => `
    <div class="funding-row">
      <label>
        资金名称
        <input type="text" data-funding-name data-funding-id="${row.id}" value="${escapeAttribute(row.name)}" placeholder="如：自有资金">
      </label>
      <label>
        资金金额
        <input type="number" min="0" step="0.01" data-funding-amount data-funding-id="${row.id}" value="${row.amount || ""}" placeholder="如：30000">
      </label>
      <label>
        成本年化(%)
        <input type="number" min="0" step="0.01" data-funding-rate data-funding-id="${row.id}" value="${row.annualCostRate || ""}" placeholder="如：6.5">
      </label>
      <label>
        股东分润(%)
        <input type="number" min="0" max="100" step="0.01" data-funding-share data-funding-id="${row.id}" value="${row.interestShareRate ?? defaultInterestShareRate(row.name)}" placeholder="如：80">
      </label>
      <button type="button" class="mini-btn funding-remove-btn" data-funding-remove="${row.id}">删除</button>
    </div>
  `).join("");
  updateFundingTotalNote();
}

function renderMobileSummary() {
  const dueToday = getDueCashSchedules().length;
  const costPending = getCostPendingSchedules().length;
  const nextReminder = getUpcomingReminderItems(3)[0];
  mobileSummary.innerHTML = `
    <article class="mobile-summary-card">
      <span class="eyebrow">今天待办</span>
      <strong>${dueToday}</strong>
      <small>${dueToday ? "有回款节点待处理" : "今天暂无紧急回款"}</small>
    </article>
    <article class="mobile-summary-card">
      <span class="eyebrow">待付成本</span>
      <strong>${costPending}</strong>
      <small>${costPending ? "有资金成本待支付" : "暂无待支付成本"}</small>
    </article>
    <article class="mobile-summary-card">
      <span class="eyebrow">最近提醒</span>
      <strong>${nextReminder ? nextReminder.loan.borrower : "空"}</strong>
      <small>${nextReminder ? `${nextReminder.schedule.dueDate} ${describeScheduleBrief(nextReminder.schedule)}` : "3 天内暂无新提醒"}</small>
    </article>
  `;
}

function renderMetrics() {
  const activeLoans = state.loans.filter((loan) => loan.status === "active");
  const currentMonthSchedules = getCurrentMonthSchedules();
  const totalPrincipal = sum(activeLoans.map((loan) => getOutstandingPrincipal(loan)));
  const monthExpected = sum(currentMonthSchedules.map((item) => item.schedule.interest));
  const monthCost = sum(currentMonthSchedules.map((item) => item.schedule.fundingCostExpected));
  const overdueCount = getOverdueSchedules().length;
  const receivedInterest = sum(getAllSchedules().filter((item) => item.schedule.received).map((item) => item.schedule.receivedInterestAmount || item.schedule.interest));
  const paidCost = sum(getAllSchedules().filter((item) => item.schedule.costPaid).map((item) => item.schedule.costPaidAmount || item.schedule.fundingCostExpected));
  const paidShareholderPayout = getTotalShareholderPayoutPaid();
  const netProfit = roundMoney(receivedInterest - paidCost - paidShareholderPayout);
  const metrics = [
    { label: "在贷本金", value: formatMoney(totalPrincipal), tone: "success" },
    { label: "本月应收利息", value: formatMoney(monthExpected), tone: "muted" },
    { label: "本月应付成本", value: formatMoney(monthCost), tone: "warn" },
    { label: "累计已收利息", value: formatMoney(receivedInterest), tone: "success" },
    { label: "累计已返股东", value: formatMoney(paidShareholderPayout), tone: "muted" },
    { label: "累计净利润", value: formatMoney(netProfit), tone: "success" },
    { label: "逾期笔数", value: `${overdueCount} 笔`, tone: overdueCount ? "danger" : "muted" }
  ];
  metricsGrid.innerHTML = metrics.map((metric) => `
    <article class="metric-card ${metric.tone}">
      <span>${metric.label}</span>
      <strong>${metric.value}</strong>
    </article>
  `).join("");
}

function renderLoansTable() {
  const keyword = searchInput.value.trim().toLowerCase();
  const loans = state.loans.filter((loan) => {
    const haystack = `${loan.borrower} ${loan.notes}`.toLowerCase();
    return haystack.includes(keyword) && matchesLoanFilter(loan);
  });

  loansTableBody.innerHTML = loans.length ? loans.map((loan) => {
    const nextSchedule = getNextPendingSchedule(loan);
    const receivedInterest = getLoanReceivedInterest(loan);
    const paidCost = getLoanPaidCost(loan);
    return `
      <tr>
        <td>${safe(loan.borrower)}</td>
        <td>${formatMoney(loan.principal)}</td>
        <td>${loan.annualRate}% / 成本 ${loan.weightedFundingCostRate}%</td>
        <td>${safe(loan.startDate)}</td>
        <td>${nextSchedule ? `${safe(nextSchedule.dueDate)} / ${safe(describeScheduleBrief(nextSchedule))}` : "-"}</td>
        <td><span class="chip">${statusLabel(loan.status)}</span></td>
        <td>${formatMoney(roundMoney(receivedInterest - paidCost))}</td>
        <td>
          <div class="table-actions">
            <button class="mini-btn" data-action="detail" data-loan-id="${loan.id}">详情</button>
            <button class="mini-btn" data-action="edit" data-loan-id="${loan.id}">编辑</button>
            <button class="mini-btn" data-action="toggle" data-loan-id="${loan.id}">${loan.status === "active" ? "结清" : "启用"}</button>
            <button class="mini-btn" data-action="delete" data-loan-id="${loan.id}">删除</button>
          </div>
        </td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="8">暂无符合条件的借款记录。</td></tr>`;

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleLoanAction(button.dataset.action, button.dataset.loanId));
  });

  loansCards.innerHTML = loans.length ? loans.map((loan) => {
    const nextSchedule = getNextPendingSchedule(loan);
    const netIncome = roundMoney(getLoanReceivedInterest(loan) - getLoanPaidCost(loan));
    return `
      <article class="mobile-loan-card">
        <div class="mobile-loan-head">
          <strong>${safe(loan.borrower)}</strong>
          <span class="chip">${statusLabel(loan.status)}</span>
        </div>
        <div class="mobile-loan-meta">
          <span>本金 <strong>${formatMoney(loan.principal)}</strong></span>
          <span>放贷 ${loan.annualRate}%</span>
        </div>
        <div class="mobile-loan-meta">
          <span>收息 ${interestModeLabel(loan.interestMode)}</span>
          <span>净收益 ${formatMoney(netIncome)}</span>
        </div>
        <div class="mobile-loan-meta">
          <span>下次 ${nextSchedule ? `${safe(nextSchedule.dueDate)} / ${safe(describeScheduleBrief(nextSchedule))}` : "暂无"}</span>
        </div>
        <div class="mobile-loan-actions">
          <button class="mini-btn" data-action="detail" data-loan-id="${loan.id}">详情</button>
          <button class="mini-btn" data-action="edit" data-loan-id="${loan.id}">编辑</button>
          <button class="mini-btn" data-action="toggle" data-loan-id="${loan.id}">${loan.status === "active" ? "结清" : "启用"}</button>
          <button class="mini-btn" data-action="delete" data-loan-id="${loan.id}">删除</button>
        </div>
      </article>
    `;
  }).join("") : renderEmpty("暂无借款记录", "你可以先从首页录入第一笔借款。");

  loansCards.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleLoanAction(button.dataset.action, button.dataset.loanId));
  });
}

function matchesLoanFilter(loan) {
  if (currentLoanFilter === "active") {
    return loan.status === "active";
  }
  if (currentLoanFilter === "closed") {
    return loan.status === "closed";
  }
  if (currentLoanFilter === "overdue") {
    return loan.status === "active" && loan.schedule.some((item) => !item.voided && !scheduleCashSettled(item) && isOverdue(item.dueDate));
  }
  if (currentLoanFilter === "due_7") {
    return loan.status === "active" && loan.schedule.some((item) => !item.voided && !scheduleCashSettled(item) && hasCashFlow(item) && isWithinDays(item.dueDate, 7));
  }
  return true;
}

function getStepFields(stepElement) {
  return Array.from(stepElement.querySelectorAll("input, select, textarea"))
    .filter((field) => !field.disabled && field.type !== "hidden");
}

function getFirstInvalidStepIndex() {
  for (let index = 0; index < formSteps.length; index += 1) {
    const invalidField = getStepFields(formSteps[index]).find((field) => !field.checkValidity());
    if (invalidField) {
      return index;
    }
  }
  return -1;
}

function changeFormStep(direction) {
  if (window.innerWidth > 720) {
    return;
  }

  const currentStep = formSteps[formStepIndex];
  if (direction > 0 && currentStep) {
    const invalidField = getStepFields(currentStep).find((field) => !field.checkValidity());
    if (invalidField) {
      invalidField.reportValidity();
      invalidField.focus();
      return;
    }
  }

  formStepIndex = Math.max(0, Math.min(formSteps.length - 1, formStepIndex + direction));
  syncResponsiveState();
}

function syncResponsiveState() {
  const isMobile = window.innerWidth <= 720;
  formSteps.forEach((step, index) => {
    step.classList.toggle("active", !isMobile || index === formStepIndex);
  });
  stepDots.forEach((dot, index) => {
    dot.classList.toggle("active", index <= formStepIndex || !isMobile);
  });

  if (isMobile) {
    prevStepBtn.hidden = formStepIndex === 0;
    nextStepBtn.hidden = formStepIndex === formSteps.length - 1;
    submitLoanBtn.hidden = formStepIndex !== formSteps.length - 1;
  } else {
    prevStepBtn.hidden = true;
    nextStepBtn.hidden = true;
    submitLoanBtn.hidden = false;
  }
  syncAdvancedUI();
}

function renderReminderCenter() {
  const dueItems = getDueCashSchedules();
  const upcomingItems = getUpcomingSchedules(reminderRangeDays);
  const costPending = getCostPendingSchedules();

  todayReminders.innerHTML = [
    ...(dueItems.length ? dueItems.map(renderReminderCard) : []),
    ...(costPending.length ? costPending.map(renderCostPendingCard) : [])
  ].join("") || renderEmpty("今天没有到期应收", "如果有已到成本日但未支付的资金成本，也会在这里提示。");

  monthPlan.innerHTML = upcomingItems.length
    ? upcomingItems.map(renderReminderCard).join("")
    : renderEmpty(`未来 ${reminderRangeDays} 天没有新计划`, "录入更多借款后，这里会形成完整的月度节奏。");

  bindReminderActions();
}

function renderFunders() {
  const funders = buildFunderMetrics();
  funderSummary.innerHTML = funders.length
    ? funders.map((item) => `
      <article class="stats-card">
        <div class="stats-row">
          <strong>${safe(item.name)}</strong>
          <span class="badge muted">${formatMoney(item.allocatedAmount)}</span>
        </div>
        <p>当前占用 ${formatMoney(item.activeAmount)} / 成本年化 ${item.weightedCostRate}% / 分润 ${item.weightedShareRate}%</p>
        <p>累计成本 ${formatMoney(item.expectedCost)} / 应返 ${formatMoney(item.duePayout)} / 已返 ${formatMoney(item.paidPayout)}</p>
      </article>
    `).join("")
    : renderEmpty("暂无资金方数据", "录入贷款并填写资金来源后，这里会自动汇总。");
  funderBreakdown.innerHTML = funders.length
    ? funders.map((item) => `
      <article class="list-item">
        <strong>${safe(item.name)}</strong>
        <p>当前占用 ${formatMoney(item.activeAmount)}，历史配置 ${formatMoney(item.allocatedAmount)}</p>
        <p>平均成本 ${item.weightedCostRate}% ，平均分润 ${item.weightedShareRate}% ，预计累计成本 ${formatMoney(item.expectedCost)}</p>
        <p>股东返还：应返 ${formatMoney(item.duePayout)} / 已返 ${formatMoney(item.paidPayout)} / 未返 ${formatMoney(item.pendingPayout)}</p>
        <p>涉及贷款：${safe(item.loanNames.join("、") || "无")}</p>
      </article>
    `).join("")
    : renderEmpty("暂无拆借明细", "录入贷款并配置资金来源后，这里会显示资金方详情。");
}

function renderStats() {
  const monthBuckets = buildMonthlyBuckets();
  monthlyStats.innerHTML = monthBuckets.length
    ? monthBuckets.map((bucket) => {
      const ratio = bucket.expectedInterest ? Math.min(100, Math.round(((bucket.paidCost + bucket.paidPayout) / bucket.expectedInterest) * 100)) : 0;
      const netProfit = roundMoney(bucket.receivedInterest - bucket.paidCost - bucket.paidPayout);
      return `
        <article class="stats-card">
          <div class="stats-row">
            <strong>${bucket.label}</strong>
            <span>净 ${formatMoney(netProfit)}</span>
          </div>
          <p>收 ${formatMoney(bucket.receivedInterest)} / 付成本 ${formatMoney(bucket.paidCost)} / 返股东 ${formatMoney(bucket.paidPayout)}</p>
          <p>应收 ${formatMoney(bucket.expectedInterest)} / 应返股东 ${formatMoney(bucket.duePayout)}</p>
          <div class="progress"><span style="width:${ratio}%"></span></div>
        </article>
      `;
    }).join("")
    : renderEmpty("暂无统计数据", "录入贷款后会自动生成收支趋势。");
  const totalPaidCost = sum(getAllSchedules().filter((item) => item.schedule.costPaid).map((item) => item.schedule.costPaidAmount || item.schedule.fundingCostExpected));
  const totalReceivedInterest = sum(getAllSchedules().filter((item) => item.schedule.received).map((item) => item.schedule.receivedInterestAmount || item.schedule.interest));
  const totalShareholderDue = roundMoney(sum(state.loans.map((loan) => getLoanShareholderPayoutDue(loan))));
  const totalShareholderPaid = getTotalShareholderPayoutPaid();
  const overview = [
    { label: "执行中的贷款", value: state.loans.filter((loan) => loan.status === "active").length, tone: "success" },
    { label: "待付成本", value: getCostPendingSchedules().length, tone: "warn" },
    { label: "逾期未收", value: getOverdueSchedules().length, tone: "danger" },
    { label: "累计已付成本", value: formatMoney(totalPaidCost), tone: "muted" },
    { label: "股东应返", value: formatMoney(totalShareholderDue), tone: "warn" },
    { label: "股东已返", value: formatMoney(totalShareholderPaid), tone: "muted" },
    { label: "累计净利润", value: formatMoney(roundMoney(totalReceivedInterest - totalPaidCost - totalShareholderPaid)), tone: "success" }
  ];
  statusStats.innerHTML = overview.map((item) => `
    <article class="stats-card">
      <div class="stats-row">
        <strong>${item.label}</strong>
        <span class="badge ${item.tone}">${item.value}</span>
      </div>
    </article>
  `).join("");
}

function handleLoanAction(action, loanId) {
  const loan = state.loans.find((item) => item.id === loanId);
  if (!loan) {
    return;
  }

  if (action === "detail") {
    openDetail(loanId);
    return;
  }

  if (action === "edit") {
    beginEditLoan(loan);
    return;
  }

  if (action === "toggle") {
    loan.status = loan.status === "active" ? "closed" : "active";
    saveState();
    render();
    return;
  }

  if (action === "delete") {
    const confirmed = window.confirm(`确认删除借款人“${loan.borrower}”的整笔记录吗？`);
    if (!confirmed) {
      return;
    }
    state.loans = state.loans.filter((item) => item.id !== loanId);
    if (activeLoanId === loanId) {
      activeLoanId = null;
      if (detailDialog.open) {
        detailDialog.close();
      }
    }
    saveState();
    render();
  }
}

function beginEditLoan(loan) {
  editingLoanId = loan.id;
  advancedExpanded = true;
  loanForm.elements.borrower.value = loan.borrower || "";
  loanForm.elements.principal.value = loan.principal || "";
  loanForm.elements.annualRate.value = loan.annualRate || "";
  loanForm.elements.startDate.value = loan.startDate || "";
  loanForm.elements.termMonths.value = loan.termMonths || "";
  loanForm.elements.firstDueDate.value = loan.firstDueDate || "";
  loanForm.elements.reminderDays.value = loan.reminderDays || 0;
  loanForm.elements.interestMode.value = loan.interestMode || "monthly";
  loanForm.elements.customSchedule.value = loan.customSchedule || "";
  loanForm.elements.status.value = loan.status || "active";
  loanForm.elements.notes.value = loan.notes || "";
  renderFundingSourcesEditor(loan.fundingSources.map((item) => ({
    id: item.id || crypto.randomUUID(),
    name: item.name,
    amount: item.amount,
    annualCostRate: item.annualCostRate
  })));
  syncInterestModeUI();
  updateFundingTotalNote();
  formStepIndex = 0;
  switchView("dashboard");
  syncResponsiveState();
  submitLoanBtn.textContent = "保存借款修改";
  loanForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openDetail(loanId) {
  const loan = state.loans.find((item) => item.id === loanId);
  if (!loan) {
    return;
  }

  activeLoanId = loanId;
  detailTitle.textContent = `${loan.borrower} / ${formatMoney(loan.principal)}`;

  const receivedInterest = getLoanReceivedInterest(loan);
  const paidCost = getLoanPaidCost(loan);
  const nextPending = getNextPendingSchedule(loan);
  const fundingSummary = loan.fundingSources.map((item) => `${item.name} ${formatMoney(item.amount)} / ${item.annualCostRate}%`).join("，");
  const summaryFields = [
    ["放贷年化", `${loan.annualRate}%`],
    ["收息方式", interestModeLabel(loan.interestMode)],
    ["资金成本年化", `${loan.weightedFundingCostRate}%`],
    ["起息日期", loan.startDate],
    ["首次收款日", loan.firstDueDate],
    ["期限", `${loan.termMonths} 个月`],
    ["状态", statusLabel(loan.status)],
    ["月均资金成本", formatMoney(loan.monthlyFundingCost)],
    ["累计净收益", formatMoney(roundMoney(receivedInterest - paidCost))],
    ["下次节点", nextPending ? `${nextPending.dueDate} / ${describeScheduleBrief(nextPending)}` : "无待处理"],
    ["资金构成", fundingSummary || "-"],
    ["备注", loan.notes || "-"]
  ];

  detailSummary.innerHTML = summaryFields.map(([label, value]) => `
    <div class="detail-item">
      <strong>${label}</strong>
      <span>${safe(value)}</span>
    </div>
  `).join("");

  extensionList.innerHTML = loan.extensions.length
    ? loan.extensions.map((extension, index) => `
      <article class="schedule-card">
        <strong>第 ${index + 1} 次展期</strong>
        <span>展期生效：${safe(extension.startDate || extension.extensionDate)}</span>
        <span>展期期限：${safe(String(extension.termMonths))} 个月</span>
        <span>新利率：${safe(String(extension.annualRate))}%</span>
        <span>新收息方式：${safe(interestModeLabel(extension.interestMode))}</span>
        <span>首次收款：${safe(extension.firstDueDate || "-")}</span>
        <span>备注：${safe(extension.notes || "-")}</span>
      </article>
    `).join("")
    : renderEmpty("暂无展期记录", "后续如果借款到期续借，可以在这里看到每次展期条件。");

  scheduleList.innerHTML = loan.schedule.map((item) => {
    const cashState = item.voided ? "muted" : scheduleCashSettled(item) ? "success" : isOverdue(item.dueDate) ? "danger" : isDueToday(item.dueDate) ? "warn" : "muted";
    const cashLabel = item.voided ? "已作废" : scheduleCashSettled(item) ? "已登记回款" : isOverdue(item.dueDate) ? "已逾期" : isDueToday(item.dueDate) ? "今天到期" : "未到期";
    const costTone = item.voided ? "muted" : item.costPaid ? "success" : isCostPending(item) ? "warn" : "muted";
    const costLabel = item.voided ? "无需支付" : item.costPaid ? "成本已付" : isCostPending(item) ? "待付成本" : "未到成本日";
    const amountSummary = buildScheduleAmountSummary(item);
    return `
      <article class="schedule-card">
        <div class="schedule-card-top">
          <div>
            <strong>${safe(item.phaseLabel)} / 第 ${item.period} 节点</strong>
            <span>${safe(item.dueDate)} · ${safe(collectionKindLabel(item.collectionKind))}</span>
          </div>
          <strong class="schedule-amount">${safe(amountSummary)}</strong>
        </div>
        <p>资金成本 ${formatMoney(item.fundingCostExpected)} / 预计净收益 ${formatMoney(item.netInterestExpected)}</p>
        <div class="status-line">
          <span class="badge ${cashState}">${cashLabel}</span>
          <span class="badge ${costTone}">${costLabel}</span>
          ${item.receivedDate ? `<span class="badge muted">回款：${safe(item.receivedDate)} / 息${formatMoney(item.receivedInterestAmount || item.interest)} / 本${formatMoney(item.receivedPrincipalAmount || item.principalDue)}</span>` : ""}
          ${item.costPaidDate ? `<span class="badge muted">付成本：${safe(item.costPaidDate)} / ${formatMoney(item.costPaidAmount || item.fundingCostExpected)}</span>` : ""}
          ${item.voided ? `<span class="badge muted">${safe(item.voidReason || "展期替换")}</span>` : ""}
        </div>
        <div class="schedule-actions">
          <button class="mini-btn is-primary" data-schedule-action="receive" data-loan-id="${loan.id}" data-schedule-id="${item.id}" ${item.voided || scheduleCashSettled(item) || (!item.interest && !item.principalDue) ? "disabled" : ""}>登记回款</button>
          <button class="mini-btn" data-schedule-action="pay-cost" data-loan-id="${loan.id}" data-schedule-id="${item.id}" ${item.voided || item.costPaid || !item.fundingCostExpected ? "disabled" : ""}>登记付成本</button>
          <button class="mini-btn" data-schedule-action="undo-cost" data-loan-id="${loan.id}" data-schedule-id="${item.id}" ${item.costPaid ? "" : "disabled"}>撤销付成本</button>
          <button class="mini-btn" data-schedule-action="undo-receive" data-loan-id="${loan.id}" data-schedule-id="${item.id}" ${item.received ? "" : "disabled"}>撤销回款</button>
        </div>
      </article>
    `;
  }).join("");

  bindScheduleActions();

  if (!detailDialog.open) {
    detailDialog.showModal();
  }
}

function bindReminderActions() {
  document.querySelectorAll("[data-reminder-loan-id]").forEach((button) => {
    button.addEventListener("click", () => openDetail(button.dataset.reminderLoanId));
  });
}

function bindScheduleActions() {
  document.querySelectorAll("[data-schedule-action]").forEach((button) => {
    button.addEventListener("click", () => {
      updateScheduleStatus(button.dataset.loanId, button.dataset.scheduleId, button.dataset.scheduleAction);
    });
  });
}

function updateScheduleStatus(loanId, scheduleId, action) {
  const loan = state.loans.find((item) => item.id === loanId);
  const schedule = loan?.schedule.find((item) => item.id === scheduleId);
  if (!loan || !schedule || schedule.voided) {
    return;
  }
  if (action === "receive") {
    const enteredInterest = window.prompt("请输入本次实际到账利息，直接回车按应收利息登记。", schedule.interest);
    if (enteredInterest === null) {
      return;
    }
    const enteredPrincipal = window.prompt("请输入本次实际回收本金，直接回车按应收本金登记。", schedule.principalDue);
    if (enteredPrincipal === null) {
      return;
    }
    const parsedInterest = enteredInterest === "" ? schedule.interest : Number(enteredInterest);
    const parsedPrincipal = enteredPrincipal === "" ? schedule.principalDue : Number(enteredPrincipal);
    if (!Number.isFinite(parsedInterest) || parsedInterest < 0 || !Number.isFinite(parsedPrincipal) || parsedPrincipal < 0) {
      window.alert("回款金额格式不正确，请输入有效数字。");
      return;
    }
    schedule.received = true;
    schedule.receivedInterestAmount = roundMoney(parsedInterest);
    schedule.receivedPrincipalAmount = roundMoney(parsedPrincipal);
    schedule.receivedDate = todayString();
  }
  if (action === "pay-cost") {
    const enteredAmount = window.prompt("请输入本次实际支付的资金成本，直接回车则按应付成本登记。", schedule.fundingCostExpected);
    if (enteredAmount === null) {
      return;
    }
    const parsedAmount = enteredAmount === "" ? schedule.fundingCostExpected : Number(enteredAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      window.alert("支付金额格式不正确，请输入有效数字。");
      return;
    }
    schedule.costPaid = true;
    schedule.costPaidAmount = roundMoney(parsedAmount);
    schedule.costPaidDate = todayString();
  }
  if (action === "pay-shareholder") {
    const plan = calculateScheduleShareholderPlan(loan, schedule);
    if (!plan.pendingAmount) {
      window.alert("当前没有待返还给股东的金额。");
      return;
    }
    schedule.shareholderPayouts = plan.items.map((item) => ({
      sourceId: item.sourceId,
      sourceName: item.sourceName,
      expectedAmount: item.dueAmount,
      paidAmount: item.dueAmount,
      paidDate: todayString(),
      paid: true
    }));
  }
  if (action === "undo-cost") {
    schedule.costPaid = false;
    schedule.costPaidAmount = 0;
    schedule.costPaidDate = "";
  }
  if (action === "undo-shareholder") {
    schedule.shareholderPayouts = [];
  }
  if (action === "undo-receive") {
    schedule.received = false;
    schedule.receivedInterestAmount = 0;
    schedule.receivedPrincipalAmount = 0;
    schedule.receivedDate = "";
    schedule.shareholderPayouts = [];
  }
  syncLoanStatus(loan);
  saveState();
  render();
}

function handleExtendLoan() {
  if (!activeLoanId) {
    return;
  }

  const loan = state.loans.find((item) => item.id === activeLoanId);
  if (!loan) {
    return;
  }

  const outstandingPrincipal = getOutstandingPrincipal(loan);
  if (outstandingPrincipal <= 0) {
    window.alert("这笔借款的本金已回收完成，不需要再展期。");
    return;
  }

  const startDate = window.prompt("请输入展期生效日期（YYYY-MM-DD）。", todayString());
  if (!startDate) {
    return;
  }

  const termMonths = Number(window.prompt("请输入展期期限（月）。", 3));
  if (!Number.isFinite(termMonths) || termMonths <= 0) {
    window.alert("展期期限必须是大于 0 的数字。");
    return;
  }

  const annualRate = Number(window.prompt("请输入展期后的年化利率（%）。", loan.annualRate));
  if (!Number.isFinite(annualRate) || annualRate < 0) {
    window.alert("利率格式不正确。");
    return;
  }

  const modeHint = "monthly=按月, quarterly=按季, advance_once=一次性, maturity=到期一次性, custom=自定义";
  const interestMode = normalizeInterestMode(window.prompt(`请输入展期后的收息方式代码：${modeHint}`, loan.interestMode));
  const firstDueDefault = interestMode === "advance_once" ? startDate : addMonths(startDate, interestMode === "quarterly" ? 3 : interestMode === "maturity" ? termMonths : 1);
  const firstDueDate = window.prompt("请输入展期后的首次收款日（YYYY-MM-DD）。", firstDueDefault);
  if (!firstDueDate) {
    return;
  }

  let customSchedule = "";
  if (interestMode === "custom") {
    customSchedule = window.prompt("请输入自定义节点，多行时可用换行，格式：YYYY-MM-DD,利息,本金", "") || "";
    if (!parseCustomSchedule(customSchedule).length) {
      window.alert("自定义节点格式无效。");
      return;
    }
  }

  const notes = window.prompt("请输入展期备注（可留空）。", "") || "";

  loan.schedule.forEach((item) => {
    if (!item.voided && !scheduleSettled(item) && item.dueDate >= startDate) {
      item.voided = true;
      item.voidReason = `已被 ${startDate} 展期替换`;
    }
  });

  const phaseIndex = loan.extensions.length + 1;
  const phaseLabel = `第 ${phaseIndex} 次展期`;
  const extensionSchedule = buildSchedulePlan({
    principal: outstandingPrincipal,
    annualRate,
    termMonths,
    startDate,
    firstDueDate,
    interestMode,
    customSchedule,
    monthlyFundingCost: loan.monthlyFundingCost,
    phase: `extension-${phaseIndex}`,
    phaseLabel
  });

  loan.extensions.push({
    id: crypto.randomUUID(),
    extensionDate: todayString(),
    startDate,
    termMonths,
    annualRate: roundRate(annualRate),
    interestMode,
    firstDueDate,
    notes
  });
  loan.schedule.push(...extensionSchedule);
  loan.interestMode = interestMode;
  loan.annualRate = roundRate(annualRate);
  loan.termMonths = termMonths;
  loan.firstDueDate = firstDueDate;
  loan.customSchedule = customSchedule;
  loan.status = "active";

  syncLoanStatus(loan);
  saveState();
  render();
}

function handleRecordPrincipal() {
  if (!activeLoanId) {
    return;
  }

  const loan = state.loans.find((item) => item.id === activeLoanId);
  if (!loan) {
    return;
  }

  const outstandingPrincipal = getOutstandingPrincipal(loan);
  if (outstandingPrincipal <= 0) {
    window.alert("这笔借款当前没有待回收本金。");
    return;
  }

  const enteredAmount = window.prompt("请输入本次实际回收本金。", outstandingPrincipal);
  if (enteredAmount === null) {
    return;
  }
  const amount = roundMoney(Number(enteredAmount));
  if (!Number.isFinite(amount) || amount <= 0) {
    window.alert("还本金額必须大于 0。");
    return;
  }
  if (amount > outstandingPrincipal) {
    window.alert(`本次最多只能登记 ${formatMoney(outstandingPrincipal)} 的本金。`);
    return;
  }

  const receivedDate = window.prompt("请输入回本日期（YYYY-MM-DD）。", todayString());
  if (!receivedDate) {
    return;
  }

  const note = window.prompt("请输入备注（可留空）。", "提前部分还本") || "";

  const settlementNode = createScheduleNode({
    period: getNextSchedulePeriod(loan),
    dueDate: receivedDate,
    interest: 0,
    principalDue: amount,
    fundingCostExpected: 0,
    phase: "principal-adjustment",
    phaseLabel: "临时还本"
  });
  settlementNode.received = true;
  settlementNode.receivedDate = receivedDate;
  settlementNode.receivedPrincipalAmount = amount;
  settlementNode.receivedInterestAmount = 0;
  settlementNode.collectionKind = "principal_only";
  settlementNode.voidReason = note;

  reduceFuturePrincipalSchedules(loan, amount);
  loan.schedule.push(settlementNode);
  syncLoanStatus(loan);
  saveState();
  render();
}

function handleEarlySettlement() {
  if (!activeLoanId) {
    return;
  }

  const loan = state.loans.find((item) => item.id === activeLoanId);
  if (!loan) {
    return;
  }

  const outstandingPrincipal = getOutstandingPrincipal(loan);
  const futureInterest = sum(
    loan.schedule
      .filter((item) => !item.voided && !item.received && item.dueDate >= todayString())
      .map((item) => item.interest)
  );

  const principalInput = window.prompt("请输入本次提前结清回收的本金。", outstandingPrincipal);
  if (principalInput === null) {
    return;
  }
  const principalAmount = roundMoney(Number(principalInput));
  if (!Number.isFinite(principalAmount) || principalAmount <= 0) {
    window.alert("结清本金必须大于 0。");
    return;
  }
  if (principalAmount !== outstandingPrincipal) {
    window.alert(`提前结清需要一次性结清全部剩余本金 ${formatMoney(outstandingPrincipal)}。如只回部分本金，请使用“登记还本”。`);
    return;
  }

  const interestInput = window.prompt("请输入本次提前结清实际收取的利息，可为 0。", futureInterest);
  if (interestInput === null) {
    return;
  }
  const interestAmount = roundMoney(Number(interestInput));
  if (!Number.isFinite(interestAmount) || interestAmount < 0) {
    window.alert("结清利息不能小于 0。");
    return;
  }

  const costInput = window.prompt("如本次同时结算资金成本，请输入金额；若没有请输入 0。", 0);
  if (costInput === null) {
    return;
  }
  const costAmount = roundMoney(Number(costInput));
  if (!Number.isFinite(costAmount) || costAmount < 0) {
    window.alert("成本金额不能小于 0。");
    return;
  }

  const settleDate = window.prompt("请输入提前结清日期（YYYY-MM-DD）。", todayString());
  if (!settleDate) {
    return;
  }

  const note = window.prompt("请输入结清备注（可留空）。", "提前结清") || "";

  loan.schedule.forEach((item) => {
    if (!item.voided && !item.received && item.dueDate >= settleDate) {
      item.voided = true;
      item.voidReason = `已于 ${settleDate} 提前结清`;
    }
  });

  const settlementNode = createScheduleNode({
    period: getNextSchedulePeriod(loan),
    dueDate: settleDate,
    interest: interestAmount,
    principalDue: principalAmount,
    fundingCostExpected: costAmount,
    phase: "early-settlement",
    phaseLabel: "提前结清"
  });
  settlementNode.received = true;
  settlementNode.receivedDate = settleDate;
  settlementNode.receivedInterestAmount = interestAmount;
  settlementNode.receivedPrincipalAmount = principalAmount;
  settlementNode.collectionKind = inferCollectionKind(interestAmount, principalAmount, costAmount);
  settlementNode.voidReason = note;

  if (costAmount > 0) {
    settlementNode.costPaid = true;
    settlementNode.costPaidDate = settleDate;
    settlementNode.costPaidAmount = costAmount;
  }

  loan.schedule.push(settlementNode);
  syncLoanStatus(loan);
  saveState();
  render();
}

function requestNotificationPermission() {
  if (!("Notification" in window)) {
    window.alert("当前浏览器不支持通知提醒。");
    return;
  }

  Notification.requestPermission().then((permission) => {
    if (permission === "granted") {
      notifyUpcomingIfAllowed(true);
      window.alert("提醒已开启。只要你打开这个页面，就会检查近期应收。");
    } else {
      window.alert("你暂时没有开启通知权限，可以稍后再试。");
    }
  });
}

function notifyUpcomingIfAllowed(force = false) {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const items = getUpcomingReminderItems(3);
  if (!items.length && !force) {
    return;
  }

  const content = items.length
    ? items.slice(0, 3).map((item) => `${item.loan.borrower} ${item.schedule.dueDate} ${describeScheduleBrief(item.schedule)}`).join("，")
    : "当前没有 3 天内的应收提醒。";

  new Notification("借贷项目提醒", { body: content });
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `借贷台账-${todayString()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportLoansCsv() {
  const headers = [
    "借款人",
    "本金",
    "剩余本金",
    "年化利率",
    "收息方式",
    "起息日期",
    "首次收款日",
    "期限(月)",
    "状态",
    "累计已收利息",
    "累计已付成本",
    "累计净收益",
    "资金来源",
    "备注"
  ];
  const rows = state.loans.map((loan) => [
    loan.borrower,
    loan.principal,
    getOutstandingPrincipal(loan),
    loan.annualRate,
    interestModeLabel(loan.interestMode),
    loan.startDate,
    loan.firstDueDate,
    loan.termMonths,
    statusLabel(loan.status),
    getLoanReceivedInterest(loan),
    getLoanPaidCost(loan),
    roundMoney(getLoanReceivedInterest(loan) - getLoanPaidCost(loan)),
    loan.fundingSources.map((item) => `${item.name}:${item.amount}@${item.annualCostRate}%`).join(" | "),
    loan.notes || ""
  ]);
  downloadCsv(`借款汇总-${todayString()}.csv`, [headers, ...rows]);
}

function exportFundersCsv() {
  const headers = [
    "资金方",
    "历史配置金额",
    "当前占用金额",
    "平均成本年化",
    "平均分润比例",
    "预计累计成本",
    "应返股东",
    "已返股东",
    "未返股东",
    "关联贷款数",
    "关联贷款人"
  ];
  const rows = buildFunderMetrics().map((item) => [
    item.name,
    item.allocatedAmount,
    item.activeAmount,
    item.weightedCostRate,
    item.weightedShareRate,
    item.expectedCost,
    item.duePayout,
    item.paidPayout,
    item.pendingPayout,
    item.loanCount,
    item.loanNames.join(" / ")
  ]);
  downloadCsv(`资金方汇总-${todayString()}.csv`, [headers, ...rows]);
}

function exportSchedulesCsv() {
  const headers = [
    "借款人",
    "阶段",
    "期数",
    "节点日期",
    "节点类型",
    "应收利息",
    "应收本金",
    "应付成本",
    "实收利息",
    "实收本金",
    "成本已付",
    "状态",
    "备注"
  ];
  const rows = state.loans.flatMap((loan) => loan.schedule.map((item) => [
    loan.borrower,
    item.phaseLabel,
    item.period,
    item.dueDate,
    collectionKindLabel(item.collectionKind),
    item.interest,
    item.principalDue,
    item.fundingCostExpected,
    item.receivedInterestAmount,
    item.receivedPrincipalAmount,
    item.costPaidAmount,
    item.voided ? "已作废" : scheduleSettled(item) ? "已完成" : scheduleCashSettled(item) ? "待付成本" : isOverdue(item.dueDate) ? "已逾期" : "待处理",
    item.voidReason || ""
  ]));
  downloadCsv(`收款计划-${todayString()}.csv`, [headers, ...rows]);
}

function downloadCsv(filename, rows) {
  const csvText = "\uFEFF" + rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function buildMonthlyBuckets() {
  const buckets = new Map();
  getAllSchedules().forEach(({ loan, schedule }) => {
    const label = schedule.dueDate.slice(0, 7);
    const plan = calculateScheduleShareholderPlan(loan, schedule);
    const current = buckets.get(label) || { label, expectedInterest: 0, expectedCost: 0, receivedInterest: 0, paidCost: 0, duePayout: 0, paidPayout: 0 };
    current.expectedInterest += schedule.interest;
    current.expectedCost += schedule.fundingCostExpected;
    current.receivedInterest += schedule.received ? (schedule.receivedInterestAmount || schedule.interest) : 0;
    current.paidCost += schedule.costPaid ? (schedule.costPaidAmount || schedule.fundingCostExpected) : 0;
    current.duePayout += plan.totalDue;
    current.paidPayout += plan.totalPaid;
    buckets.set(label, current);
  });
  return Array.from(buckets.values())
    .map((item) => ({
      ...item,
      expectedInterest: roundMoney(item.expectedInterest),
      expectedCost: roundMoney(item.expectedCost),
      receivedInterest: roundMoney(item.receivedInterest),
      paidCost: roundMoney(item.paidCost),
      duePayout: roundMoney(item.duePayout),
      paidPayout: roundMoney(item.paidPayout)
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(-6);
}

function getAllSchedules() {
  return state.loans.flatMap((loan) => loan.schedule.filter((schedule) => !schedule.voided).map((schedule) => ({ loan, schedule })));
}

function getCurrentMonthSchedules() {
  const currentMonth = todayString().slice(0, 7);
  return getAllSchedules().filter(({ schedule }) => schedule.dueDate.startsWith(currentMonth));
}

function getOverdueSchedules() {
  return getAllSchedules().filter(({ loan, schedule }) => loan.status === "active" && !scheduleCashSettled(schedule) && isOverdue(schedule.dueDate));
}

function getDueCashSchedules() {
  return getAllSchedules()
    .filter(({ loan, schedule }) => loan.status === "active" && !scheduleCashSettled(schedule) && hasCashFlow(schedule) && isDueTodayOrPast(schedule.dueDate))
    .sort((a, b) => a.schedule.dueDate.localeCompare(b.schedule.dueDate));
}

function getCostPendingSchedules() {
  return getAllSchedules()
    .filter(({ loan, schedule }) => loan.status === "active" && isCostPending(schedule))
    .sort((a, b) => a.schedule.dueDate.localeCompare(b.schedule.dueDate));
}

function getUpcomingSchedules(days) {
  return getAllSchedules()
    .filter(({ loan, schedule }) => loan.status === "active" && !scheduleCashSettled(schedule) && hasCashFlow(schedule) && isWithinDays(schedule.dueDate, days))
    .sort((a, b) => a.schedule.dueDate.localeCompare(b.schedule.dueDate));
}

function getUpcomingReminderItems(days) {
  return getAllSchedules()
    .filter(({ loan, schedule }) => loan.status === "active" && !scheduleCashSettled(schedule) && hasCashFlow(schedule) && isReminderWindow(schedule.dueDate, loan.reminderDays, days))
    .sort((a, b) => a.schedule.dueDate.localeCompare(b.schedule.dueDate));
}

function getNextPendingSchedule(loan) {
  return loan.schedule
    .filter((item) => !item.voided && (!scheduleCashSettled(item) || isCostPending(item)))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] || null;
}

function getLoanReceivedInterest(loan) {
  return sum(loan.schedule.filter((item) => !item.voided && item.received).map((item) => item.receivedInterestAmount || item.interest));
}

function getLoanPaidCost(loan) {
  return sum(loan.schedule.filter((item) => !item.voided && item.costPaid).map((item) => item.costPaidAmount || item.fundingCostExpected));
}

function calculateScheduleShareholderPlan(loan, schedule) {
  if (!schedule.received || schedule.voided) {
    return { items: [], totalDue: 0, totalPaid: 0, pendingAmount: 0 };
  }

  const principalBase = loan.principal || 1;
  const receivedInterest = roundMoney(schedule.receivedInterestAmount || schedule.interest || 0);
  const items = loan.fundingSources.map((source) => {
    const shareRate = roundRate(Number(source.interestShareRate ?? defaultInterestShareRate(source.name)));
    const allocatedInterest = roundMoney(receivedInterest * ((source.amount || 0) / principalBase));
    const dueAmount = roundMoney(allocatedInterest * (shareRate / 100));
    const paidRecord = (schedule.shareholderPayouts || []).find((item) => item.sourceId === source.id || item.sourceName === source.name);
    const paidAmount = roundMoney(Number(paidRecord?.paidAmount || 0));
    return {
      sourceId: source.id,
      sourceName: source.name,
      shareRate,
      allocatedInterest,
      dueAmount,
      paidAmount,
      paidDate: paidRecord?.paidDate || "",
      paid: Boolean(paidRecord?.paid)
    };
  }).filter((item) => item.dueAmount > 0 || item.paidAmount > 0);

  const totalDue = roundMoney(sum(items.map((item) => item.dueAmount)));
  const totalPaid = roundMoney(sum(items.map((item) => item.paidAmount)));
  return {
    items,
    totalDue,
    totalPaid,
    pendingAmount: roundMoney(Math.max(0, totalDue - totalPaid))
  };
}

function getLoanShareholderPayoutDue(loan) {
  return roundMoney(sum(loan.schedule.filter((item) => !item.voided).map((item) => calculateScheduleShareholderPlan(loan, item).totalDue)));
}

function getLoanShareholderPayoutPaid(loan) {
  return roundMoney(sum(loan.schedule.filter((item) => !item.voided).map((item) => calculateScheduleShareholderPlan(loan, item).totalPaid)));
}

function getTotalShareholderPayoutPaid() {
  return roundMoney(sum(state.loans.map((loan) => getLoanShareholderPayoutPaid(loan))));
}

function buildFunderMetrics() {
  const funderMap = new Map();

  state.loans.forEach((loan) => {
    const activePrincipal = getOutstandingPrincipal(loan);
    const principalRatioBase = loan.principal || 1;
    loan.fundingSources.forEach((source) => {
      const current = funderMap.get(source.name) || {
        name: source.name,
        allocatedAmount: 0,
        activeAmount: 0,
        weightedCostValue: 0,
        weightedShareValue: 0,
        expectedCost: 0,
        duePayout: 0,
        paidPayout: 0,
        loanNames: [],
        loanCount: 0
      };
      current.allocatedAmount += source.amount;
      current.activeAmount += roundMoney(activePrincipal * (source.amount / principalRatioBase));
      current.weightedCostValue += source.amount * source.annualCostRate;
      current.weightedShareValue += source.amount * (source.interestShareRate ?? defaultInterestShareRate(source.name));
      current.expectedCost += sum(
        loan.schedule
          .filter((item) => !item.voided)
          .map((item) => item.fundingCostExpected * (source.amount / principalRatioBase))
      );
      loan.schedule.filter((item) => !item.voided).forEach((schedule) => {
        const plan = calculateScheduleShareholderPlan(loan, schedule);
        const sourcePlan = plan.items.find((item) => item.sourceId === source.id || item.sourceName === source.name);
        if (sourcePlan) {
          current.duePayout += sourcePlan.dueAmount;
          current.paidPayout += sourcePlan.paidAmount;
        }
      });
      if (!current.loanNames.includes(loan.borrower)) {
        current.loanNames.push(loan.borrower);
        current.loanCount += 1;
      }
      funderMap.set(source.name, current);
    });
  });

  return Array.from(funderMap.values())
    .map((item) => ({
      ...item,
      allocatedAmount: roundMoney(item.allocatedAmount),
      activeAmount: roundMoney(item.activeAmount),
      expectedCost: roundMoney(item.expectedCost),
      duePayout: roundMoney(item.duePayout),
      paidPayout: roundMoney(item.paidPayout),
      pendingPayout: roundMoney(item.duePayout - item.paidPayout),
      weightedCostRate: roundRate(item.allocatedAmount ? item.weightedCostValue / item.allocatedAmount : 0),
      weightedShareRate: roundRate(item.allocatedAmount ? item.weightedShareValue / item.allocatedAmount : 0)
    }))
    .sort((a, b) => b.activeAmount - a.activeAmount || a.name.localeCompare(b.name, "zh-CN"));
}

function renderReminderCard(item) {
  const stateBadge = isOverdue(item.schedule.dueDate)
    ? badgeHtml("已逾期", "danger")
    : isDueToday(item.schedule.dueDate)
      ? badgeHtml("今天到期", "warn")
      : badgeHtml("即将到期", "muted");

  return `
    <article class="list-item todo-card">
      <div class="todo-card-top">
        <strong>${safe(item.loan.borrower)}</strong>
        ${stateBadge}
      </div>
      <p>节点日期：${safe(item.schedule.dueDate)}</p>
      <p>${safe(describeScheduleBrief(item.schedule))}</p>
      <p>${safe(item.loan.notes || "无备注")}</p>
      <div class="status-line">
        <button class="tag-btn" data-reminder-loan-id="${item.loan.id}">立即处理</button>
      </div>
    </article>
  `;
}

function renderCostPendingCard(item) {
  return `
    <article class="list-item todo-card">
      <div class="todo-card-top">
        <strong>${safe(item.loan.borrower)} / 成本待付</strong>
        ${badgeHtml("待付成本", "warn")}
      </div>
      <p>节点日期：${safe(item.schedule.dueDate)}</p>
      <p>应付资金成本 ${formatMoney(item.schedule.fundingCostExpected)}</p>
      <p>本节点应收利息 ${formatMoney(item.schedule.interest)}，预计净收益 ${formatMoney(item.schedule.netInterestExpected)}</p>
      <div class="status-line">
        <button class="tag-btn" data-reminder-loan-id="${item.loan.id}">去登记</button>
      </div>
    </article>
  `;
}

function renderEmpty(title, description) {
  return `<div class="list-item"><strong>${title}</strong><p>${description}</p></div>`;
}

function buildFundingSourcesPayload() {
  const principal = Number(loanForm.elements.principal.value || 0);
  const sources = readFundingSourcesFromForm()
    .map((item) => ({
      ...item,
      name: item.name.trim() || "资金来源",
      amount: roundMoney(Number(item.amount || 0)),
      annualCostRate: roundRate(Number(item.annualCostRate || 0))
    }))
    .filter((item) => item.amount > 0 || item.name.trim());

  const positiveSources = sources.filter((item) => item.amount > 0);
  const total = sum(positiveSources.map((item) => item.amount));

  if (!principal) {
    window.alert("请先填写借出本金。");
    return null;
  }

  if (!positiveSources.length) {
    return [{ name: "自有资金", amount: principal, annualCostRate: 0 }];
  }

  if (total > principal) {
    window.alert("资金构成金额合计不能大于借出本金。");
    return null;
  }

  return normalizeFundingSources(positiveSources, principal);
}

function readFundingSourcesFromForm() {
  return Array.from(fundingSourcesList.querySelectorAll(".funding-row")).map((row) => ({
    id: row.querySelector("[data-funding-id]").dataset.fundingId,
    name: row.querySelector("[data-funding-name]").value,
    amount: row.querySelector("[data-funding-amount]").value,
    annualCostRate: row.querySelector("[data-funding-rate]").value,
    interestShareRate: row.querySelector("[data-funding-share]")?.value
  }));
}

function updateFundingTotalNote() {
  const principal = Number(loanForm.elements.principal.value || 0);
  const rows = readFundingSourcesFromForm();
  const total = sum(rows.map((item) => Number(item.amount || 0)));
  const remainder = roundMoney(Math.max(0, principal - total));

  if (!principal) {
    fundingTotalNote.textContent = "先填写借出本金，再分配每笔资金来源。";
    return;
  }

  if (total > principal) {
    fundingTotalNote.textContent = `已填写 ${formatMoney(total)}，超出本金 ${formatMoney(total - principal)}。`;
    return;
  }

  fundingTotalNote.textContent = remainder
    ? `已分配 ${formatMoney(total)}，剩余 ${formatMoney(remainder)} 将默认按“自有资金 / 0 成本”补足。`
    : `资金构成已覆盖全部本金 ${formatMoney(principal)}。`;
}

function createEmptyFundingSource() {
  return {
    id: crypto.randomUUID(),
    name: "",
    amount: "",
    annualCostRate: "",
    interestShareRate: ""
  };
}

function switchView(view) {
  document.querySelectorAll(".view").forEach((element) => {
    element.classList.toggle("active", element.id === `${view}-view`);
  });
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  document.querySelectorAll(".mobile-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
}

function syncLoanStatus(loan) {
  const activeNodes = loan.schedule.filter((item) => !item.voided);
  if (!activeNodes.length) {
    loan.status = "closed";
    return;
  }
  const allSettled = activeNodes.every(scheduleSettled);
  if (allSettled) {
    loan.status = "closed";
  } else if (loan.status === "closed") {
    loan.status = "active";
  }
}

function scheduleCashSettled(schedule) {
  return !hasCashFlow(schedule) || schedule.received;
}

function scheduleSettled(schedule) {
  return scheduleCashSettled(schedule) && (!schedule.fundingCostExpected || schedule.costPaid);
}

function hasCashFlow(schedule) {
  return schedule.interest > 0 || schedule.principalDue > 0;
}

function isCostPending(schedule) {
  return !schedule.voided && schedule.fundingCostExpected > 0 && !schedule.costPaid && isDueTodayOrPast(schedule.dueDate);
}

function getOutstandingPrincipal(loan) {
  const repaidPrincipal = sum(loan.schedule.filter((item) => !item.voided && item.received).map((item) => item.receivedPrincipalAmount || 0));
  return roundMoney(Math.max(0, loan.principal - repaidPrincipal));
}

function reduceFuturePrincipalSchedules(loan, amount) {
  let remaining = amount;
  const principalNodes = loan.schedule
    .filter((item) => !item.voided && !item.received && item.principalDue > 0)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate) || b.period - a.period);

  principalNodes.forEach((item) => {
    if (remaining <= 0) {
      return;
    }
    const deduction = Math.min(item.principalDue, remaining);
    item.principalDue = roundMoney(item.principalDue - deduction);
    item.collectionKind = inferCollectionKind(item.interest, item.principalDue, item.fundingCostExpected);
    remaining = roundMoney(remaining - deduction);
  });
}

function getNextSchedulePeriod(loan) {
  return loan.schedule.reduce((max, item) => Math.max(max, Number(item.period || 0)), 0) + 1;
}

function describeScheduleBrief(schedule) {
  const parts = [];
  if (schedule.interest) {
    parts.push(`收息 ${formatMoney(schedule.interest)}`);
  }
  if (schedule.principalDue) {
    parts.push(`收本 ${formatMoney(schedule.principalDue)}`);
  }
  if (schedule.fundingCostExpected) {
    parts.push(`付成本 ${formatMoney(schedule.fundingCostExpected)}`);
  }
  return parts.join(" / ") || "仅状态节点";
}

function buildScheduleAmountSummary(schedule) {
  if (schedule.interest > 0 && schedule.principalDue > 0) {
    return `${formatMoney(schedule.interest + schedule.principalDue)} 本息合计`;
  }
  if (schedule.principalDue > 0) {
    return `${formatMoney(schedule.principalDue)} 本金`;
  }
  if (schedule.interest > 0) {
    return `${formatMoney(schedule.interest)} 利息`;
  }
  return "无现金流";
}

function inferCollectionKind(interest, principalDue, fundingCostExpected) {
  if (interest > 0 && principalDue > 0) {
    return "interest_principal";
  }
  if (principalDue > 0) {
    return "principal_only";
  }
  if (interest > 0) {
    return "interest_only";
  }
  if (fundingCostExpected > 0) {
    return "cost_only";
  }
  return "checkpoint";
}

function collectionKindLabel(kind) {
  const labels = {
    interest_principal: "本息同收",
    principal_only: "本金回收",
    interest_only: "利息回收",
    cost_only: "仅结算成本",
    checkpoint: "状态节点"
  };
  return labels[kind] || kind;
}

function interestModeLabel(mode) {
  const labels = {
    monthly: "按月收息",
    quarterly: "按季度收息",
    advance_once: "放款时一次性收息",
    maturity: "到期一次性收息",
    custom: "自定义节点"
  };
  return labels[mode] || mode;
}

function badgeHtml(text, tone) {
  return `<span class="badge ${tone}">${text}</span>`;
}

function monthlyCost(amount, annualCostRate) {
  return roundMoney(Number(amount || 0) * (Number(annualCostRate || 0) / 100) / 12);
}

function formatMoney(value) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2
  }).format(value || 0);
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function roundRate(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function sum(list) {
  return roundMoney(list.reduce((total, value) => total + Number(value || 0), 0));
}

function todayString() {
  const today = new Date();
  const timezoneOffset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function addMonths(dateString, months) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1 + months, day);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function monthSpanBetween(fromDate, toDate) {
  const [fromYear, fromMonth] = fromDate.split("-").map(Number);
  const [toYear, toMonth] = toDate.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

function daysBetween(dateString) {
  const target = new Date(`${dateString}T00:00:00`);
  const today = new Date(`${todayString()}T00:00:00`);
  return Math.round((target - today) / 86400000);
}

function isDueToday(dateString) {
  return daysBetween(dateString) === 0;
}

function isOverdue(dateString) {
  return daysBetween(dateString) < 0;
}

function isDueTodayOrPast(dateString) {
  return daysBetween(dateString) <= 0;
}

function isWithinDays(dateString, days) {
  const diff = daysBetween(dateString);
  return diff >= 0 && diff <= days;
}

function isReminderWindow(dateString, reminderDays, maxDays) {
  const diff = daysBetween(dateString);
  return diff >= 0 && diff <= Math.min(reminderDays || maxDays, maxDays);
}

function statusLabel(status) {
  const labels = {
    active: "执行中",
    paused: "暂缓",
    closed: "已结清"
  };
  return labels[status] || status;
}

function isSharedMode() {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

function escapeAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function safe(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
