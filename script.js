"use strict";

const STORAGE_KEY = "flightops-pro-accounting-v2";
const DEFAULT_STATE = {
  companyName: "Dixon Air Cargo",
  startingCapital: 2500000,
  activeMonth: "2026-01",
  transactions: [],
  monthlyHistory: []
};

const RECURRING_EXPENSES = [
  { description: "Aircraft Lease", category: "Aircraft Lease", amount: 220000 },
  { description: "Hangar", category: "Hangar", amount: 20000 },
  { description: "Payroll", category: "Payroll", amount: 115000 },
  { description: "Insurance", category: "Insurance", amount: 25000 },
  { description: "Maintenance Reserve", category: "Maintenance", amount: 100000 }
];

const currencyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
const dateFormatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

let state = loadState();

const dom = {
  navigationTabs: document.querySelectorAll("[data-page]"),
  pagePanels: document.querySelectorAll("[data-page-panel]"),
  transactionDialog: document.querySelector("#transaction-dialog"),
  transactionForm: document.querySelector("#transaction-form"),
  ledgerBody: document.querySelector("#ledger-table-body"),
  reportsBody: document.querySelector("#reports-table-body"),
  settingsForm: document.querySelector("#settings-form"),
  reportDialog: document.querySelector("#report-dialog")
};

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonthKey() {
  return localDateString().slice(0, 7);
}

function nextMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const nextMonth = new Date(year, month, 1);
  return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
}

function defaultDateForActiveMonth() {
  return state.activeMonth === currentMonthKey() ? localDateString() : `${state.activeMonth}-01`;
}

function createId() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatCurrency(value) {
  return currencyFormatter.format(Number(value) || 0);
}

function parseLocalDate(value) {
  return new Date(`${value}T12:00:00`);
}

function formatMonth(monthKey) {
  return monthFormatter.format(new Date(`${monthKey}-01T12:00:00`));
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

function isValidTransaction(transaction) {
  return transaction && typeof transaction.id === "string" && typeof transaction.description === "string" && /^\d{4}-\d{2}-\d{2}$/.test(transaction.date) && ["income", "expense"].includes(transaction.type) && Number(transaction.amount) > 0;
}

function normalizeTransaction(transaction) {
  const categoryAliases = { "Flight Revenue": "Revenue", Lease: "Aircraft Lease" };
  return {
    ...transaction,
    category: categoryAliases[transaction.category] || transaction.category,
    notes: typeof transaction.notes === "string" ? transaction.notes : "",
    accountingMonth: /^\d{4}-\d{2}$/.test(transaction.accountingMonth) ? transaction.accountingMonth : transaction.date.slice(0, 7)
  };
}

function isValidMonthlyRecord(record) {
  return record && /^\d{4}-\d{2}$/.test(record.month) && Number.isFinite(Number(record.revenue)) && Number.isFinite(Number(record.expenses)) && Number.isFinite(Number(record.profit));
}

function calculateCategoryBreakdown(transactions, type) {
  return transactions.filter((transaction) => transaction.type === type).reduce((breakdown, transaction) => {
    breakdown[transaction.category] = (breakdown[transaction.category] || 0) + Number(transaction.amount);
    return breakdown;
  }, {});
}

function normalizeMonthlyRecord(record, transactions) {
  const monthTransactions = transactions.filter((transaction) => transaction.accountingMonth === record.month);
  return {
    ...record,
    revenue: Number(record.revenue),
    expenses: Number(record.expenses),
    profit: Number(record.profit),
    revenueByCategory: record.revenueByCategory && typeof record.revenueByCategory === "object" ? record.revenueByCategory : calculateCategoryBreakdown(monthTransactions, "income"),
    expenseByCategory: record.expenseByCategory && typeof record.expenseByCategory === "object" ? record.expenseByCategory : calculateCategoryBreakdown(monthTransactions, "expense")
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.transactions)) return structuredClone(DEFAULT_STATE);
    const transactions = saved.transactions.filter(isValidTransaction).map(normalizeTransaction);
    return {
      companyName: typeof saved.companyName === "string" && saved.companyName.trim() ? saved.companyName.trim() : DEFAULT_STATE.companyName,
      startingCapital: Number(saved.startingCapital) >= 0 ? Number(saved.startingCapital) : DEFAULT_STATE.startingCapital,
      activeMonth: /^\d{4}-\d{2}$/.test(saved.activeMonth) ? saved.activeMonth : DEFAULT_STATE.activeMonth,
      transactions,
      monthlyHistory: Array.isArray(saved.monthlyHistory) ? saved.monthlyHistory.filter(isValidMonthlyRecord).map((record) => normalizeMonthlyRecord(record, transactions)) : []
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function transactionValue(transaction) {
  return transaction.type === "income" ? Number(transaction.amount) : -Number(transaction.amount);
}

function calculateTotals(transactions) {
  return transactions.reduce((totals, transaction) => {
    if (transaction.type === "income") totals.revenue += Number(transaction.amount);
    else totals.expenses += Number(transaction.amount);
    totals.profit = totals.revenue - totals.expenses;
    return totals;
  }, { revenue: 0, expenses: 0, profit: 0 });
}

function sortChronologically(transactions) {
  return [...transactions].sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt || a.id).localeCompare(String(b.createdAt || b.id)));
}

