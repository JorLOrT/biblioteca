"""Cuentas y permisos: quién puede entrar y qué puede hacer cada papel.

Hay dos papeles (`entities/user.py`):
  - el BIBLIOTECARIO gestiona el catálogo y registra préstamos y devoluciones;
  - el LECTOR consulta el catálogo, guarda su lista de deseos y pregunta por
    el chat.

Las contraseñas nunca se guardan. Se guarda un hash PBKDF2 con una sal
aleatoria por cuenta; comprobar una contraseña es volver a calcular ese hash y
compararlo en tiempo constante.

Esta capa no sabe de cookies ni de sesiones: comprueba credenciales y decide
qué papel hace falta. Recordar quién inició sesión es trabajo de la capa de
presentación (`presentation/auth.py`).
"""

import hashlib
import hmac
import secrets
from functools import lru_cache
from typing import NamedTuple, Optional

from business.exceptions import AuthError, ForbiddenError
from data_access.unit_of_work import unit_of_work
from entities.user import LIBRARIAN, READER, User

_ALGORITHM = "pbkdf2_sha256"
_ITERATIONS = 200_000


class DemoAccount(NamedTuple):
    username: str
    password: str
    display_name: str
    role: str


# Las dos cuentas de prueba. Las contraseñas son genéricas a propósito: es una
# aplicación de demostración y la pantalla de inicio de sesión las muestra.
DEMO_ACCOUNTS = (
    DemoAccount("bibliotecario", "biblioteca123", "Bibliotecario", LIBRARIAN),
    DemoAccount("lector", "lector123", "Lector", READER),
)


def _pbkdf2(password: str, salt: str, iterations: int) -> str:
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations
    )
    return digest.hex()


def hash_password(password: str) -> str:
    """El hash que se guarda: algoritmo, iteraciones, sal y resultado."""
    salt = secrets.token_hex(16)
    digest = _pbkdf2(password, salt, _ITERATIONS)
    return f"{_ALGORITHM}${_ITERATIONS}${salt}${digest}"


def _password_matches(password: str, stored: str) -> bool:
    algorithm, iterations, salt, expected = stored.split("$")
    if algorithm != _ALGORITHM:
        return False
    return hmac.compare_digest(_pbkdf2(password, salt, int(iterations)), expected)


@lru_cache(maxsize=1)
def _decoy_hash() -> str:
    """Contra qué se compara cuando el usuario no existe.

    Así una respuesta tarda lo mismo con un usuario inventado que con uno real
    y no delata qué nombres de usuario existen.
    """
    return hash_password(secrets.token_hex(8))


def authenticate(username: str, password: str) -> User:
    """La cuenta, si el usuario y la contraseña son correctos."""
    with unit_of_work() as uow:
        user = uow.users.get_by_username(username.strip().lower())

    stored = user.password_hash if user else _decoy_hash()
    if not _password_matches(password, stored) or user is None:
        # El mismo mensaje en los dos casos, por la misma razón.
        raise AuthError("error.bad_credentials")
    return user


def ensure_demo_accounts() -> None:
    """Crea las cuentas de prueba que falten. Se llama al arrancar."""
    with unit_of_work() as uow:
        for account in DEMO_ACCOUNTS:
            if uow.users.get_by_username(account.username) is None:
                uow.users.create(User(
                    id=None,
                    username=account.username,
                    display_name=account.display_name,
                    role=account.role,
                    password_hash=hash_password(account.password),
                ))


def require_login(role: Optional[str]) -> None:
    """Regla de acceso: sin sesión iniciada no se usa la aplicación."""
    if role is None:
        raise AuthError("error.login_required")


def require_librarian(role: Optional[str]) -> None:
    """Regla de acceso: el catálogo y los préstamos solo los cambia el bibliotecario."""
    require_login(role)
    if role != LIBRARIAN:
        raise ForbiddenError("error.forbidden")
