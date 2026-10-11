const state = {
    transactions: [],
    filter: "all",
    selectedId: null,
};

const form = document.getElementById("transactionForm");
const tableBody = document.getElementById("transactionsTableBody");
const detailPanel = document.getElementById("detailPanel");
const emptyState = document.getElementById("emptyState");

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

const normalPreset = {
    accountId: "acct-2048",
    merchant: "Everyday Market",
    amount: "84.65",
    currency: "USD",
    country: "US",
    homeCountry: "US",
    paymentMethod: "card",
    transactionType: "purchase",
    transactionTimestamp: toLocalDateTime(new Date()),
};

const riskyPreset = {
    accountId: "acct-1024",
    merchant: "Luxury Electronics",
    amount: "6200.00",
    currency: "USD",
    country: "NG",
    homeCountry: "US",
    paymentMethod: "wire",
    transactionType: "purchase",
    transactionTimestamp: "2026-10-09T01:24",
};

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
    elements.submitStatus.textContent = label;
    elements.submitStatus.className = `status-pill ${tone}`;
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
    return {
        accountId: formData.get("accountId"),
        merchant: formData.get("merchant"),
        amount: Number(formData.get("amount")),
        currency: String(formData.get("currency")).toUpperCase(),
        country: String(formData.get("country")).toUpperCase(),
        homeCountry: String(formData.get("homeCountry")).toUpperCase(),
        paymentMethod: formData.get("paymentMethod"),
        transactionType: formData.get("transactionType"),
        transactionTimestamp: new Date(formData.get("transactionTimestamp")).toISOString(),
    };
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    updateSubmitStatus("Analyzing...", "neutral");

    try {
        const payload = buildPayload(new FormData(form));
        const transaction = await fetchJson("/api/v1/transactions", {
            method: "POST",
            body: JSON.stringify(payload),
        });

        state.selectedId = transaction.id;
        updateSubmitStatus(transaction.flagged ? "Flagged anomaly" : "Analysis complete", transaction.flagged ? "danger" : "success");
        await loadTransactions();
    } catch (error) {
        updateSubmitStatus("Submission failed", "danger");
        console.error(error);
    }
});

document.getElementById("refreshButton").addEventListener("click", loadTransactions);
document.getElementById("resetButton").addEventListener("click", () => setFormValues(normalPreset));
document.getElementById("safePresetButton").addEventListener("click", () => setFormValues(normalPreset));
document.getElementById("riskyPresetButton").addEventListener("click", () => setFormValues(riskyPreset));

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
