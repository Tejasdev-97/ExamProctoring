"""
ExamProctor.ai — System settings and audit log endpoints.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.db.models import SystemSetting, AuditLog
from app.core.permissions import AdminUser, ProfessorUser, AnyUser
from app.core.errors import NotFoundError, BadRequestError
from app.schemas.schemas import UpdateSettingRequest, SettingOut

router = APIRouter(tags=["settings"])

SETTING_VALIDATIONS = {
    "phone_detection_threshold": {"type": (int, float), "min": 0.3, "max": 0.95},
    "phone_confirm_ms": {"type": (int, float), "min": 200, "max": 5000},
    "face_absence_grace_ms": {"type": (int, float), "min": 500, "max": 15000},
    "multiple_faces_grace_ms": {"type": (int, float), "min": 500, "max": 10000},
    "sustained_head_turn_ms": {"type": (int, float), "min": 1000, "max": 10000},
    "head_turn_yaw_threshold": {"type": (int, float), "min": 10.0, "max": 60.0},
    "head_turn_pitch_threshold": {"type": (int, float), "min": 10.0, "max": 60.0},
    "live_sampling_interval_ms": {"type": (int, float), "min": 200, "max": 2000},
    "video_sampling_interval_ms": {"type": (int, float), "min": 50, "max": 500},
    "max_snapshot_size_bytes": {"type": (int, float), "min": 1024, "max": 10485760},
    "offline_continuation_default": {"type": bool},
}

DEFAULT_SYSTEM_SETTINGS = {
    "face_absence_grace_ms": (5000, "Duration of missing face before violation event triggers (ms)"),
    "multiple_faces_grace_ms": (2000, "Duration of multiple faces before violation event triggers (ms)"),
    "sustained_head_turn_ms": (3000, "Duration of head turn before violation event triggers (ms)"),
    "phone_detection_threshold": (0.65, "Confidence threshold for initial phone object detection"),
    "phone_confirm_ms": (1000, "Continuous duration phone must remain visible to confirm violation (ms)"),
    "head_turn_yaw_threshold": (30.0, "Yaw angle threshold for head turn violation (degrees)"),
    "head_turn_pitch_threshold": (30.0, "Pitch angle threshold for head turn violation (degrees)"),
    "live_sampling_interval_ms": (500, "Frame interval between proctoring analysis cycles in live exams (ms)"),
    "video_sampling_interval_ms": (125, "Frame interval between analysis cycles in recorded video analysis (ms)"),
    "max_snapshot_size_bytes": (5242880, "Maximum permitted snapshot file size (bytes)"),
    "offline_continuation_default": (True, "Default setting for offline continuation in new exams"),
}


@router.get("/settings")
async def list_settings(
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """List all system settings. Admin and Professor."""
    stmt = select(SystemSetting).order_by(SystemSetting.setting_key)
    res = await db.execute(stmt)
    settings = list(res.scalars().all())
    existing_keys = {s.setting_key for s in settings}
    now = datetime.now(timezone.utc)
    actor_id = actor.get("sub", "system") if isinstance(actor, dict) else "system"
    added_any = False
    for k, (default_val, desc) in DEFAULT_SYSTEM_SETTINGS.items():
        if k not in existing_keys:
            new_s = SystemSetting(
                setting_id=str(uuid.uuid4()),
                setting_key=k,
                setting_value=default_val,
                description=desc,
                updated_by_user_id=actor_id,
                version=1,
                created_at=now,
                updated_at=now,
            )
            try:
                db.add(new_s)
                added_any = True
            except Exception:
                pass
            settings.append(new_s)
    if added_any:
        try:
            await db.flush()
        except Exception:
            pass
    settings.sort(key=lambda s: getattr(s, "setting_key", ""))
    return {"data": [SettingOut.model_validate(s) for s in settings]}


@router.get("/settings/{setting_key}")
async def get_setting(
    setting_key: str,
    actor: ProfessorUser,
    db: AsyncSession = Depends(get_db),
):
    """Get a setting by key. Admin and Professor."""
    stmt = select(SystemSetting).where(SystemSetting.setting_key == setting_key)
    setting: SystemSetting | None = (await db.execute(stmt)).scalars().first()
    if not setting:
        if setting_key in DEFAULT_SYSTEM_SETTINGS:
            now = datetime.now(timezone.utc)
            actor_id = actor.get("sub", "system") if isinstance(actor, dict) else "system"
            default_val, desc = DEFAULT_SYSTEM_SETTINGS[setting_key]
            setting = SystemSetting(
                setting_id=str(uuid.uuid4()),
                setting_key=setting_key,
                setting_value=default_val,
                description=desc,
                updated_by_user_id=actor_id,
                version=1,
                created_at=now,
                updated_at=now,
            )
            try:
                db.add(setting)
                await db.flush()
            except Exception:
                pass
        else:
            raise NotFoundError("Setting")
    return {"data": SettingOut.model_validate(setting)}


@router.put("/settings/{setting_key}")
async def upsert_setting(
    setting_key: str,
    body: UpdateSettingRequest,
    actor: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Create or update a system setting. Admin only."""
    # Validation against known bounds
    rule = SETTING_VALIDATIONS.get(setting_key)
    if rule:
        expected_type = rule["type"]
        val = body.setting_value
        if expected_type is bool:
            if not isinstance(val, bool):
                raise BadRequestError(f"Setting '{setting_key}' must be a boolean.")
        elif expected_type == (int, float):
            if not isinstance(val, (int, float)) or isinstance(val, bool):
                raise BadRequestError(f"Setting '{setting_key}' must be a number.")
            if "min" in rule and val < rule["min"]:
                raise BadRequestError(f"Setting '{setting_key}' cannot be less than {rule['min']}.")
            if "max" in rule and val > rule["max"]:
                raise BadRequestError(f"Setting '{setting_key}' cannot be greater than {rule['max']}.")

    stmt = select(SystemSetting).where(SystemSetting.setting_key == setting_key)
    existing: SystemSetting | None = (await db.execute(stmt)).scalars().first()

    now = datetime.now(timezone.utc)
    if existing:
        existing.setting_value = body.setting_value
        existing.description = body.description or existing.description
        existing.updated_by_user_id = actor["sub"]
        existing.version += 1
        existing.updated_at = now
        s = existing
    else:
        s = SystemSetting(
            setting_id=str(uuid.uuid4()),
            setting_key=setting_key,
            setting_value=body.setting_value,
            description=body.description,
            updated_by_user_id=actor["sub"],
            version=1,
            created_at=now,
            updated_at=now,
        )
        db.add(s)

    log = AuditLog(
        actor_user_id=actor["sub"],
        action_type="setting_changed",
        target_type="system_setting",
        result="success",
        meta={"key": setting_key},
    )
    db.add(log)
    await db.flush()

    return {"data": SettingOut.model_validate(s)}


