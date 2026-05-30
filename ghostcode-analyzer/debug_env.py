#!/usr/bin/env python3
"""Run with: python debug_env.py from inside ghostcode-analyzer/"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv, dotenv_values

BASE = Path(__file__).resolve().parent
ENV_PATH = BASE / ".env"

print("=" * 60)
print("ENVIRONMENT DIAGNOSIS")
print("=" * 60)

# 1. Does the .env file exist?
print(f"\n[1] .env file exists at {ENV_PATH}:")
print(f"    {'YES' if ENV_PATH.exists() else 'NO — FILE MISSING'}")

# 2. What does the raw .env file contain?
if ENV_PATH.exists():
    raw_values = dotenv_values(ENV_PATH)
    key = raw_values.get("GROQ_API_KEY", "")
    print(f"\n[2] Raw .env GROQ_API_KEY:")
    print(f"    Found: {bool(key)}")
    print(f"    Length: {len(key)}")
    print(f"    Preview: {key[:12]}..." if key else "    Value: EMPTY")
    print(f"    Starts with 'gsk_': {key.startswith('gsk_')}")
    print(f"    Has leading space: {key != key.lstrip()}")
    print(f"    Has trailing space/newline: {key != key.rstrip()}")
    print(f"    Has surrounding quotes: {(key.startswith(chr(34)) or key.startswith(chr(39)))}")

# 3. What does os.environ see BEFORE load_dotenv?
before = os.environ.get("GROQ_API_KEY", "")
print(f"\n[3] os.environ GROQ_API_KEY before load_dotenv:")
print(f"    {'SET — length ' + str(len(before)) + ' — preview: ' + before[:12] if before else 'NOT SET'}")

# 4. Load .env and check again
load_dotenv(ENV_PATH, override=True)
after = os.getenv("GROQ_API_KEY", "")
print(f"\n[4] os.getenv GROQ_API_KEY after load_dotenv:")
print(f"    {'SET — length ' + str(len(after)) + ' — preview: ' + after[:12] if after else 'NOT SET'}")

# 5. Validate key format
if after:
    print(f"\n[5] Key validation:")
    print(f"    Correct prefix (gsk_): {after.startswith('gsk_')}")
    print(f"    Clean (no whitespace): {after == after.strip()}")
    q1 = chr(34); q2 = chr(39)
    print(f"    No quotes wrapping: {not (after.startswith(q1) or after.startswith(q2))}")
else:
    print(f"\n[5] Key validation: SKIPPED — key is empty")

# 6. parents[2] path check (what groq_client.py resolves to)
groq_client_path = BASE / "app" / "services" / "groq_client.py"
parents2_env = groq_client_path.resolve().parents[2] / ".env"
print(f"\n[6] Path groq_client.py resolves for load_dotenv:")
print(f"    {parents2_env}")
print(f"    File exists at that path: {parents2_env.exists()}")
print(f"    Same as BASE/.env: {parents2_env == ENV_PATH}")

# 7. Also check parents[3] (for the new bulletproof version)
parents3_env = groq_client_path.resolve().parents[3] / ".env"
print(f"\n[7] Path parents[3] resolves to (for new version):")
print(f"    {parents3_env}")
print(f"    File exists at that path: {parents3_env.exists()}")

print("\n" + "=" * 60)
print("VERDICT")
print("=" * 60)
issues = []
if not ENV_PATH.exists():
    issues.append("CRITICAL: .env file does not exist at ghostcode-analyzer/.env")
if after and not after.startswith("gsk_"):
    issues.append("CRITICAL: GROQ_API_KEY does not start with 'gsk_' — wrong key or wrong service key")
if after and after != after.strip():
    issues.append("CRITICAL: GROQ_API_KEY has leading/trailing whitespace — strip it in .env")
if after and (after.startswith('"') or after.startswith("'")):
    issues.append("CRITICAL: GROQ_API_KEY is wrapped in quotes — remove them from .env")
if not after:
    issues.append("CRITICAL: GROQ_API_KEY is empty after loading .env")
if not parents2_env.exists():
    issues.append("CRITICAL: groq_client.py's load_dotenv path does not resolve to a real file")

if issues:
    for i in issues:
        print(f"  ✗ {i}")
else:
    print("  ✓ .env file found, key is present, format looks correct.")
    print("  → If 401 still occurs, the key itself is revoked — regenerate at console.groq.com/keys")
print()
