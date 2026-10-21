"""
Test both database URLs (asyncpg + psycopg2) read through the app settings.
Read-only: runs SELECT queries only. Never prints credentials.
Usage (from backend/):  python scripts/check_db.py
"""
import asyncio
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from app.core.config import settings  # noqa: E402


def redact(msg: str) -> str:
    return re.sub(r"://[^@\s]+@", "://***@", str(msg))[:300]


async def check_async() -> bool:
    try:
        eng = create_async_engine(settings.DATABASE_URL)
        async with eng.connect() as c:
            ver = (await c.execute(text("select version()"))).scalar()
            ssl = (await c.execute(text("select ssl from pg_stat_ssl where pid = pg_backend_pid()"))).scalar()
        await eng.dispose()
        print(f"[asyncpg]  OK  ssl={ssl}  {ver.split(',')[0]}")
        return True
    except Exception as e:
        print(f"[asyncpg]  FAILED  {type(e).__name__}: {redact(e)}")
        return False


def check_sync() -> bool:
    try:
        eng = create_engine(settings.SYNC_DATABASE_URL)
        with eng.connect() as c:
            tables = c.execute(text("select count(*) from information_schema.tables where table_schema='public'")).scalar()
        eng.dispose()
        print(f"[psycopg2] OK  public tables={tables}")
        return True
    except Exception as e:
        print(f"[psycopg2] FAILED  {type(e).__name__}: {redact(e)}")
        return False


if __name__ == "__main__":
    ok_a = asyncio.run(check_async())
    ok_s = check_sync()
    sys.exit(0 if (ok_a and ok_s) else 1)
