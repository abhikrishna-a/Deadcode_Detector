import logging
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


def build_weekly_digest_html(user):
    from .models import JuniorSubmission

    now = timezone.now()
    week_ago = now - timedelta(days=7)

    submissions = JuniorSubmission.objects.filter(
        user=user,
        status="done",
        created_at__gte=week_ago,
    ).order_by("-created_at")

    total_scans = submissions.count()
    total_issues = 0
    avg_health = 0
    health_scores = []
    files_with_issues = []

    for sub in submissions:
        result = sub.result or {}
        summary = result.get("summary", {})
        issues = summary.get("total_issues", 0) or len(result.get("issues", []))
        health = summary.get("health_score", 100)
        total_issues += issues
        if health is not None:
            health_scores.append(health)
        if issues > 0:
            severity_counts = summary.get("severity_counts", {})
            files_with_issues.append(
                {
                    "filename": f"{sub.scan_folder}/{sub.relative_path}"
                    if sub.scan_folder
                    else (sub.relative_path or sub.filename),
                    "issues": issues,
                    "health_score": health,
                    "high": severity_counts.get("high", 0),
                    "medium": severity_counts.get("medium", 0),
                    "low": severity_counts.get("low", 0),
                }
            )

    if health_scores:
        avg_health = round(sum(health_scores) / len(health_scores))

    files_with_issues.sort(key=lambda f: f["issues"], reverse=True)
    top_files = files_with_issues[:5]

    frontend_url = getattr(settings, "FRONTEND_URL", "https://ghostcode-ai.vercel.app")
    date_range = f"{week_ago.strftime('%b %d')} – {now.strftime('%b %d, %Y')}"

    health_color = "#10b981" if avg_health >= 80 else "#f59e0b" if avg_health >= 50 else "#ef4444"
    issues_color = "#10b981" if total_issues == 0 else "#ef4444"

    files_html = ""
    for i, f in enumerate(top_files, 1):
        sev_bar = ""
        if f["high"] > 0:
            sev_bar += f'<span style="color:#ef4444;font-weight:600">{f["high"]}H</span> '
        if f["medium"] > 0:
            sev_bar += f'<span style="color:#f59e0b;font-weight:600">{f["medium"]}M</span> '
        if f["low"] > 0:
            sev_bar += f'<span style="color:#3b82f6;font-weight:600">{f["low"]}L</span> '
        files_html += f"""
        <tr>
            <td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06);color:#a1a1aa;font-size:14px;font-family:monospace">{i}</td>
            <td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06);color:#e4e4e7;font-size:14px;font-family:monospace;word-break:break-all">{f["filename"]}</td>
            <td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06);color:{issues_color};font-weight:600;text-align:center;font-size:14px">{f["issues"]}</td>
            <td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06);color:#a1a1aa;font-size:13px">{sev_bar.strip()}</td>
        </tr>"""

    no_files_html = ""
    if total_scans == 0:
        no_files_html = """
        <div style="text-align:center;padding:40px 20px;color:#71717a">
            <p style="font-size:16px;margin:0">No scans this week.</p>
            <p style="font-size:13px;margin:8px 0 0;color:#52525b">Submit code to start tracking dead code.</p>
        </div>"""

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#060608;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#060608;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

<!-- Header -->
<tr><td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.06)">
    <div style="display:flex;align-items:center;gap:12px">
        <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#22d3ee,#a855f7);display:flex;align-items:center;justify-content:center">
            <span style="font-weight:900;font-size:12px;color:white">GC</span>
        </div>
        <div>
            <div style="font-size:18px;font-weight:700;color:#fafafa;letter-spacing:-0.02em">Weekly Digest</div>
            <div style="font-size:12px;color:#71717a;margin-top:2px">{date_range}</div>
        </div>
    </div>
</td></tr>

<!-- Greeting -->
<tr><td style="padding:32px 40px 8px">
    <p style="font-size:15px;color:#d4d4d8;margin:0">Hi <strong style="color:#fafafa">{user.username}</strong>,</p>
    <p style="font-size:14px;color:#a1a1aa;margin:8px 0 0">Here's your dead code activity for the past week.</p>
</td></tr>

<!-- Stats Cards -->
<tr><td style="padding:24px 40px">
    <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
        <td width="33%" style="padding:16px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.04);text-align:center">
            <div style="font-size:28px;font-weight:700;color:#fafafa">{total_scans}</div>
            <div style="font-size:11px;color:#71717a;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em">Scans</div>
        </td>
        <td width="4%"></td>
        <td width="29%" style="padding:16px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.04);text-align:center">
            <div style="font-size:28px;font-weight:700;color:{issues_color}">{total_issues}</div>
            <div style="font-size:11px;color:#71717a;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em">Issues</div>
        </td>
        <td width="4%"></td>
        <td width="30%" style="padding:16px;background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.04);text-align:center">
            <div style="font-size:28px;font-weight:700;color:{health_color}">{avg_health}%</div>
            <div style="font-size:11px;color:#71717a;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em">Health</div>
        </td>
    </tr>
    </table>
</td></tr>

<!-- Top Files Table -->
<tr><td style="padding:0 40px">
    <div style="font-size:13px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px">Top Files with Dead Code</div>
    {no_files_html}
    {
        "<table width='100%' cellpadding='0' cellspacing='0' style='border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,0.04)'>"
        + '''
    <thead><tr style="background:rgba(255,255,255,0.03)">
        <th style="padding:10px 16px;text-align:left;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">#</th>
        <th style="padding:10px 16px;text-align:left;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">File</th>
        <th style="padding:10px 16px;text-align:center;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">Issues</th>
        <th style="padding:10px 16px;text-align:left;font-size:11px;color:#71717a;text-transform:uppercase;letter-spacing:0.05em;font-weight:600">Severity</th>
    </tr></thead>
    <tbody>'''
        + files_html
        + '''
    </tbody></table>'''
        if files_html
        else ""
    }
</td></tr>

<!-- CTA Button -->
<tr><td style="padding:32px 40px;text-align:center">
    <a href="{
        frontend_url
    }" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#22d3ee,#a855f7);color:white;font-weight:600;font-size:14px;border-radius:10px;text-decoration:none">Open Dashboard</a>
</td></tr>

<!-- Footer -->
<tr><td style="padding:24px 40px;border-top:1px solid rgba(255,255,255,0.06)">
    <p style="font-size:12px;color:#52525b;margin:0;text-align:center">
        GhostCode &middot; Weekly Dead Code Digest<br>
        <a href="{frontend_url}" style="color:#71717a">Unsubscribe</a>
    </p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>"""

    return html
