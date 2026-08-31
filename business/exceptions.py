"""Errores del dominio.

La capa de negocio los lanza y la capa de presentación los traduce a códigos
HTTP. Así el negocio no necesita conocer nada de la web.
"""


class BusinessError(Exception):
    """Una regla de negocio impide la operación (la presentación responde 400)."""


class NotFoundError(BusinessError):
    """El recurso solicitado no existe (la presentación responde 404)."""
