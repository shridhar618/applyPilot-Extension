from fastapi import APIRouter

from app.api.v1 import applications, auth, jobs, matches, resumes

api_router = APIRouter()
for module in (auth, resumes, jobs, matches, applications):
    api_router.include_router(module.router)
