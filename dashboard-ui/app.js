const state = {
    transactions: [],
    filter: "all",
    selectedId: null,
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

const elements = {
    totalTransactions: document.getElementById("totalTransactions"),
    flaggedTransactions: document.getElementById("flaggedTransactions"),
    averageScore: document.getElementById("averageScore"),
    crossBorderTransactions: document.getElementById("crossBorderTransactions"),
    submitStatus: document.getElementById("submitStatus"),
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

function showFormAlert(message, tone) {
    if (!formAlert) {
        return;
    }

    formAlert.textContent = message;
    formAlert.className = `alert-banner visible ${tone}`;
}

function clearFormAlert() {
    if (!formAlert) {
        return;
    }

    formAlert.textContent = "";
    formAlert.className = "alert-banner";
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
        const query = state.filter === "flagged" ? "?flagged=true" : "";
        const transactions = await fetchJson(`/api/v1/transactions${query}`);
        state.transactions = transactions;

        if (!state.selectedId && transactions.length > 0) {
            state.selectedId = transactions[0].id;
        } else if (!transactions.some((transaction) => transaction.id === state.selectedId)) {
            state.selectedId = transactions[0]?.id ?? null;
        }

        renderMetrics();
        renderTable();
        renderDetail();
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="6" class="loading-row">Unable to load transactions.</td></tr>`;
        renderMetrics([]);
        elements.systemStatus.textContent = "Backend unavailable";
        console.error(error);
    }
}

function renderMetrics() {
    const transactions = state.transactions;
    const total = transactions.length;
    const flagged = transactions.filter((transaction) => transaction.flagged).length;
    const average = total === 0
        ? 0
        : transactions.reduce((sum, transaction) => sum + transaction.anomalyScore, 0) / total;
    const crossBorder = transactions.filter(
        (transaction) => transaction.country.toUpperCase() !== transaction.homeCountry.toUpperCase()
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

    const timeline = {};
    state.transactions.forEach((transaction) => {
        const date = new Date(transaction.transactionTimestamp);
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
    labels.forEach((label, index) => {
        const x = padding.left + stepX * index;
        const y = height - 18;
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "12px Inter, sans-serif";
        ctx.textAlign = "center";

        const text = new Date(label).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        ctx.fillText(text, x, y);

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

    const buckets = {};
    state.transactions.forEach((transaction) => {
        const key = prettifyValue(transaction.transactionType);
        if (!buckets[key]) {
            buckets[key] = { name: key, total: 0, flagged: 0 };
        }
        buckets[key].total += 1;
        buckets[key].flagged += transaction.flagged ? 1 : 0;
    });

    const rows = Object.values(buckets)
        .sort((left, right) => (right.flagged * 10 + right.total) - (left.flagged * 10 + left.total))
        .slice(0, 4);

    if (rows.length === 0) {
        topCategories.innerHTML = '<div class="category-row"><span class="category-name">No activity</span><span class="category-volume">No data</span></div>';
        return;
    }

    const maxFlagged = Math.max(1, ...rows.map((row) => row.flagged));

    topCategories.innerHTML = rows
        .map((row) => {
            const rate = row.total === 0 ? 0 : ((row.flagged / row.total) * 100).toFixed(0);
            const width = Math.max(16, (row.flagged / maxFlagged) * 100);
            return `
                <div class="category-row">
                    <span class="category-name">${escapeHtml(row.name)}</span>
                    <span class="category-volume">${row.flagged}/${row.total} flagged</span>
                    <span class="category-rate ${row.flagged > 0 ? "flagged" : ""}">${rate}%</span>
                    <div style="grid-column: 1 / -1; height: 6px; border-radius: 999px; background: rgba(148, 163, 184, 0.12); overflow: hidden;">
                        <div style="width: ${width}%; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #fb7185 0%, #fbbf24 100%);"></div>
                    </div>
                </div>
            `;
        })
        .join("");
}

function renderTable() {
    if (state.transactions.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="loading-row">No transactions yet.</td></tr>`;
        return;
    }

    tableBody.innerHTML = state.transactions
        .map((transaction) => {
            const selectedClass = transaction.id === state.selectedId ? " style=\"background: rgba(124, 58, 237, 0.12);\"" : "";
            const statusClass = transaction.flagged ? "flagged" : "normal";
            const statusLabel = transaction.flagged ? "Flagged" : "Normal";
            return `
                <tr data-id="${transaction.id}"${selectedClass}>
                    <td>
                        <div class="row-title">
                            <strong>${escapeHtml(transaction.merchant)}</strong>
                            <span class="row-subtitle">${escapeHtml(transaction.accountId)}</span>
                        </div>
                    </td>
                    <td>${formatCurrency(transaction.amount, transaction.currency)}</td>
                    <td>${escapeHtml(transaction.country)}</td>
                    <td>${Number(transaction.anomalyScore).toFixed(2)}</td>
                    <td><span class="table-badge ${statusClass}">${statusLabel}</span></td>
                    <td>${formatDate(transaction.transactionTimestamp)}</td>
                </tr>
            `;
        })
        .join("");
}

function renderDetail() {
    const transaction = state.transactions.find((item) => item.id === state.selectedId);

    if (!transaction) {
        emptyState.classList.remove("hidden");
        detailPanel.classList.add("hidden");
        elements.selectedFlag.textContent = "No selection";
        elements.selectedFlag.className = "status-pill neutral";
        return;
    }

    emptyState.classList.add("hidden");
    detailPanel.classList.remove("hidden");

    elements.selectedFlag.textContent = transaction.flagged ? "Flagged anomaly" : "Normal activity";
    elements.selectedFlag.className = `status-pill ${transaction.flagged ? "danger" : "success"}`;
    elements.detailMerchant.textContent = transaction.merchant;
    elements.detailMeta.textContent =
        `${formatCurrency(transaction.amount, transaction.currency)} • ${formatDate(transaction.transactionTimestamp)}`;
    elements.detailScore.textContent = Number(transaction.anomalyScore).toFixed(2);
    elements.detailExplanation.textContent = transaction.explanation;
    elements.detailSource.textContent = prettifyValue(transaction.explanationSource ?? "template");
    elements.detailAccount.textContent = transaction.accountId;
    elements.detailMethod.textContent = prettifyValue(transaction.paymentMethod);
    elements.detailType.textContent = prettifyValue(transaction.transactionType);
    elements.detailLocation.textContent = `${transaction.country} vs ${transaction.homeCountry}`;

    const reasons = transaction.reasons && transaction.reasons.length > 0
        ? transaction.reasons
        : ["No explicit reason was attached to this record."];

    elements.detailReasons.innerHTML = reasons
        .map((reason) => `<li>${escapeHtml(reason)}</li>`)
        .join("");
}

function formatCurrency(amount, currency) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
    }).format(amount);
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

document.getElementById("refreshButton").addEventListener("click", () => {
    clearFormAlert();
    return loadTransactions();
});
document.getElementById("resetButton").addEventListener("click", () => {
    clearFormAlert();
    setFormValues(normalPreset);
});

document.querySelectorAll(".filter-button").forEach((button) => {
    button.addEventListener("click", async () => {
        document.querySelectorAll(".filter-button").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        state.filter = button.dataset.filter;
        await loadTransactions();
    });
});

tableBody.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-id]");
    if (!row) {
        return;
    }
    state.selectedId = row.dataset.id;
    renderTable();
    renderDetail();
});

setFormValues(normalPreset);
loadHealth();
loadTransactions();
