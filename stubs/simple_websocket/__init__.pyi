"""Tipos de simple-websocket (lo usa flask-sock), que no los publica.

Solo lo que usa la aplicación.
"""

from typing import overload

class SimpleWebsocketError(RuntimeError): ...

# El nombre lo pone la librería; aquí solo se declara.
class ConnectionClosed(SimpleWebsocketError):  # noqa: N818
    """El otro extremo cerró la conexión."""

class Server:
    def send(self, data: str | bytes) -> None: ...
    # Sin plazo, `receive` espera hasta que llegue algo o lanza ConnectionClosed;
    # con plazo, devuelve None si no llegó nada a tiempo.
    @overload
    def receive(self, timeout: None = ...) -> str | bytes: ...
    @overload
    def receive(self, timeout: float) -> str | bytes | None: ...
    def close(self, reason: int | None = ..., message: str | None = ...) -> None: ...
