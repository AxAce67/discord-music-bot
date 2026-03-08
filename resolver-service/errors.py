from __future__ import annotations


class ResolverError(Exception):
    def __init__(self, code: str, message: str, status_code: int) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code

    def to_payload(self) -> dict[str, dict[str, str]]:
        return {"error": {"code": self.code, "message": self.message}}
