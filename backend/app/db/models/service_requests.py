from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, VersionMixin, new_uuid


class ServiceCatalogItem(Base, TimestampMixin, VersionMixin):
    __tablename__ = "service_catalog_items"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(60), nullable=False)
    name_en: Mapped[str] = mapped_column(String(160), nullable=False)
    name_hi: Mapped[str | None] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    form_schema: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    sla_hours: Mapped[int] = mapped_column(Integer, default=24, nullable=False)
    queue_code: Mapped[str] = mapped_column(String(60), default="hr", nullable=False)
    active: Mapped[bool] = mapped_column(default=True, nullable=False)
    __table_args__ = (
        UniqueConstraint("tenant_id", "code", name="uq_service_catalog_tenant_code"),
        CheckConstraint("sla_hours > 0", name="sla_positive"),
        Index("ix_service_catalog_tenant_active", "tenant_id", "active"),
    )


class HRServiceRequest(Base, TimestampMixin, VersionMixin):
    __tablename__ = "hr_service_requests"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False
    )
    catalog_item_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("service_catalog_items.id", ondelete="RESTRICT"),
        nullable=False,
    )
    requester_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    assignee_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    form_data: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    priority: Mapped[str] = mapped_column(String(10), default="normal", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="open", nullable=False)
    sla_due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        CheckConstraint(
            (
                "status IN ('open','in_progress','waiting_on_requester',"
                "'resolved','closed','cancelled')"
            ),
            name="status",
        ),
        CheckConstraint("priority IN ('low','normal','high','urgent')", name="priority"),
        Index("ix_service_requests_tenant_status_sla", "tenant_id", "status", "sla_due_at"),
        Index(
            "ix_service_requests_tenant_assignee_status",
            "tenant_id",
            "assignee_user_id",
            "status",
        ),
    )


class HRServiceRequestComment(Base):
    __tablename__ = "hr_service_request_comments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False
    )
    request_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("hr_service_requests.id", ondelete="CASCADE"), nullable=False
    )
    author_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    visibility: Mapped[str] = mapped_column(String(20), default="requester", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    __table_args__ = (
        CheckConstraint("visibility IN ('requester','internal')", name="visibility"),
        Index("ix_service_comments_request_created", "request_id", "created_at"),
    )


class HRServiceRequestAttachment(Base):
    __tablename__ = "hr_service_request_attachments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=new_uuid)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False
    )
    request_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("hr_service_requests.id", ondelete="CASCADE"), nullable=False
    )
    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("documents.id", ondelete="RESTRICT"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    __table_args__ = (
        UniqueConstraint("request_id", "document_id", name="uq_service_request_document"),
    )
