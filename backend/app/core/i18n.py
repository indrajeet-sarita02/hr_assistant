from __future__ import annotations

from app.core.config import settings


def supported_locales() -> frozenset[str]:
    """Return the normalised set of locales the API can return."""

    return frozenset(item.lower() for item in settings.supported_locales)


def normalize_locale(value: str | None) -> str | None:
    """Normalise a locale tag such as ``hi-IN`` to its primary subtag."""

    if not value:
        return None
    candidate = value.split(",", 1)[0].split(";", 1)[0].strip().lower()
    if not candidate:
        return None
    primary = candidate.replace("_", "-").split("-", 1)[0]
    return primary if primary in supported_locales() else None


def parse_accept_language(header: str | None) -> list[str]:
    """Parse an ``Accept-Language`` header in descending quality order.

    Malformed weights are ignored rather than rejecting the request; locale
    negotiation must never make an otherwise valid API call fail.
    """

    if not header:
        return []

    parsed: list[tuple[float, int, str]] = []
    for index, part in enumerate(header.split(",")):
        token, _, parameters = part.partition(";")
        locale = normalize_locale(token)
        if locale is None:
            continue
        quality = 1.0
        for parameter in parameters.split(";"):
            name, _, value = parameter.partition("=")
            if name.strip().lower() != "q":
                continue
            try:
                quality = float(value.strip())
            except ValueError:
                quality = 0.0
        if quality > 0:
            parsed.append((quality, index, locale))

    parsed.sort(key=lambda item: (-item[0], item[1]))
    return [locale for _, _, locale in parsed]


def negotiate_locale(
    preference: str | None,
    accept_language: str | None,
    tenant_default: str | None,
) -> str:
    """Resolve the response locale using the documented precedence.

    Authenticated preference, then ``Accept-Language``, then the tenant default,
    then the application default. Only supported locales are ever returned.
    """

    for candidate in (
        normalize_locale(preference),
        *parse_accept_language(accept_language),
        normalize_locale(tenant_default),
        normalize_locale(settings.default_locale),
        "en",
    ):
        if candidate in supported_locales():
            return candidate
    return "en"
