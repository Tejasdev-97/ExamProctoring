"""
ExamProctor.ai — Standardized error responses and exception classes.
"""

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
import uuid


class AppError(HTTPException):
    """Base application error with structured body."""

    def __init__(self, status_code: int, code: str, message: str, retryable: bool = False):
        super().__init__(status_code=status_code, detail=message)
        self.code = code
        self.message = message
        self.retryable = retryable

    def to_response(self, request_id: str | None = None) -> dict:
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "details": [],
                "request_id": request_id or str(uuid.uuid4()),
                "retryable": self.retryable,
            }
        }


class NotFoundError(AppError):
    def __init__(self, resource: str = "Resource"):
        super().__init__(404, "NOT_FOUND", f"{resource} not found.")


class BadRequestError(AppError):
    def __init__(self, msg: str = "Bad request."):
        super().__init__(400, "BAD_REQUEST", msg)


class ForbiddenError(AppError):
    def __init__(self, msg: str = "Insufficient permissions."):
        super().__init__(403, "FORBIDDEN", msg)


class ConflictError(AppError):
    def __init__(self, msg: str = "Conflicting state.", retryable: bool = False):
        super().__init__(409, "CONFLICT", msg, retryable=retryable)


class ValidationError(AppError):
    def __init__(self, msg: str = "Invalid request."):
        super().__init__(422, "VALIDATION_ERROR", msg)


class UnauthorizedError(AppError):
    def __init__(self, msg: str = "Authentication required."):
        super().__init__(401, "UNAUTHORIZED", msg)


# ── FastAPI exception handlers ────────────────────────────────────────────────

async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    req_id = str(uuid.uuid4())
    return JSONResponse(status_code=exc.status_code, content=exc.to_response(req_id))


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    req_id = str(uuid.uuid4())
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": "HTTP_ERROR",
                "message": str(exc.detail),
                "details": [],
                "request_id": req_id,
                "retryable": exc.status_code >= 500,
            }
        },
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    req_id = str(uuid.uuid4())
    details = [
        {"field": ".".join(str(l) for l in e["loc"]), "message": e["msg"]}
        for e in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "The supplied request is invalid.",
                "details": details,
                "request_id": req_id,
                "retryable": False,
            }
        },
    )
