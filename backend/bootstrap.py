"""
ExamProctor.ai — Bootstrap script.
Creates the first admin account and seeds default system settings.
Run once: python bootstrap.py
"""

import asyncio
import uuid
from datetime import datetime, timezone

from app.db.session import AsyncSessionLocal, engine, Base
from app.db.models import User, SystemSetting
from app.core.security import hash_password
from app.core.config import settings


DEFAULT_SETTINGS = [
    {
        "key": "face_absence_grace_ms",
        "value": 5000,
        "desc": "Grace period (ms) before a face-absence event is recorded.",
    },
    {
        "key": "multiple_faces_grace_ms",
        "value": 2000,
        "desc": "Grace period (ms) before a multiple-faces event is recorded.",
    },
    {
        "key": "sustained_head_turn_ms",
        "value": 3000,
        "desc": "Duration (ms) before a sustained head-turn event is recorded.",
    },
    {
        "key": "phone_detection_threshold",
        "value": 0.65,
        "desc": "Minimum detector confidence for phone detection.",
    },
    {
        "key": "phone_confirm_ms",
        "value": 1000,
        "desc": "Duration (ms) a phone detection must persist before confirming violation.",
    },
    {
        "key": "head_turn_yaw_threshold",
        "value": 30.0,
        "desc": "Yaw angle (degrees) threshold for head-turn detection.",
    },
    {
        "key": "head_turn_pitch_threshold",
        "value": 30.0,
        "desc": "Pitch angle (degrees) threshold for head-turn detection.",
    },
    {
        "key": "live_sampling_interval_ms",
        "value": 500,
        "desc": "Sampling interval (ms) for live webcam proctoring.",
    },
    {
        "key": "video_sampling_interval_ms",
        "value": 125,
        "desc": "Sampling interval (ms) for recorded video analysis.",
    },
    {
        "key": "max_snapshot_size_bytes",
        "value": 5242880,
        "desc": "Maximum snapshot binary size in bytes.",
    },
    {
        "key": "offline_continuation_default",
        "value": True,
        "desc": "Default offline continuation policy for new exams.",
    },
]


async def bootstrap():
    async with AsyncSessionLocal() as db:
        # Check if admin already exists
        from sqlalchemy import select
        stmt = select(User).where(User.email == settings.BOOTSTRAP_ADMIN_EMAIL)
        existing = (await db.execute(stmt)).scalars().first()

        if existing:
            print(f"Admin account {settings.BOOTSTRAP_ADMIN_EMAIL} already exists. Skipping.")
        else:
            try:
                pw_hash = hash_password(settings.BOOTSTRAP_ADMIN_PASSWORD)
            except ValueError as e:
                raise SystemExit(f"BOOTSTRAP_ADMIN_PASSWORD is invalid: {e}")
            admin = User(
                user_id=str(uuid.uuid4()),
                full_name="System Administrator",
                email=settings.BOOTSTRAP_ADMIN_EMAIL,
                password_hash=pw_hash,
                role="admin",
                account_status="active",
            )
            db.add(admin)
            print(f"Created admin: {settings.BOOTSTRAP_ADMIN_EMAIL}")

        # Seed default settings
        for s in DEFAULT_SETTINGS:
            stmt = select(SystemSetting).where(SystemSetting.setting_key == s["key"])
            existing_s = (await db.execute(stmt)).scalars().first()
            if not existing_s:
                setting = SystemSetting(
                    setting_id=str(uuid.uuid4()),
                    setting_key=s["key"],
                    setting_value=s["value"],
                    description=s["desc"],
                    version=1,
                )
                db.add(setting)
                print(f"Seeded setting: {s['key']}")

        await db.commit()
        print("Bootstrap complete.")


if __name__ == "__main__":
    asyncio.run(bootstrap())
