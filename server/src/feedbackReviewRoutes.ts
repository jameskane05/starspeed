import type { Application, Request, Response } from "express";
import { feedbackDashboardKeyAllowsRead } from "./feedbackDashboardAuth.js";

type FeedbackRow = {
    createdAt?: string;
    type?: string;
    name?: string;
    email?: string;
    message?: string;
    ratings?: Record<string, unknown>;
    systemInfo?: Record<string, unknown>;
};

const REVIEW_PATH = "/admin/feedback-review";

function escapeHtml(s: unknown): string {
    const t = s == null ? "" : String(s);
    return t
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function asRows(list: unknown[]): FeedbackRow[] {
    return list.filter((x): x is FeedbackRow => x !== null && typeof x === "object");
}

function formatRatings(r: Record<string, unknown> | undefined): string {
    if (!r || typeof r !== "object") return "—";
    const parts: string[] = [];
    if (typeof r.gameplay === "number") parts.push(`G:${r.gameplay}`);
    if (typeof r.performance === "number") parts.push(`P:${r.performance}`);
    if (typeof r.graphics === "number") parts.push(`Gr:${r.graphics}`);
    if (typeof r.overall === "number") parts.push(`O:${r.overall}`);
    return parts.length ? parts.join(" ") : "—";
}

function buildCsv(rows: FeedbackRow[]): string {
    const headers = ["createdAt", "type", "name", "email", "message", "gameplay", "performance", "graphics", "overall"];
    const lines = [headers.join(",")];
    for (const r of rows) {
        const ratings = r.ratings || {};
        const cells = [
            r.createdAt ?? "",
            r.type ?? "",
            r.name ?? "",
            r.email ?? "",
            (r.message ?? "").replace(/"/g, '""'),
            ratings.gameplay ?? "",
            ratings.performance ?? "",
            ratings.graphics ?? "",
            ratings.overall ?? "",
        ];
        lines.push(cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
    }
    return `\uFEFF${lines.join("\n")}`;
}

function renderLoginPage(error?: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Feedback review</title>
<style>
body{font-family:system-ui,sans-serif;background:#0f1115;color:#e8eaed;margin:0;padding:2rem;line-height:1.4;}
h1{font-size:1.25rem;font-weight:600;margin:0 0 1rem;}
form{max-width:24rem;display:flex;flex-direction:column;gap:0.75rem;}
label{font-size:0.875rem;color:#9ab;}
input{padding:0.5rem 0.75rem;border:1px solid #333;border-radius:6px;background:#1a1d23;color:#e8eaed;}
button{padding:0.55rem 1rem;border-radius:6px;border:0;background:#2a6cfd;color:#fff;font-weight:600;cursor:pointer;}
.err{color:#f66;margin:0 0 1rem;font-size:0.9rem;}
p.note{font-size:0.8rem;color:#9ab;margin-top:1.5rem;}
code{font-size:0.85em;background:#1a1d23;padding:0.1em 0.35em;border-radius:4px;}
</style>
</head>
<body>
<h1>Starspeed feedback review</h1>
${error ? `<p class="err">${escapeHtml(error)}</p>` : ""}
<form method="post" action="${REVIEW_PATH}">
<label>Dashboard key <input type="password" name="key" autocomplete="current-password" placeholder="Required if FEEDBACK_DASHBOARD_KEY is set"/></label>
<button type="submit">View entries</button>
</form>
<p class="note">Use the same <code>FEEDBACK_DASHBOARD_KEY</code> value as for <code>GET /api/feedback?key=…</code>. If that env var is unset (typical local dev), submit with an empty key.</p>
</body>
</html>`;
}

function renderDashboardHtml(rows: FeedbackRow[], keyForForm: string): string {
    const tableBody =
        rows.length === 0
            ? `<tr><td colspan="7" style="padding:2rem;color:#9ab;">No feedback entries.</td></tr>`
            : rows
                  .map((row) => {
                      const msg = row.message || "";
                      const short = msg.slice(0, 80) + (msg.length > 80 ? "…" : "");
                      const typeRaw = row.type || "";
                      const typeEsc = escapeHtml(typeRaw);
                      const dt = row.createdAt
                          ? escapeHtml(new Date(row.createdAt).toLocaleString())
                          : "—";
                      return `<tr data-type="${typeEsc}">
<td>${dt}</td>
<td>${typeEsc}</td>
<td>${escapeHtml(row.name)}</td>
<td>${escapeHtml(row.email)}</td>
<td title="${escapeHtml(msg)}">${escapeHtml(short)}</td>
<td>${escapeHtml(formatRatings(row.ratings))}</td>
<td><details><summary style="cursor:pointer;color:#6ae;">Details</summary>
<pre style="white-space:pre-wrap;word-break:break-word;background:#1a1d23;padding:0.75rem;border-radius:6px;font-size:0.8rem;">${escapeHtml(JSON.stringify(row.systemInfo || {}, null, 2))}</pre>
<p><strong>Full message</strong></p>
<pre style="white-space:pre-wrap;font-size:0.85rem;">${escapeHtml(msg)}</pre>
</details></td>
</tr>`;
                  })
                  .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Feedback review</title>
<style>
body{font-family:system-ui,sans-serif;background:#0f1115;color:#e8eaed;margin:0;padding:1.5rem;line-height:1.4;}
h1{font-size:1.2rem;margin:0 0 1rem;}
.toolbar{display:flex;flex-wrap:wrap;gap:1rem;align-items:center;margin-bottom:1rem;}
select{padding:0.4rem 0.6rem;border-radius:6px;border:1px solid #333;background:#1a1d23;color:#e8eaed;}
button{padding:0.45rem 0.9rem;border-radius:6px;border:0;background:#2a6cfd;color:#fff;font-weight:600;cursor:pointer;}
button.secondary{background:#333;color:#e8eaed;}
a.logout{display:inline-block;padding:0.45rem 0.9rem;border-radius:6px;background:#333;color:#e8eaed;text-decoration:none;font-size:0.9rem;}
table{width:100%;border-collapse:collapse;font-size:0.85rem;}
th,td{text-align:left;padding:0.5rem 0.65rem;border-bottom:1px solid #2a2e36;}
th{color:#9ab;font-weight:600;}
tr:hover td{background:#1a1d23;}
a{color:#6ae;}
</style>
</head>
<body>
<h1>Feedback entries</h1>
<div class="toolbar">
<label>Type <select id="type-filter"><option value="">All</option><option value="feedback">Feedback</option><option value="bug">Bug</option></select></label>
<form method="post" action="${REVIEW_PATH}" style="display:inline">
<input type="hidden" name="key" value="${escapeHtml(keyForForm)}"/>
<button type="submit" name="export" value="csv">Export CSV</button>
</form>
<a class="logout" href="${REVIEW_PATH}" style="margin-left:0.5rem">Log out / reload</a>
</div>
<table>
<thead><tr><th>Date</th><th>Type</th><th>Name</th><th>Email</th><th>Message</th><th>Ratings</th><th></th></tr></thead>
<tbody id="feedback-tbody">${tableBody}</tbody>
</table>
<script>
(function(){
var sel=document.getElementById("type-filter");
var tb=document.getElementById("feedback-tbody");
if(!sel||!tb)return;
function apply(){
var v=sel.value;
tb.querySelectorAll("tr[data-type]").forEach(function(tr){
tr.style.display=!v||tr.getAttribute("data-type")===v?"":"none";
});
}
sel.addEventListener("change",apply);
apply();
})();
</script>
</body>
</html>`;
}

function noStore(res: Response) {
    res.setHeader("Cache-Control", "no-store");
}

export function registerFeedbackReviewRoutes(app: Application, readFeedback: () => unknown[]): void {
    app.get(REVIEW_PATH, (_req: Request, res: Response) => {
        noStore(res);
        if (feedbackDashboardKeyAllowsRead(undefined)) {
            const rows = asRows(readFeedback());
            res.type("html").send(renderDashboardHtml(rows, ""));
            return;
        }
        res.type("html").send(renderLoginPage());
    });

    app.post(REVIEW_PATH, (req: Request, res: Response) => {
        noStore(res);
        const key = typeof req.body?.key === "string" ? req.body.key : "";
        const exportCsv = req.body?.export === "csv";

        if (!feedbackDashboardKeyAllowsRead(key)) {
            res.status(401).type("html").send(renderLoginPage("Invalid or missing dashboard key."));
            return;
        }

        const rows = asRows(readFeedback());

        if (exportCsv) {
            const day = new Date().toISOString().slice(0, 10);
            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader("Content-Disposition", `attachment; filename="feedback-${day}.csv"`);
            res.send(buildCsv(rows));
            return;
        }

        res.type("html").send(renderDashboardHtml(rows, key));
    });
}
