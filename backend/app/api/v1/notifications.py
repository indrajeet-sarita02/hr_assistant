from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import DbSession, require_permission
from app.api.pagination import count_rows
from app.api.v1.schemas.common import ORMModel, Page
from app.core.errors import AppError, not_found
from app.db.models import Notification, NotificationPreference
from app.domains.audit import write_audit
from app.domains.identity import Principal

router = APIRouter(tags=["Notifications"])


class NotificationOut(ORMModel):
    id: uuid.UUID
    channel: str
    template_code: str
    locale: str
    subject: str
    body: str
    status: str
    created_at: datetime
    read_at: datetime | None


class PreferenceIn(BaseModel):
    channel: str
    enabled: bool


class PreferenceOut(ORMModel):
    channel: str
    enabled: bool


@router.get("/me/notifications", response_model=Page[NotificationOut])
def list_notifications(
    db: DbSession,
    principal: Principal = Depends(require_permission("notification.read_own")),
    limit: int = 20,
    offset: int = 0,
    unread_only: bool = False,
) -> Page[NotificationOut]:
    stmt = select(Notification).where(
        Notification.recipient_user_id == principal.user_id
    )
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    total = count_rows(db, stmt)
    rows = list(
        db.scalars(
            stmt.order_by(Notification.created_at.desc())
            .limit(min(limit, 100))
            .offset(offset)
        )
    )
    return Page(
        items=[NotificationOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.patch("/me/notifications/{notification_id}", response_model=NotificationOut)
def mark_read(
    notification_id: uuid.UUID,
    db: DbSession,
    principal: Principal = Depends(require_permission("notification.read_own")),
) -> NotificationOut:
    item = db.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.recipient_user_id == principal.user_id,
        )
    )
    if item is None:
        raise not_found("notification")
    if item.read_at is None:
        item.read_at = datetime.now(UTC)
        item.status = "read"
        db.add(item)
        write_audit(
            db,
            principal,
            "notification.read",
            target_type="notification",
            target_id=item.id,
        )
        db.commit()
    return NotificationOut.model_validate(item)


@router.get("/me/notification-preferences", response_model=list[PreferenceOut])
def list_preferences(
    db: DbSession,
    principal: Principal = Depends(require_permission("notification.read_own")),
) -> list[PreferenceOut]:
    rows = list(
        db.scalars(
            select(NotificationPreference).where(
                NotificationPreference.user_id == principal.user_id
            )
        )
    )
    return [PreferenceOut.model_validate(row) for row in rows]


@router.put("/me/notification-preferences", response_model=list[PreferenceOut])
def update_preferences(
    payload: list[PreferenceIn],
    db: DbSession,
    principal: Principal = Depends(require_permission("notification.read_own")),
) -> list[PreferenceOut]:
    for item in payload:
        if item.channel not in {"in_app", "email", "sms"}:
            raise AppError(422, "validation_error", "errors.validation", "Invalid channel.")
        preference = db.scalar(
            select(NotificationPreference).where(
                NotificationPreference.user_id == principal.user_id,
                NotificationPreference.channel == item.channel,
            )
        )
        if preference is None:
            preference = NotificationPreference(
                user_id=principal.user_id,
                channel=item.channel,
                enabled=item.enabled,
            )
        else:
            preference.enabled = item.enabled
        db.add(preference)
    write_audit(
        db,
        principal,
        "notification.preferences.updated",
        target_type="user",
        target_id=principal.user_id,
    )
    db.commit()
    rows = list(
        db.scalars(
            select(NotificationPreference).where(
                NotificationPreference.user_id == principal.user_id
            )
        )
    )
    return [PreferenceOut.model_validate(row) for row in rows]
