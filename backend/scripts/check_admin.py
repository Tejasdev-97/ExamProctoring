"""Read-only check of the bootstrap admin account. Never prints secrets.
Usage (from backend/):  python scripts/check_admin.py"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.core.security import verify_password  # noqa: E402
from app.db.session import engine  # noqa: E402

engine.echo = False


async def main():
    async with engine.connect() as c:
        rows = (await c.execute(text("select password_hash from users where role='admin'"))).all()
        n_settings = (await c.execute(text("select count(*) from system_settings"))).scalar()
    print("admin rows =", len(rows))
    print("settings rows =", n_settings)
    if rows:
        h = rows[0][0]
        print("hash format =", h[:4])
        print("configured password verifies =", verify_password(settings.BOOTSTRAP_ADMIN_PASSWORD, h))
        print("wrong password rejected =", not verify_password("x" + settings.BOOTSTRAP_ADMIN_PASSWORD, h))
    await engine.dispose()


asyncio.run(main())
