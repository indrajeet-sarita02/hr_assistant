from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page[T](BaseModel):
    items: list[T]
    total: int
    limit: int
    offset: int


class MessageOut(BaseModel):
    message: str


class ErrorDetail(BaseModel):
    field: str
    code: str
    message_key: str


class ErrorBody(BaseModel):
    code: str
    message_key: str
    message: str
    details: list[ErrorDetail] = Field(default_factory=list)
    request_id: str
    retryable: bool = False


class ErrorResponse(BaseModel):
    error: ErrorBody


class VersionedModel(ORMModel):
    id: uuid.UUID
    version: int = 1


class TimestampedModel(ORMModel):
    created_at: datetime
    updated_at: datetime
