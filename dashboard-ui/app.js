const state = {
    transactions: [],
    allTransactions: [],
    filter: "all",
    selectedId: null,
    activeTab: "add",
    selectedIds: new Set(),
    searchTerm: "",
    countryFilter: "all",
    currencyFilter: "all",
};

const DEFAULT_TRANSACTION = {
    accountId: "",
    merchant: "",
    amount: "",
    currency: "USD",
    country: "",
    homeCountry: "",
    paymentMethod: "card",
    transactionType: "purchase",
    transactionTimestamp: toLocalDateTime(new Date()),
};

const chartPalette = ["#7c3aed", "#38bdf8", "#34d399", "#fbbf24", "#fb7185", "#a78bfa"];
const form = document.getElementById("transactionForm");
const tableBody = document.getElementById("transactionsTableBody");
const detailPanel = document.getElementById("detailPanel");
const emptyState = document.getElementById("emptyState");
const chartCanvas = document.getElementById("transactionChart");
const chartTooltip = document.getElementById("chartTooltip");
const topCategories = document.getElementById("topCategories");
const formAlert = document.getElementById("formAlert");
const importAlert = document.getElementById("importAlert");
const importFileInput = document.getElementById("transactionFileInput");

const elements = {
    totalTransactions: document.getElementById("totalTransactions"),
    flaggedTransactions: document.getElementById("flaggedTransactions"),
    averageScore: document.getElementById("averageScore"),
    crossBorderTransactions: document.getElementById("crossBorderTransactions"),
    submitStatus: document.getElementById("submitStatus"),
    importStatus: document.getElementById("importStatus"),
    systemStatus: document.getElementById("systemStatus"),
    selectedFlag: document.getElementById("selectedFlag"),
    detailMerchant: document.getElementById("detailMerchant"),
    detailMeta: document.getElementById("detailMeta"),
    detailScore: document.getElementById("detailScore"),
    detailExplanation: document.getElementById("detailExplanation"),
    detailSource: document.getElementById("detailSource"),
    detailReasons: document.getElementById("detailReasons"),
    detailAccount: document.getElementById("detailAccount"),
    detailMethod: document.getElementById("detailMethod"),
    detailType: document.getElementById("detailType"),
    detailLocation: document.getElementById("detailLocation"),
};

const normalPreset = { ...DEFAULT_TRANSACTION };

function toLocalDateTime(date) {
    const offset = date.getTimezoneOffset();
    const adjusted = new Date(date.getTime() - offset * 60_000);
    return adjusted.toISOString().slice(0, 16);
}

function setFormValues(values) {
    Object.entries(values).forEach(([key, value]) => {
        if (form.elements[key]) {
            form.elements[key].value = value;
        }
    });
}

function updateSubmitStatus(label, tone) {
    if (!elements.submitStatus) {
        return;
    }

    elements.submitStatus.textContent = label;
    elements.submitStatus.className = `status-pill ${tone}`;
}

function updateImportStatus(label, tone) {
    if (!elements.importStatus) {
        return;
    }

    elements.importStatus.textContent = label;
    elements.importStatus.className = `status-pill ${tone}`;
}

function showFormAlert(message, tone) {
    if (!formAlert) {
        return;
    }

    formAlert.textContent = message;
    formAlert.className = `alert-banner visible ${tone}`;
}

function showImportAlert(message, tone) {
    if (!importAlert) {
        return;
    }

    importAlert.textContent = message;
    importAlert.className = `alert-banner visible ${tone}`;
}

function clearFormAlert() {
    if (!formAlert) {
        return;
    }

    formAlert.textContent = "";
    formAlert.className = "alert-banner";
}

