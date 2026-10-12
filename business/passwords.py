"""Contraseñas: cómo se guardan y cómo se comprueban.

Nunca se guarda la contraseña. Se guarda un hash PBKDF2 con una sal aleatoria
por cuenta; comprobar una contraseña es volver a calcular ese hash con la
misma sal y compararlo en tiempo constante.

Solo usa la biblioteca estándar: el negocio no depende de Flask ni de Werkzeug.
"""

import hashlib
import hmac
import secrets
from functools import lru_cache

_ALGORITHM = "pbkdf2_sha256"
_ITERATIONS = 200_000


def _pbkdf2(password: str, salt: str, iterations: int) -> str:
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations
    )
    return digest.hex()


def hash_password(password: str) -> str:
    """El hash que se guarda: algoritmo, iteraciones, sal y resultado."""
    salt = secrets.token_hex(16)
    return f"{_ALGORITHM}${_ITERATIONS}${salt}${_pbkdf2(password, salt, _ITERATIONS)}"


def password_matches(password: str, stored: str) -> bool:
    algorithm, iterations, salt, expected = stored.split("$")
    if algorithm != _ALGORITHM:
        return False
    return hmac.compare_digest(_pbkdf2(password, salt, int(iterations)), expected)


@lru_cache(maxsize=1)
def decoy_hash() -> str:
    """Contra qué se compara cuando el usuario no existe.

    Así una respuesta tarda lo mismo con un usuario inventado que con uno real
    y no delata qué nombres de usuario existen.
    """
    return hash_password(secrets.token_hex(8))
