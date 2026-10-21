"""
Derive DATABASE_URL (asyncpg) and SYNC_DATABASE_URL (psycopg2) from the
NEON_CONNECTION_STRING line in backend/.env. Other lines are preserved.
Secrets are never printed. Usage (from backend/):  python scripts/configure_neon.py
"""
import re
import sys
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

ENV = Path(__file__).resolve().parent.parent / ".env"


def build(raw: str):
    raw = raw.strip().strip('"').strip("'")
    if raw.startswith("psql "):  # Neon's "psql '...'" snippet
        raw = raw.split(" ", 1)[1].strip().strip("'\"")
    parts = urlsplit(raw)
    if parts.scheme not in ("postgres", "postgresql") or not parts.hostname:
        raise ValueError("Not a valid postgres:// or postgresql:// URL")
    keep = [(k, v) for k, v in parse_qsl(parts.query) if k not in ("sslmode", "channel_binding", "ssl")]
    async_q = urlencode(keep + [("ssl", "require")])
    sync_q = urlencode(keep + [("sslmode", "require")])
    a = urlunsplit(("postgresql+asyncpg", parts.netloc, parts.path, async_q, ""))
    s = urlunsplit(("postgresql+psycopg2", parts.netloc, parts.path, sync_q, ""))
    return a, s


def main():
    lines = ENV.read_text(encoding="utf-8").splitlines()
    neon = next((l.split("=", 1)[1] for l in lines if l.startswith("NEON_CONNECTION_STRING=")), "").strip()
    if not neon:
        print("NEON_CONNECTION_STRING is empty in backend/.env. Paste it there and save first.")
        sys.exit(1)
    try:
        a, s = build(neon)
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)
    out, seen = [], set()
    for l in lines:
        if re.match(r"^DATABASE_URL=", l):
            out.append(f"DATABASE_URL={a}"); seen.add("a")
        elif re.match(r"^SYNC_DATABASE_URL=", l):
            out.append(f"SYNC_DATABASE_URL={s}"); seen.add("s")
        elif l.startswith("NEON_CONNECTION_STRING="):
            out.append("NEON_CONNECTION_STRING=")  # clear the raw copy
        else:
            out.append(l)
    if "a" not in seen: out.append(f"DATABASE_URL={a}")
    if "s" not in seen: out.append(f"SYNC_DATABASE_URL={s}")
    ENV.write_text("\n".join(out) + "\n", encoding="utf-8")
    print("DATABASE_URL and SYNC_DATABASE_URL updated (asyncpg ssl=require, psycopg2 sslmode=require).")
    print("The raw NEON_CONNECTION_STRING line was cleared. Credentials were not printed.")


if __name__ == "__main__":
    main()