from typing import Optional, List
import math
from pydantic import BaseModel, Field
from sqlalchemy import func, delete
from app.db.models import User, Exam


class AuditDeleteRequest(BaseModel):
    mode: str = Field(..., pattern="^(individual|current_page|all_matching)$")
    ids: Optional[List[str]] = None
    filter_action_type: Optional[str] = None


@router.get("/audit-logs")
async def list_audit_logs(
    actor: AdminUser,
    db: AsyncSession = Depends(get_db),
    action_type: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    limit: Optional[int] = Query(None),  # backward compatibility
):
    """List audit log entries with server-side pagination and resolved identities. Admin only."""
    if limit is not None:
        page_size = min(limit, 100)

    # Base query excluding deletion history entries
    base_filter = [AuditLog.action_type != "audit_deletion_history"]
    if action_type:
        base_filter.append(AuditLog.action_type == action_type)

    # 1. Total count
    count_stmt = select(func.count()).select_from(AuditLog).where(*base_filter)
    total = (await db.execute(count_stmt)).scalar() or 0
    total_pages = max(1, math.ceil(total / page_size))
    current_page = min(page, total_pages) if total > 0 else 1

    # 2. Paginated rows
    offset = (current_page - 1) * page_size
    stmt = (
        select(AuditLog)
        .where(*base_filter)
        .order_by(AuditLog.occurred_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    logs = (await db.execute(stmt)).scalars().all()

    # 3. Batch resolve Actor and Target identities
    actor_ids = {l.actor_user_id for l in logs if l.actor_user_id}
    target_user_ids = {l.target_id for l in logs if l.target_type == "user" and l.target_id}
    target_exam_ids = {l.target_id for l in logs if l.target_type == "exam" and l.target_id}

    all_user_ids = actor_ids.union(target_user_ids)
    users_by_id = {}
    if all_user_ids:
        u_stmt = select(User).where(User.user_id.in_(all_user_ids))
        u_rows = (await db.execute(u_stmt)).scalars().all()
        users_by_id = {u.user_id: u for u in u_rows}

    exams_by_id = {}
    if target_exam_ids:
        e_stmt = select(Exam).where(Exam.exam_id.in_(target_exam_ids))
        e_rows = (await db.execute(e_stmt)).scalars().all()
        exams_by_id = {e.exam_id: e for e in e_rows}

    records = []
    for l in logs:
        # Resolve actor
        if l.actor_user_id:
            u = users_by_id.get(l.actor_user_id)
            if u:
                actor_name = u.full_name
                actor_role = u.role.title()
            else:
                actor_name = f"Deleted User (ID: {l.actor_user_id[:8]})"
                actor_role = "Unknown"
        else:
            actor_name = "System"
            actor_role = "Service"

        # Resolve target
        target_display = "—"
        if l.target_type == "user" and l.target_id:
            tu = users_by_id.get(l.target_id)
            target_display = tu.full_name if tu else f"Deleted User (ID: {l.target_id[:8]})"
        elif l.target_type == "exam" and l.target_id:
            te = exams_by_id.get(l.target_id)
            target_display = te.title if te else f"Deleted Exam (ID: {l.target_id[:8]})"
        elif l.target_type:
            target_display = f"{l.target_type.title()}"
            if l.target_id:
                target_display += f" ({str(l.target_id)[:8]})"

        records.append({
            "audit_log_id": l.audit_log_id,
            "actor_user_id": l.actor_user_id,
            "actor_name": actor_name,
            "actor_role": actor_role,
            "action_type": l.action_type,
            "target_type": l.target_type,
            "target_id": str(l.target_id) if l.target_id else None,
            "target_name": target_display,
            "occurred_at": l.occurred_at.isoformat(),
            "result": l.result,
            "metadata": l.meta,
        })

    return {
        "data": records,
        "pagination": {
            "page": current_page,
            "page_size": page_size,
            "total": total,
            "total_pages": total_pages,
            "has_next": current_page < total_pages,
            "has_prev": current_page > 1,
        },
    }


@router.post("/audit-logs/delete")
async def delete_audit_logs(
    body: AuditDeleteRequest,
    actor: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Delete audit logs via individual, current-page, or all-matching selection modes. Admin only."""
    # Never delete audit_deletion_history records
    del_stmt = delete(AuditLog).where(AuditLog.action_type != "audit_deletion_history")

    if body.mode in ("individual", "current_page"):
        if not body.ids:
            return {"data": {"deleted_count": 0, "mode": body.mode}}
        del_stmt = del_stmt.where(AuditLog.audit_log_id.in_(body.ids))
    elif body.mode == "all_matching":
        if body.filter_action_type:
            del_stmt = del_stmt.where(AuditLog.action_type == body.filter_action_type)

    result = await db.execute(del_stmt)
    deleted_count = result.rowcount

    # Fetch admin user name for the record
    admin_user = (await db.execute(select(User).where(User.user_id == actor["sub"]))).scalars().first()
    admin_name = admin_user.full_name if admin_user else "Administrator"

    # Record permanent deletion in protected deletion history
    history_entry = AuditLog(
        actor_user_id=actor["sub"],
        action_type="audit_deletion_history",
        target_type="audit_logs",
        result="success",
        meta={
            "admin_name": admin_name,
            "admin_role": actor["role"],
            "deleted_count": deleted_count,
            "selection_mode": body.mode,
            "filter_scope": body.filter_action_type or "all_records",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )
    db.add(history_entry)
    await db.commit()

    return {
        "data": {
            "deleted_count": deleted_count,
            "mode": body.mode,
            "filter_scope": body.filter_action_type or "all",
        }
    }


@router.get("/audit-logs/deletion-history")
async def get_deletion_history(
    actor: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Get protected deletion history. Admin only."""
    stmt = (
        select(AuditLog)
        .where(AuditLog.action_type == "audit_deletion_history")
        .order_by(AuditLog.occurred_at.desc())
    )
    history_rows = (await db.execute(stmt)).scalars().all()

    # Resolve admin names
    admin_ids = {h.actor_user_id for h in history_rows if h.actor_user_id}
    admins_by_id = {}
    if admin_ids:
        u_rows = (await db.execute(select(User).where(User.user_id.in_(admin_ids)))).scalars().all()
        admins_by_id = {u.user_id: u for u in u_rows}

    data = []
    for h in history_rows:
        meta = h.meta or {}
        admin = admins_by_id.get(h.actor_user_id)
        admin_name = admin.full_name if admin else meta.get("admin_name", "Administrator")
        data.append({
            "history_id": h.audit_log_id,
            "admin_id": h.actor_user_id,
            "admin_name": admin_name,
            "admin_role": (admin.role if admin else meta.get("admin_role", "admin")).title(),
            "deleted_count": meta.get("deleted_count", 0),
            "selection_mode": meta.get("selection_mode", "individual"),
            "filter_scope": meta.get("filter_scope", "all"),
            "occurred_at": h.occurred_at.isoformat(),
            "result": h.result,
        })

    return {"data": data}