function sortNewestFirst(transactions) {
  return [...transactions].sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || b.id).localeCompare(String(a.createdAt || a.id)));
}

function getRunningBalances() {
  let balance = state.startingCapital;
  const balances = new Map();
  sortChronologically(state.transactions).forEach((transaction) => {
    balance += transactionValue(transaction);
    balances.set(transaction.id, balance);
  });
  return balances;
}

function showPage(pageName, updateHash = true) {
  const targetPage = document.querySelector(`[data-page-panel="${pageName}"]`);
  if (!targetPage) return;

  dom.pagePanels.forEach((page) => {
    const active = page.dataset.pagePanel === pageName;
    page.hidden = !active;
    page.classList.toggle("active", active);
  });
  dom.navigationTabs.forEach((tab) => {
    const active = tab.dataset.page === pageName;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  if (updateHash) history.replaceState(null, "", `#${pageName}`);
  document.title = `${targetPage.querySelector("h1").textContent} | FlightOps Pro`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderDashboard() {
  const monthKey = state.activeMonth;
  const monthlyTransactions = state.transactions.filter((transaction) => transaction.accountingMonth === monthKey);
  const monthly = calculateTotals(monthlyTransactions);
  const lifetime = calculateTotals(state.transactions);
  const cash = state.startingCapital + lifetime.profit;
  const margin = monthly.revenue ? (monthly.profit / monthly.revenue) * 100 : null;

  document.querySelector("#current-period").textContent = formatMonth(monthKey);
  document.querySelector("#cash-on-hand").textContent = formatCurrency(cash);
  document.querySelector("#starting-capital").textContent = formatCurrency(state.startingCapital);
  document.querySelector("#month-revenue").textContent = formatCurrency(monthly.revenue);
  document.querySelector("#month-expenses").textContent = formatCurrency(monthly.expenses);
  document.querySelector("#month-profit").textContent = formatCurrency(monthly.profit);
  document.querySelector("#month-margin").textContent = margin === null ? "No revenue posted" : `${margin.toFixed(1)}% operating margin`;
  document.querySelector("#profit-card").classList.toggle("positive", monthly.profit > 0);
  document.querySelector("#profit-card").classList.toggle("negative", monthly.profit < 0);

  const mostRecentMonth = [...state.monthlyHistory].sort((a, b) => b.month.localeCompare(a.month))[0];
  document.querySelector("#recent-month-profit").textContent = mostRecentMonth ? formatCurrency(mostRecentMonth.profit) : "—";
  document.querySelector("#recent-month-label").textContent = mostRecentMonth ? formatMonth(mostRecentMonth.month) : "No months closed";
  document.querySelector("#total-months-closed").textContent = state.monthlyHistory.length;
  document.querySelector("#recent-profit-card").classList.toggle("positive", Boolean(mostRecentMonth && mostRecentMonth.profit > 0));
  document.querySelector("#recent-profit-card").classList.toggle("negative", Boolean(mostRecentMonth && mostRecentMonth.profit < 0));

  const recent = sortNewestFirst(state.transactions).slice(0, 5);
  document.querySelector("#recent-transactions").innerHTML = recent.length ? recent.map((transaction) => {
    const date = parseLocalDate(transaction.date);
    return `<div class="activity-row"><div class="activity-date">${date.toLocaleString("en-US", { month: "short" })}<strong>${date.getDate()}</strong></div><div class="activity-copy"><strong>${escapeHtml(transaction.description)}</strong><small>${escapeHtml(transaction.category)} · ${transaction.type}</small></div><span class="amount ${transaction.type}">${transaction.type === "income" ? "+" : "−"}${formatCurrency(transaction.amount)}</span></div>`;
  }).join("") : `<div class="empty-state"><span class="empty-state-mark" aria-hidden="true">OPS</span><h3>No transactions posted</h3><p>Add a ledger transaction to begin tracking financial performance.</p></div>`;
}

function renderLedger() {
  const filter = document.querySelector("#ledger-filter").value;
  const archivedMonths = new Set(state.monthlyHistory.map((record) => record.month));
  const filteredTransactions = state.transactions.filter((transaction) => {
    if (filter === "current") return transaction.accountingMonth === state.activeMonth;
    if (filter === "archived") return archivedMonths.has(transaction.accountingMonth);
    return true;
  });
  const transactions = sortNewestFirst(filteredTransactions);
  const runningBalances = getRunningBalances();
  const currentBalance = state.startingCapital + calculateTotals(state.transactions).profit;
  document.querySelector("#ledger-count").textContent = transactions.length;
  document.querySelector("#ledger-balance").textContent = formatCurrency(currentBalance);
  document.querySelector("#ledger-empty").hidden = transactions.length > 0;
  dom.ledgerBody.innerHTML = transactions.map((transaction) => `<tr>
    <td>${dateFormatter.format(parseLocalDate(transaction.date))}</td>
    <td>${formatMonth(transaction.accountingMonth)}</td>
    <td class="transaction-description"><strong>${escapeHtml(transaction.description)}</strong>${transaction.notes ? `<small title="${escapeHtml(transaction.notes)}">${escapeHtml(transaction.notes)}</small>` : ""}</td>
    <td>${escapeHtml(transaction.category)}</td>
    <td><span class="type-badge ${transaction.type}">${transaction.type}</span></td>
    <td class="number-cell"><span class="amount ${transaction.type}">${transaction.type === "income" ? "+" : "−"}${formatCurrency(transaction.amount)}</span></td>
    <td class="number-cell">${formatCurrency(runningBalances.get(transaction.id))}</td>
    <td class="action-cell"><button class="row-button" type="button" data-edit-transaction="${transaction.id}">Edit</button><button class="row-button delete" type="button" data-delete-transaction="${transaction.id}">Delete</button></td>
  </tr>`).join("");
}

function renderReports() {
  const history = [...state.monthlyHistory].sort((a, b) => b.month.localeCompare(a.month));
  document.querySelector("#reports-empty").hidden = history.length > 0;
  dom.reportsBody.innerHTML = history.map((record) => {
    const profitClass = record.profit > 0 ? "profit-positive" : record.profit < 0 ? "profit-negative" : "";
    return `<tr><td><button class="month-link" type="button" data-report-month="${record.month}">${formatMonth(record.month)}</button></td><td class="number-cell profit-positive">${formatCurrency(record.revenue)}</td><td class="number-cell profit-negative">${formatCurrency(record.expenses)}</td><td class="number-cell ${profitClass}"><strong>${formatCurrency(record.profit)}</strong></td></tr>`;
  }).join("");
}

function renderSettings() {
  document.querySelector("#company-name").value = state.companyName;
  document.querySelector("#capital-input").value = state.startingCapital;
  document.querySelector("#brand-company-name").textContent = state.companyName;
}

function renderApplication() {
  renderDashboard();
  renderLedger();
  renderReports();
  renderSettings();
}

function persistAndRender() {
  saveState();
  renderApplication();
}

function openTransactionDialog(transaction = null) {
  dom.transactionForm.reset();
  document.querySelector("#transaction-dialog-title").textContent = transaction ? "Edit Transaction" : "Add Transaction";
  document.querySelector("#transaction-id").value = transaction?.id || "";
  document.querySelector("#transaction-description").value = transaction?.description || "";
  document.querySelector("#transaction-date").value = transaction?.date || defaultDateForActiveMonth();
  document.querySelector("#transaction-category").value = transaction?.category || "Revenue";
  document.querySelector("#transaction-amount").value = transaction?.amount || "";
  document.querySelector("#transaction-notes").value = transaction?.notes || "";
  document.querySelector("#transaction-accounting-month").textContent = formatMonth(transaction?.accountingMonth || state.activeMonth);
  document.querySelector(`input[name="transaction-type"][value="${transaction?.type || "income"}"]`).checked = true;
  dom.transactionDialog.showModal();
}

function saveTransaction(event) {
  event.preventDefault();
  const id = document.querySelector("#transaction-id").value;
  const existing = state.transactions.find((transaction) => transaction.id === id);
  const transaction = {
    id: id || createId(),
    description: document.querySelector("#transaction-description").value.trim(),
    date: document.querySelector("#transaction-date").value,
    category: document.querySelector("#transaction-category").value,
    type: document.querySelector('input[name="transaction-type"]:checked').value,
    amount: Number(document.querySelector("#transaction-amount").value),
    notes: document.querySelector("#transaction-notes").value.trim(),
    accountingMonth: existing?.accountingMonth || state.activeMonth,
    createdAt: existing?.createdAt || new Date().toISOString()
  };
  if (id) state.transactions = state.transactions.map((item) => item.id === id ? transaction : item);
  else state.transactions.push(transaction);
  persistAndRender();
  dom.transactionDialog.close();
  showToast(id ? "Transaction updated." : "Transaction added.");
}

function deleteTransaction(id) {
  const transaction = state.transactions.find((item) => item.id === id);
  if (!transaction || !window.confirm(`Delete “${transaction.description}”?`)) return;
  state.transactions = state.transactions.filter((item) => item.id !== id);
  persistAndRender();
  showToast("Transaction deleted.");
}

function processMonthlyExpenses() {
  const monthKey = state.activeMonth;
  const existingDescriptions = new Set(state.transactions.filter((transaction) => transaction.recurringMonth === monthKey).map((transaction) => transaction.description));
  const pending = RECURRING_EXPENSES.filter((expense) => !existingDescriptions.has(expense.description));
  if (!pending.length) {
    showToast(`Monthly expenses for ${formatMonth(monthKey)} have already been processed.`, true);
    return;
  }
  if (!window.confirm(`Post ${pending.length} recurring expenses totaling ${formatCurrency(pending.reduce((sum, item) => sum + item.amount, 0))} for ${formatMonth(monthKey)}?`)) return;
  const date = `${monthKey}-01`;
  pending.forEach((expense, index) => state.transactions.push({ id: createId(), ...expense, date, type: "expense", accountingMonth: monthKey, recurringMonth: monthKey, notes: "Monthly recurring expense", createdAt: `${new Date().toISOString()}-${index}` }));
  persistAndRender();
  showToast(`${pending.length} monthly expenses processed.`);
}

function closeMonth() {
  const monthKey = state.activeMonth;
  const monthTransactions = state.transactions.filter((transaction) => transaction.accountingMonth === monthKey);
  const totals = calculateTotals(monthTransactions);
  const confirmation = `Close ${formatMonth(monthKey)}?\n\nRevenue: ${formatCurrency(totals.revenue)}\nExpenses: ${formatCurrency(totals.expenses)}\nProfit/Loss: ${formatCurrency(totals.profit)}`;
  if (!window.confirm(confirmation)) return;

  state.monthlyHistory = state.monthlyHistory.filter((record) => record.month !== monthKey);
  state.monthlyHistory.push({
    month: monthKey,
    revenue: totals.revenue,
    expenses: totals.expenses,
    profit: totals.profit,
    revenueByCategory: calculateCategoryBreakdown(monthTransactions, "income"),
    expenseByCategory: calculateCategoryBreakdown(monthTransactions, "expense"),
    closedAt: new Date().toISOString()
  });
  state.activeMonth = nextMonthKey(monthKey);
  persistAndRender();
  showToast(`${formatMonth(monthKey)} closed. ${formatMonth(state.activeMonth)} is now active.`);
}

function renderBreakdown(breakdown) {
  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries.map(([category, amount]) => `<div class="breakdown-row"><span>${escapeHtml(category)}</span><strong>${formatCurrency(amount)}</strong></div>`).join("") : '<p class="breakdown-empty">No activity in this period.</p>';
}

function openMonthlyReport(monthKey) {
  const record = state.monthlyHistory.find((item) => item.month === monthKey);
  if (!record) return;
  document.querySelector("#report-dialog-title").textContent = formatMonth(record.month);
  document.querySelector("#report-revenue-breakdown").innerHTML = renderBreakdown(record.revenueByCategory);
  document.querySelector("#report-expense-breakdown").innerHTML = renderBreakdown(record.expenseByCategory);
  const net = document.querySelector("#report-net-profit");
  net.textContent = formatCurrency(record.profit);
  net.classList.toggle("profit-positive", record.profit > 0);
  net.classList.toggle("profit-negative", record.profit < 0);
  dom.reportDialog.showModal();
}

function saveSettingsAutomatically() {
  const companyName = document.querySelector("#company-name").value.trim();
  const startingCapital = Number(document.querySelector("#capital-input").value);
  if (!companyName || !Number.isFinite(startingCapital) || startingCapital < 0) return;
  state.companyName = companyName;
  state.startingCapital = startingCapital;
  persistAndRender();
  showToast("Settings saved automatically.");
}

function showToast(message, isError = false) {
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " error" : ""}`;
  toast.textContent = message;
  document.querySelector("#toast-region").append(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

dom.navigationTabs.forEach((tab) => tab.addEventListener("click", () => showPage(tab.dataset.page)));
document.querySelectorAll("[data-open-page]").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.openPage)));
window.addEventListener("hashchange", () => showPage(window.location.hash.slice(1) || "dashboard", false));
document.querySelector("#add-transaction-button").addEventListener("click", () => openTransactionDialog());
document.querySelector("#process-expenses-button").addEventListener("click", processMonthlyExpenses);
document.querySelector("#close-month-button").addEventListener("click", closeMonth);
document.querySelector("#ledger-filter").addEventListener("change", renderLedger);
document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
dom.transactionForm.addEventListener("submit", saveTransaction);
dom.settingsForm.addEventListener("change", saveSettingsAutomatically);
dom.settingsForm.addEventListener("submit", (event) => event.preventDefault());
dom.ledgerBody.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-transaction]");
  const deleteButton = event.target.closest("[data-delete-transaction]");
  if (editButton) openTransactionDialog(state.transactions.find((transaction) => transaction.id === editButton.dataset.editTransaction));
  if (deleteButton) deleteTransaction(deleteButton.dataset.deleteTransaction);
});
dom.reportsBody.addEventListener("click", (event) => {
  const reportButton = event.target.closest("[data-report-month]");
  if (reportButton) openMonthlyReport(reportButton.dataset.reportMonth);
});

renderApplication();
showPage(window.location.hash.slice(1) || "dashboard", false);
