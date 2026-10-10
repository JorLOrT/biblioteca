"""Tipos de flask-sock, que no los publica. Solo lo que usa la aplicación."""

from typing import Any, Callable, TypeVar

from flask import Blueprint, Flask

_Handler = TypeVar("_Handler", bound=Callable[..., Any])

class Sock:
    def __init__(self, app: Flask | None = ...) -> None: ...
    def init_app(self, app: Flask) -> None: ...
    def route(
        self, path: str, bp: Blueprint | None = ..., **kwargs: object
    ) -> Callable[[_Handler], _Handler]: ...
