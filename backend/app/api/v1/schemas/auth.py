from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.api.v1.schemas.common import ORMModel


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    full_name: str = Field(min_length=1, max_length=200)
    locale: str = "en"

    @field_validator("locale")
    @classmethod
    def valid_locale(cls, value: str) -> str:
        if value not in {"en", "hi"}:
            raise ValueError("locale must be en or hi")
        return value


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshIn(BaseModel):
    refresh_token: str = Field(min_length=20)


class LogoutIn(BaseModel):
    refresh_token: str | None = None


class LocaleIn(BaseModel):
    locale: str

    @field_validator("locale")
    @classmethod
    def valid_locale(cls, value: str) -> str:
        if value not in {"en", "hi"}:
            raise ValueError("locale must be en or hi")
        return value


class UserOut(ORMModel):
    id: uuid.UUID
    email: str
    full_name: str
    user_type: str
    status: str
    locale: str
    timezone: str
    last_login_at: datetime | None


class TenantOut(ORMModel):
    id: uuid.UUID
    name: str
    slug: str
    default_locale: str
    timezone: str


class MembershipOut(ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    status: str


class MeOut(BaseModel):
    user: UserOut
    active_tenant: TenantOut | None
    membership: MembershipOut | None
    roles: list[str]
    permissions: list[str]
    audience: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut
    active_tenant: TenantOut | None = None