function clearImportAlert() {
    if (!importAlert) {
        return;
    }

    importAlert.textContent = "";
    importAlert.className = "alert-banner";
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function fetchJson(url, options) {
    const response = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
        },
        ...options,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Request failed with status ${response.status}`);
    }

    return response.json();
}

async function loadHealth() {
    try {
        const health = await fetchJson("/api/health");
        const explanationMode = health.explanationMode
            ? `${prettifyValue(health.explanationMode)} explanations`
            : "stack online";
        elements.systemStatus.textContent = `All systems operational • ${explanationMode}`;
    } catch {
        elements.systemStatus.textContent = "Backend unavailable";
    }
}

async function loadTransactions() {
    tableBody.innerHTML = `<tr><td colspan="6" class="loading-row">Loading transactions...</td></tr>`;

    try {
        const allTransactions = await fetchJson("/api/v1/transactions");
        state.allTransactions = allTransactions;
        populateCountryFilter();
        populateCurrencyFilter();

        const filteredTransactions = state.filter === "flagged"
            ? allTransactions.filter((transaction) => transaction.flagged)
            : allTransactions;

        state.transactions = filteredTransactions;

        if (!filteredTransactions.some((transaction) => transaction.id === state.selectedId)) {
            state.selectedId = null;
        }

        renderMetrics();
        renderTable();
        renderDetail();
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="6" class="loading-row">Unable to load transactions.</td></tr>`;
        state.allTransactions = [];
        state.transactions = [];
        renderMetrics();
        elements.systemStatus.textContent = "Backend unavailable";
        console.error(error);
    }
}

function getChartTransactions() {
    return state.allTransactions.length > 0 ? state.allTransactions : state.transactions;
}

function renderMetrics() {
    const transactions = getChartTransactions();
    const total = transactions.length;
    const flagged = transactions.filter((transaction) => transaction.flagged).length;
    const average = total === 0
        ? 0
        : transactions.reduce((sum, transaction) => sum + transaction.anomalyScore, 0) / total;
    const crossBorder = transactions.filter(
        (transaction) => String(transaction.country || "").toUpperCase() !== String(transaction.homeCountry || "").toUpperCase()
    ).length;

    elements.totalTransactions.textContent = String(total);
    elements.flaggedTransactions.textContent = String(flagged);
    elements.averageScore.textContent = average.toFixed(2);
    elements.crossBorderTransactions.textContent = String(crossBorder);
    renderTransactionChart();
    renderTopFlaggedCategories();
}

