"""Errores del dominio.

No llevan un texto ya escrito en un idioma concreto, sino una CLAVE de mensaje
(`error.book_already_lent`) y los parámetros que esa clave necesita.

Traducir la clave al idioma del usuario es trabajo de la capa de presentación
(`presentation/i18n`). Gracias a esto, la capa de negocio no sabe ni en qué
idioma se le va a hablar al usuario ni qué código HTTP le corresponde.
"""


class BusinessError(Exception):
    """Una regla de negocio impide la operación (la presentación responde 400)."""

    def __init__(self, key: str, **params):
        super().__init__(key)
        self.key = key
        self.params = params


class NotFoundError(BusinessError):
    """El recurso solicitado no existe (la presentación responde 404)."""
