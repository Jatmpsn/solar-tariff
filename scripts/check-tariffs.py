"""
check-tariffs.py
Fetches the tariff rate Google Sheet (published as CSV), compares against the
last saved snapshot, and sends an email alert if anything has changed.

Place this file at: scripts/check-tariffs.py
Snapshot is stored at: scripts/tariff_snapshot.json
"""

import csv
import json
import os
import smtplib
import sys
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from io import StringIO

import requests

# ── Config (all from GitHub Actions secrets / environment variables) ─────────
SHEET_CSV_URL    = os.environ.get("TARIFF_SHEET_CSV_URL", "")
ALERT_EMAIL_TO   = os.environ.get("ALERT_EMAIL_TO", "")
GMAIL_USER       = os.environ.get("GMAIL_USER", "")
GMAIL_APP_PASS   = os.environ.get("GMAIL_APP_PASSWORD", "")

SNAPSHOT_PATH    = os.path.join(os.path.dirname(__file__), "tariff_snapshot.json")

# Columns we care about for change detection (must match sheet headers exactly)
RATE_COLUMNS = [
    "Standing Charge\n(p/day)",
    "Flat Import\nRate (p/kWh)",
    "Off-Peak Import\n(p/kWh)",
    "Off-Peak Window\n(e.g. 00:00–05:30)",
    "Shoulder Import\n(p/kWh)",
    "Peak Import\n(p/kWh)",
    "Flat Export\nRate (p/kWh)",
    "Peak Export\n(p/kWh)",
]

# ── Helpers ──────────────────────────────────────────────────────────────────

def fetch_sheet(url: str) -> list[dict]:
    """Download the Google Sheet CSV and return as list of row dicts."""
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    reader = csv.DictReader(StringIO(resp.text))
    return [row for row in reader]


def build_snapshot(rows: list[dict]) -> dict:
    """Build a {tariff_name: {field: value}} snapshot from CSV rows."""
    snapshot = {}
    for row in rows:
        name = row.get("Tariff Name", "").strip()
        if not name:
            continue
        snapshot[name] = {col: row.get(col, "").strip() for col in RATE_COLUMNS if col in row}
    return snapshot


def load_snapshot() -> dict:
    if os.path.exists(SNAPSHOT_PATH):
        with open(SNAPSHOT_PATH) as f:
            return json.load(f)
    return {}


def save_snapshot(snapshot: dict):
    with open(SNAPSHOT_PATH, "w") as f:
        json.dump(snapshot, f, indent=2)


def find_changes(old: dict, new: dict) -> list[dict]:
    """Return a list of change dicts describing every rate that moved."""
    changes = []
    all_tariffs = set(old.keys()) | set(new.keys())

    for tariff in sorted(all_tariffs):
        if tariff not in old:
            changes.append({"tariff": tariff, "field": "—", "old": "NEW TARIFF", "new": "added"})
            continue
        if tariff not in new:
            changes.append({"tariff": tariff, "field": "—", "old": "present", "new": "REMOVED"})
            continue
        for field in RATE_COLUMNS:
            old_val = old[tariff].get(field, "")
            new_val = new[tariff].get(field, "")
            if old_val != new_val:
                changes.append({"tariff": tariff, "field": field, "old": old_val, "new": new_val})

    return changes


def send_email(changes: list[dict]):
    """Send an HTML email summarising the rate changes."""
    if not all([GMAIL_USER, GMAIL_APP_PASS, ALERT_EMAIL_TO]):
        print("⚠️  Email credentials not set — skipping email. Changes were:")
        for c in changes:
            print(f"  {c['tariff']} | {c['field']}: {c['old']} → {c['new']}")
        return

    now = datetime.now(timezone.utc).strftime("%d %b %Y %H:%M UTC")

    rows_html = "".join(
        f"""<tr style="background:{'#fff9c4' if i % 2 == 0 else '#ffffff'}">
              <td style="padding:8px;border:1px solid #ddd">{c['tariff']}</td>
              <td style="padding:8px;border:1px solid #ddd">{c['field'].replace(chr(10),' ')}</td>
              <td style="padding:8px;border:1px solid #ddd;color:#c0392b">{c['old']}</td>
              <td style="padding:8px;border:1px solid #ddd;color:#27ae60">{c['new']}</td>
           </tr>"""
        for i, c in enumerate(changes)
    )

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto">
      <div style="background:#1b4332;color:white;padding:20px;border-radius:8px 8px 0 0">
        <h2 style="margin:0">🌿 Green Tariff Marketplace — Rate Change Alert</h2>
        <p style="margin:6px 0 0;opacity:0.8">{now}</p>
      </div>
      <div style="background:#f7f9f7;padding:20px;border-radius:0 0 8px 8px;border:1px solid #e0ede6">
        <p>The daily tariff check detected <strong>{len(changes)} change(s)</strong>
           in the tariff rate spreadsheet. Please review and update <code>script.js</code>
           if the website rates need updating.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <thead>
            <tr style="background:#2d6a4f;color:white">
              <th style="padding:10px;text-align:left">Tariff</th>
              <th style="padding:10px;text-align:left">Field</th>
              <th style="padding:10px;text-align:left">Old value</th>
              <th style="padding:10px;text-align:left">New value</th>
            </tr>
          </thead>
          <tbody>{rows_html}</tbody>
        </table>
        <p style="margin-top:20px;font-size:0.85em;color:#888">
          This alert was sent automatically by the check-tariffs GitHub Action.<br>
          View the spreadsheet to confirm changes and update the Changelog tab.
        </p>
      </div>
    </div>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"⚡ Tariff rate change detected — {len(changes)} update(s)"
    msg["From"]    = GMAIL_USER
    msg["To"]      = ALERT_EMAIL_TO
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(GMAIL_USER, GMAIL_APP_PASS)
        server.sendmail(GMAIL_USER, ALERT_EMAIL_TO, msg.as_string())

    print(f"✅ Alert email sent to {ALERT_EMAIL_TO}")


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    if not SHEET_CSV_URL:
        print("❌ TARIFF_SHEET_CSV_URL not set. Add it as a GitHub Actions secret.")
        sys.exit(1)

    print("Fetching tariff sheet…")
    rows = fetch_sheet(SHEET_CSV_URL)
    new_snapshot = build_snapshot(rows)
    old_snapshot = load_snapshot()

    if not old_snapshot:
        # First run — just save the snapshot, nothing to diff against
        save_snapshot(new_snapshot)
        print("✅ First run — snapshot saved. No changes to report.")
        return

    changes = find_changes(old_snapshot, new_snapshot)

    if not changes:
        print("✅ No rate changes detected.")
    else:
        print(f"⚠️  {len(changes)} change(s) detected — sending alert…")
        send_email(changes)
        save_snapshot(new_snapshot)
        print("Snapshot updated.")


if __name__ == "__main__":
    main()
    