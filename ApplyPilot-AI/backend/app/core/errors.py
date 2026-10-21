"""Uniform error envelope: {"error": {"code", "message", "details"}}."""
import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

log = logging.getLogger("applypilot.errors")


class AppError(Exception):
    def __init__(self, status: int, code: str, message: str, details=None):
        self.status, self.code, self.message, self.details = status, code, message, details


def _resp(status: int, code: str, message: str, details=None, headers=None) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message, "details": details}}, status_code=status, headers=headers)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, e: AppError):
        return _resp(e.status, e.code, e.message, e.details)

    @app.exception_handler(HTTPException)
    async def _http(_: Request, e: HTTPException):
        return _resp(e.status_code, "http_error", str(e.detail), headers=getattr(e, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, e: RequestValidationError):
        # Report field + message only; never echo submitted values back (they may be passwords/resume text).
        details = [{"field": ".".join(str(p) for p in err["loc"] if p != "body"), "message": err["msg"]} for err in e.errors()]
        return _resp(422, "validation_error", "Request validation failed.", details)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, e: Exception):
        log.error("unhandled exception", exc_info=e, extra={"path": request.url.path, "method": request.method})
        return _resp(500, "internal_error", "Something went wrong on our side. Please try again.")