function renderTransactionChart() {
    if (!chartCanvas) {
        return;
    }

    const ctx = chartCanvas.getContext("2d");
    if (!ctx) {
        return;
    }

    const transactions = getChartTransactions();
    const timeline = {};
    transactions.forEach((transaction) => {
        const date = new Date(transaction.transactionTimestamp);
        if (Number.isNaN(date.getTime())) {
            return;
        }
        const key = date.toISOString().slice(0, 10);
        if (!timeline[key]) {
            timeline[key] = { total: 0, flagged: 0 };
        }
        timeline[key].total += 1;
        timeline[key].flagged += transaction.flagged ? 1 : 0;
    });

    const labels = Object.keys(timeline).sort();
    const totals = labels.map((label) => timeline[label].total);
    const flaggedValues = labels.map((label) => timeline[label].flagged);

    const width = chartCanvas.clientWidth || 620;
    const height = chartCanvas.clientHeight || 280;
    const ratio = window.devicePixelRatio || 1;

    chartCanvas.width = Math.max(1, width * ratio);
    chartCanvas.height = Math.max(1, height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (labels.length === 0) {
        ctx.fillStyle = "#94a3b8";
        ctx.font = "14px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("No transaction data yet", width / 2, height / 2);
        return;
    }

    const padding = { top: 18, right: 18, bottom: 42, left: 42 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const maxValue = Math.max(1, ...totals, ...flaggedValues);

    ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
        const y = padding.top + (chartHeight / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
    }

    const stepX = labels.length > 1 ? chartWidth / (labels.length - 1) : chartWidth;
    const lineColor = "#34d399";
    const flaggedColor = "#fb7185";

    ctx.beginPath();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.5;
    totals.forEach((value, index) => {
        const x = padding.left + stepX * index;
        const y = padding.top + chartHeight - (value / maxValue) * chartHeight;
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = flaggedColor;
    ctx.lineWidth = 2.5;
    flaggedValues.forEach((value, index) => {
        const x = padding.left + stepX * index;
        const y = padding.top + chartHeight - (value / maxValue) * chartHeight;
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();

    chartCanvas.__hoverTargets = [];
    const labelSpacing = labels.length <= 7 ? 1 : Math.ceil(labels.length / 7);

    labels.forEach((label, index) => {
        const x = padding.left + stepX * index;
        const y = height - 18;
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "12px Inter, sans-serif";
        ctx.textAlign = "center";

        const text = new Date(label).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const shouldDrawLabel = labels.length <= 7 || index === labels.length - 1 || index % labelSpacing === 0;

        if (shouldDrawLabel) {
            ctx.fillText(text, x, y);
        }

        const totalValue = totals[index];
        const flaggedValue = flaggedValues[index];
        const totalY = padding.top + chartHeight - (totalValue / maxValue) * chartHeight;
        const flaggedY = padding.top + chartHeight - (flaggedValue / maxValue) * chartHeight;
        chartCanvas.__hoverTargets.push({
            x,
            y: Math.min(totalY, flaggedY),
            label: text,
            total: totalValue,
            flagged: flaggedValue,
        });
    });

    if (chartTooltip) {
        chartTooltip.classList.remove("visible");
        chartTooltip.setAttribute("aria-hidden", "true");
    }

    chartCanvas.onmousemove = (event) => {
        if (!chartCanvas.__hoverTargets || !chartTooltip) {
            return;
        }

        const rect = chartCanvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const nearest = chartCanvas.__hoverTargets.reduce((best, point) => {
            if (!best) {
                return point;
            }
            const bestDistance = Math.abs(best.x - x);
            const pointDistance = Math.abs(point.x - x);
            return pointDistance < bestDistance ? point : best;
        }, null);

        if (!nearest || Math.abs(nearest.x - x) > 56) {
            chartTooltip.classList.remove("visible");
            chartTooltip.setAttribute("aria-hidden", "true");
            return;
        }

        chartTooltip.innerHTML = `
            <strong>${nearest.label}</strong><br>
            Total: ${nearest.total}<br>
            Flagged: ${nearest.flagged}
        `;
        chartTooltip.style.left = `${nearest.x}px`;
        chartTooltip.style.top = `${Math.max(18, nearest.y - 12)}px`;
        chartTooltip.classList.add("visible");
        chartTooltip.setAttribute("aria-hidden", "false");
    };

    chartCanvas.onmouseleave = () => {
        if (chartTooltip) {
            chartTooltip.classList.remove("visible");
            chartTooltip.setAttribute("aria-hidden", "true");
        }
    };
}

function renderTopFlaggedCategories() {
    if (!topCategories) {
        return;
    }

    const transactions = getChartTransactions();
    const buckets = {};
    transactions.forEach((transaction) => {
        const name = prettifyValue(transaction.transactionType || "unknown");
        if (!buckets[name]) {
            buckets[name] = { name, total: 0, flagged: 0 };
        }
        buckets[name].total += 1;
        buckets[name].flagged += transaction.flagged ? 1 : 0;
    });

    const rows = Object.values(buckets)
        .map((row) => ({
            ...row,
            rate: row.total === 0 ? 0 : (row.flagged / row.total) * 100,
        }))
        .filter((row) => row.total > 0)
        .sort((left, right) => {
            if (right.rate !== left.rate) {
                return right.rate - left.rate;
            }
            return right.flagged - left.flagged;
        })
        .slice(0, 4);

    if (rows.length === 0) {
        topCategories.innerHTML = '<div class="category-row"><span class="category-name">No activity</span><span class="category-volume">No data</span></div>';
        return;
    }

    const maxRate = Math.max(100, ...rows.map((row) => row.rate));

    topCategories.innerHTML = rows
        .map((row) => {
            const rate = `${Math.round(row.rate)}%`;
            const width = Math.max(12, (row.rate / maxRate) * 100);
            const label = `${row.flagged} flagged / ${row.total} total`;
            return `
                <div class="category-row">
                    <span class="category-name">${escapeHtml(row.name)}</span>
                    <span class="category-volume">${label}</span>
                    <span class="category-rate ${row.flagged > 0 ? "flagged" : ""}">${rate}</span>
                    <div style="grid-column: 1 / -1; height: 8px; border-radius: 999px; background: rgba(148, 163, 184, 0.12); overflow: hidden;">
                        <div style="width: ${width}%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #f59e0b 0%, #fb7185 100%);"></div>
                    </div>
                </div>
            `;
        })
        .join("");
}

function getVisibleTransactions() {
    const search = state.searchTerm.trim().toLowerCase();
    const baseTransactions = state.filter === "flagged"
        ? state.allTransactions.filter((transaction) => transaction.flagged)
        : state.allTransactions;

    const filteredByCountry = state.countryFilter === "all"
        ? baseTransactions
        : baseTransactions.filter((transaction) => String(transaction.country ?? "").toUpperCase() === state.countryFilter.toUpperCase());

    const filteredByCurrency = state.currencyFilter === "all"
        ? filteredByCountry
        : filteredByCountry.filter((transaction) => String(transaction.currency ?? "").toUpperCase() === state.currencyFilter.toUpperCase());

    if (!search) {
        return filteredByCurrency;
    }

    const matchesSearch = (value) => String(value ?? "").toLowerCase().includes(search);

    return filteredByCurrency.filter((transaction) => {
        const countryCodeMatch = transaction.country && transaction.country.toLowerCase() === search;
        const homeCountryMatch = transaction.homeCountry && transaction.homeCountry.toLowerCase() === search;
        const currencyCodeMatch = transaction.currency && transaction.currency.toLowerCase() === search;

        return countryCodeMatch
            || homeCountryMatch
            || currencyCodeMatch
            || matchesSearch(transaction.merchant)
            || matchesSearch(transaction.accountId)
            || matchesSearch(transaction.paymentMethod)
            || matchesSearch(transaction.transactionType)
            || matchesSearch(transaction.amount)
            || matchesSearch(transaction.anomalyScore)
            || matchesSearch(transaction.flagged ? "flagged" : "normal")
            || matchesSearch(formatDate(transaction.transactionTimestamp));
    });
}

function populateCountryFilter() {
    const countryFilter = document.getElementById("countryFilter");
    if (!countryFilter) {
        return;
    }

    const countries = [...new Set(state.allTransactions
        .map((transaction) => String(transaction.country ?? "").trim())
        .filter(Boolean))].sort();

    const selectedValue = state.countryFilter;
    const current = countries.includes(selectedValue) ? selectedValue : "all";
    state.countryFilter = current;

    countryFilter.innerHTML = [
        '<option value="all">All countries</option>',
        ...countries.map((country) => `<option value="${escapeHtml(country)}" ${country === current ? "selected" : ""}>${escapeHtml(country)}</option>`),
    ].join("");
}

function populateCurrencyFilter() {
    const currencyFilter = document.getElementById("currencyFilter");
    if (!currencyFilter) {
        return;
    }

    const currencies = [...new Set(state.allTransactions
        .map((transaction) => String(transaction.currency ?? "").trim())
        .filter(Boolean))].sort();

    const selectedValue = state.currencyFilter;
    const current = currencies.includes(selectedValue) ? selectedValue : "all";
    state.currencyFilter = current;

    currencyFilter.innerHTML = [
        '<option value="all">All currencies</option>',
        ...currencies.map((currency) => `<option value="${escapeHtml(currency)}" ${currency === current ? "selected" : ""}>${escapeHtml(currency)}</option>`),
    ].join("");
}

function renderTable() {
    const visibleTransactions = getVisibleTransactions();

    if (visibleTransactions.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="8" class="loading-row">No matching transactions.</td></tr>`;
        return;
    }

    tableBody.innerHTML = visibleTransactions
        .map((transaction) => {
            const selectedClass = transaction.id === state.selectedId ? " style=\"background: rgba(124, 58, 237, 0.12);\"" : "";
            const statusClass = transaction.flagged ? "flagged" : "normal";
            const statusLabel = transaction.flagged ? "Flagged" : "Normal";
            const isSelected = transaction.id === state.selectedId;
            const isChecked = state.selectedIds.has(transaction.id);
            const detailHtml = isSelected ? `
                <tr class="transaction-detail-row">
                    <td colspan="8">
                        <div class="transaction-detail-accordion">
                            <div class="detail-topline">
                                <div>
                                    <h3>${escapeHtml(transaction.merchant)}</h3>
                                    <p>${formatCurrency(transaction.amount, transaction.currency)} • ${formatDate(transaction.transactionTimestamp)}</p>
                                </div>
                                <div class="score-ring">
                                    <span>Risk</span>
                                    <strong>${Number(transaction.anomalyScore).toFixed(2)}</strong>
                                </div>
                            </div>

                            <div class="detail-block">
                                <span class="detail-label">Explanation</span>
                                <p>${escapeHtml(transaction.explanation || "No explanation available.")}</p>
                            </div>

                            <div class="detail-block">
                                <span class="detail-label">Reasons</span>
                                <ul class="reasons-list">
                                    ${(transaction.reasons && transaction.reasons.length > 0 ? transaction.reasons : ["No explicit reason was attached to this record."])
                                        .map((reason) => `<li>${escapeHtml(reason)}</li>`)
                                        .join("")}
                                </ul>
                            </div>

                            <div class="detail-block">
                                <span class="detail-label">Attributes</span>
                                <dl class="detail-grid">
                                    <div>
                                        <dt>Account</dt>
                                        <dd>${escapeHtml(transaction.accountId)}</dd>
                                    </div>
                                    <div>
                                        <dt>Method</dt>
                                        <dd>${escapeHtml(prettifyValue(transaction.paymentMethod))}</dd>
                                    </div>
                                    <div>
                                        <dt>Type</dt>
                                        <dd>${escapeHtml(prettifyValue(transaction.transactionType))}</dd>
                                    </div>
                                    <div>
                                        <dt>Location</dt>
                                        <dd>${escapeHtml(`${transaction.country} vs ${transaction.homeCountry}`)}</dd>
                                    </div>
                                </dl>
                            </div>
                        </div>
                    </td>
                </tr>
            ` : "";
            return `
                <tr data-id="${transaction.id}"${selectedClass}>
                    <td class="select-cell">
                        <label class="selection-actions">
                            <input class="selection-checkbox" type="checkbox" data-select-id="${transaction.id}" ${isChecked ? "checked" : ""} aria-label="Select transaction ${escapeHtml(transaction.merchant)}">
                        </label>
                    </td>
                    <td>
                        <div class="row-title">
                            <strong>${escapeHtml(transaction.merchant)}</strong>
                            <span class="row-subtitle">${escapeHtml(transaction.accountId)}</span>
                        </div>
                    </td>
                    <td>${Number(transaction.amount).toFixed(2)}</td>
                    <td>${escapeHtml(transaction.currency)}</td>
                    <td>${escapeHtml(transaction.country)}</td>
                    <td>${Number(transaction.anomalyScore).toFixed(2)}</td>
                    <td><span class="table-badge ${statusClass}">${statusLabel}</span></td>
                    <td>${formatDate(transaction.transactionTimestamp)}</td>
                </tr>
                ${detailHtml}
            `;
        })
        .join("");
}

function renderDetail() {
    const transaction = state.transactions.find((item) => item.id === state.selectedId)
        ?? state.allTransactions.find((item) => item.id === state.selectedId);

    if (!detailPanel || !emptyState) {
        return;
    }

    if (!transaction) {
        emptyState.classList.remove("hidden");
        detailPanel.classList.add("hidden");
        if (elements.selectedFlag) {
            elements.selectedFlag.textContent = "No selection";
            elements.selectedFlag.className = "status-pill neutral";
        }
        return;
    }

    emptyState.classList.add("hidden");
    detailPanel.classList.remove("hidden");

    if (elements.selectedFlag) {
        elements.selectedFlag.textContent = transaction.flagged ? "Flagged anomaly" : "Normal activity";
        elements.selectedFlag.className = `status-pill ${transaction.flagged ? "danger" : "success"}`;
    }

    if (elements.detailMerchant) {
        elements.detailMerchant.textContent = transaction.merchant;
    }
    if (elements.detailMeta) {
        elements.detailMeta.textContent = `${formatCurrency(transaction.amount, transaction.currency)} • ${formatDate(transaction.transactionTimestamp)}`;
    }
    if (elements.detailScore) {
        elements.detailScore.textContent = Number(transaction.anomalyScore).toFixed(2);
    }
    if (elements.detailExplanation) {
        elements.detailExplanation.textContent = transaction.explanation || "No narrative explanation was generated for this transaction.";
    }
    if (elements.detailSource) {
        elements.detailSource.textContent = "Narrative risk report";
    }
    if (elements.detailAccount) {
        elements.detailAccount.textContent = transaction.accountId;
    }
    if (elements.detailMethod) {
        elements.detailMethod.textContent = prettifyValue(transaction.paymentMethod);
    }
    if (elements.detailType) {
        elements.detailType.textContent = prettifyValue(transaction.transactionType);
    }
    if (elements.detailLocation) {
        elements.detailLocation.textContent = `${transaction.country} vs ${transaction.homeCountry}`;
    }

    const reasons = transaction.reasons && transaction.reasons.length > 0
        ? transaction.reasons
        : ["No explicit reason was attached to this record."];

    if (elements.detailReasons) {
        elements.detailReasons.innerHTML = reasons
            .map((reason) => `<li>${escapeHtml(reason)}</li>`)
            .join("");
    }
}

function formatCurrency(amount, currency) {
    const normalized = String(currency ?? "USD").trim().toUpperCase();
    const safeCurrency = /^[A-Z]{3}$/.test(normalized) ? normalized : "USD";
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: safeCurrency,
    }).format(amount);
}

function formatRiskLabel(flagged, score) {
    if (flagged) {
        return `Flagged · ${Number(score ?? 0).toFixed(2)}`;
    }
    return `Normal · ${Number(score ?? 0).toFixed(2)}`;
}

function formatDate(value) {
    return new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

function prettifyValue(value) {
    return value
        .replaceAll("_", " ")
        .replace(/\b\w/g, (match) => match.toUpperCase());
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}

function buildPayload(formData) {
    const amountValue = Number(formData.get("amount"));
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
        throw new Error("Amount must be greater than zero.");
    }

    const country = String(formData.get("country") ?? "").trim().toUpperCase();
    const homeCountry = String(formData.get("homeCountry") ?? "").trim().toUpperCase();
    const timestampValue = formData.get("transactionTimestamp");
    const timestamp = new Date(timestampValue);
    if (Number.isNaN(timestamp.getTime())) {
        throw new Error("Transaction timestamp is invalid.");
    }

    return {
        accountId: String(formData.get("accountId") ?? "").trim(),
        merchant: String(formData.get("merchant") ?? "").trim(),
        amount: amountValue,
        currency: String(formData.get("currency") ?? "USD").trim().toUpperCase(),
        country,
        homeCountry,
        paymentMethod: String(formData.get("paymentMethod") ?? "card").trim(),
        transactionType: String(formData.get("transactionType") ?? "purchase").trim(),
        transactionTimestamp: timestamp.toISOString(),
    };
}

async function importTransactionsFromFile(file) {
    if (!file) {
        throw new Error("No file selected.");
    }

    const text = await file.text();
    let records;
    const extension = file.name.split(".").pop()?.toLowerCase();

    if (extension === "json") {
        const parsed = JSON.parse(text);
        records = Array.isArray(parsed) ? parsed : [parsed];
    } else {
        const lines = text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        if (lines.length < 2) {
            throw new Error("CSV is empty or missing a header row.");
        }

        const headers = lines[0].split(",").map((header) => header.trim());
        records = lines.slice(1).map((line) => {
            const values = line.split(",").map((value) => value.trim());
            const entry = {};
            headers.forEach((header, index) => {
                entry[header] = values[index] ?? "";
            });
            return entry;
        });
    }

    if (records.length === 0) {
        throw new Error("No transaction rows were found in the uploaded document.");
    }

    const normalized = records.map((record, index) => {
        const raw = {
            accountId: String(record.accountId ?? record.account_id ?? "").trim(),
            merchant: String(record.merchant ?? "").trim(),
            amount: Number(record.amount ?? 0),
            currency: String(record.currency ?? "USD").trim().toUpperCase(),
            country: String(record.country ?? "").trim().toUpperCase(),
            homeCountry: String(record.homeCountry ?? record.home_country ?? "US").trim().toUpperCase(),
            paymentMethod: String(record.paymentMethod ?? record.payment_method ?? "card").trim(),
            transactionType: String(record.transactionType ?? record.transaction_type ?? "purchase").trim(),
            transactionTimestamp: String(record.transactionTimestamp ?? record.transaction_timestamp ?? "").trim(),
        };

        if (!raw.accountId || !raw.merchant || !Number.isFinite(raw.amount) || raw.amount <= 0) {
            throw new Error(`Row ${index + 2} is missing required transaction data.`);
        }

        if (!raw.transactionTimestamp) {
            throw new Error(`Row ${index + 2} is missing a valid transaction timestamp.`);
        }

        return {
            ...raw,
            amount: raw.amount,
            transactionTimestamp: new Date(raw.transactionTimestamp).toISOString(),
        };
    });

    const submissions = await Promise.all(
        normalized.map(async (record) => fetchJson("/api/v1/transactions", {
            method: "POST",
            body: JSON.stringify(record),
        }))
    );

    return submissions;
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormAlert();
    updateSubmitStatus("Analyzing...", "neutral");

    try {
        const payload = buildPayload(new FormData(form));
        const transaction = await fetchJson("/api/v1/transactions", {
            method: "POST",
            body: JSON.stringify(payload),
        });

        if (!isObject(transaction) || typeof transaction.id !== "string") {
            throw new Error("Invalid response from analysis service.");
        }

        state.selectedId = transaction.id;
        updateSubmitStatus(transaction.flagged ? "Flagged anomaly" : "Analysis complete", transaction.flagged ? "danger" : "success");
        showFormAlert(transaction.flagged ? "Transaction flagged for review." : "Transaction analyzed successfully.", transaction.flagged ? "error" : "success");
        await loadTransactions();
    } catch (error) {
        const message = error instanceof Error ? error.message : "Submission failed";
        updateSubmitStatus("Submission failed", "danger");
        showFormAlert(message, "error");
        console.error(error);
    }
});

document.getElementById("importButton").addEventListener("click", async () => {
    clearImportAlert();
    const file = importFileInput?.files?.[0];
    if (!file) {
        showImportAlert("Select a CSV or JSON file first.", "error");
        return;
    }

    updateImportStatus("Importing...", "neutral");

    try {
        const imported = await importTransactionsFromFile(file);
        const count = imported.length;
        state.selectedId = imported[0]?.id ?? state.selectedId;
        updateImportStatus(`${count} transactions imported`, "success");
        showImportAlert(`${count} transactions were imported into Recent activity.`, "success");
        await loadTransactions();
        if (importFileInput) {
            importFileInput.value = "";
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Import failed";
        updateImportStatus("Import failed", "danger");
        showImportAlert(message, "error");
        console.error(error);
    }
});

document.getElementById("clearImportButton").addEventListener("click", () => {
    if (importFileInput) {
        importFileInput.value = "";
    }
    clearImportAlert();
    updateImportStatus("Ready", "neutral");
});

document.getElementById("refreshButton").addEventListener("click", () => {
    clearFormAlert();
    clearImportAlert();
    return loadTransactions();
});
document.getElementById("resetButton").addEventListener("click", () => {
    clearFormAlert();
    updateSubmitStatus("Ready", "neutral");
    state.selectedId = null;
    setFormValues(normalPreset);
    renderTable();
    renderDetail();
});

document.querySelectorAll(".filter-button").forEach((button) => {
    button.addEventListener("click", async () => {
        document.querySelectorAll(".filter-button").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        state.filter = button.dataset.filter;
        await loadTransactions();
    });
});

document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
        const nextTab = button.dataset.tab;
        state.activeTab = nextTab;

        document.querySelectorAll(".tab-button").forEach((tabButton) => {
            const isActive = tabButton === button;
            tabButton.classList.toggle("active", isActive);
            tabButton.setAttribute("aria-selected", String(isActive));
        });

        document.querySelectorAll(".tab-panel").forEach((panel) => {
            const isActive = panel.dataset.panel === nextTab;
            panel.classList.toggle("active", isActive);
        });
    });
});

tableBody.addEventListener("click", (event) => {
    const checkbox = event.target.closest(".selection-checkbox");
    if (checkbox) {
        const transactionId = checkbox.dataset.selectId;
        if (!transactionId) {
            return;
        }

        if (checkbox.checked) {
            state.selectedIds.add(transactionId);
        } else {
            state.selectedIds.delete(transactionId);
        }
        return;
    }

    const row = event.target.closest("tr[data-id]");
    if (!row) {
        return;
    }

    const nextSelectedId = row.dataset.id;
    state.selectedId = state.selectedId === nextSelectedId ? null : nextSelectedId;
    renderTable();
    renderDetail();

    if (state.selectedId) {
        const selectedDetailRow = document.querySelector(".transaction-detail-row");
        if (selectedDetailRow) {
            selectedDetailRow.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
            });
        }
    }
});

function buildPrintableReport() {
    const selected = state.transactions.filter((transaction) => state.selectedIds.has(transaction.id));
    if (selected.length === 0) {
        return "<p>No transactions selected.</p>";
    }

    const summaryRows = selected.map((transaction) => `
        <tr>
            <td>${escapeHtml(transaction.merchant)}</td>
            <td>${escapeHtml(transaction.accountId)}</td>
            <td>${formatCurrency(transaction.amount, transaction.currency)}</td>
            <td>${escapeHtml(transaction.country)}</td>
            <td>${Number(transaction.anomalyScore).toFixed(2)}</td>
            <td>${transaction.flagged ? "Flagged" : "Normal"}</td>
        </tr>
    `).join("");

    const details = selected.map((transaction) => `
        <section style="margin-top: 24px; page-break-inside: avoid;">
            <h2 style="margin-bottom: 8px; font-size: 20px;">${escapeHtml(transaction.merchant)}</h2>
            <p style="margin: 4px 0; color: #374151;">${formatCurrency(transaction.amount, transaction.currency)} • ${escapeHtml(transaction.accountId)} • ${escapeHtml(transaction.country)}</p>
            <p style="margin: 4px 0;"><strong>Risk score:</strong> ${Number(transaction.anomalyScore).toFixed(2)} • <strong>Status:</strong> ${transaction.flagged ? "Flagged" : "Normal"}</p>
            <p style="margin: 10px 0 0; white-space: pre-wrap; line-height: 1.6;">${escapeHtml(transaction.explanation || "No explanation available.")}</p>
            <ul style="margin: 10px 0 0 20px; line-height: 1.6;">
                ${(transaction.reasons && transaction.reasons.length > 0 ? transaction.reasons : ["No explicit reason was attached."])
                    .map((reason) => `<li>${escapeHtml(reason)}</li>`)
                    .join("")}
            </ul>
        </section>
    `).join("");

    return `
        <html>
            <head>
                <title>Selected transaction report</title>
                <style>
                    body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
                    h1 { font-size: 24px; margin-bottom: 12px; }
                    h2 { font-size: 20px; margin: 0; }
                    table { width: 100%; border-collapse: collapse; margin-top: 18px; }
                    th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; }
                    th { background: #f3f4f6; }
                    p, li { color: #374151; }
                </style>
            </head>
            <body>
                <h1>Selected payment transactions</h1>
                <p>${selected.length} transactions selected</p>
                <table>
                    <thead>
                        <tr>
                            <th>Merchant</th>
                            <th>Account</th>
                            <th>Amount</th>
                            <th>Country</th>
                            <th>Score</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>${summaryRows}</tbody>
                </table>
                ${details}
            </body>
        </html>
    `;
}

document.getElementById("printSelectedButton").addEventListener("click", () => {
    const selected = getVisibleTransactions().filter((transaction) => state.selectedIds.has(transaction.id));
    if (selected.length === 0) {
        alert("Select at least one transaction before generating a PDF.");
        return;
    }

    const printWindow = window.open("", "_blank", "width=1000,height=900");
    if (!printWindow) {
        alert("Your browser blocked the pop-up window. Please allow pop-ups and try again.");
        return;
    }

    const reportHtml = buildPrintableReport();
    printWindow.document.write(reportHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
});

document.getElementById("transactionSearch").addEventListener("input", (event) => {
    state.searchTerm = event.target.value;
    renderTable();
});

document.getElementById("countryFilter").addEventListener("change", (event) => {
    state.countryFilter = event.target.value;
    renderTable();
});

document.getElementById("currencyFilter").addEventListener("change", (event) => {
    state.currencyFilter = event.target.value;
    renderTable();
});

setFormValues(normalPreset);
loadHealth();
loadTransactions();
