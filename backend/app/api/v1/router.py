from fastapi import APIRouter

from app.api.v1 import (
    admin,
    assessments,
    auth,
    career,
    content_admin,
    documents,
    hr_assistant,
    leave,
    notifications,
    onboarding,
    recruitment,
    reports,
    resumes,
    service_requests,
    workflow_admin,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(hr_assistant.router)
api_router.include_router(service_requests.router)
api_router.include_router(leave.router)
api_router.include_router(onboarding.router)
api_router.include_router(recruitment.router)
api_router.include_router(reports.router)
api_router.include_router(notifications.router)
api_router.include_router(documents.router)
api_router.include_router(career.router)
api_router.include_router(assessments.router)
api_router.include_router(resumes.router)
api_router.include_router(admin.router)
api_router.include_router(content_admin.router)
api_router.include_router(workflow_admin.router)
