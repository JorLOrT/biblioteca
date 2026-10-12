"""Cuentas y permisos: quién puede entrar y qué puede hacer cada papel.

Hay dos papeles (`entities/user.py`):
  - el BIBLIOTECARIO gestiona el catálogo, las cuentas de los lectores y los
    préstamos;
  - el LECTOR consulta el catálogo, guarda su lista de deseos y habla con el
    bibliotecario por un chat privado.

Las contraseñas se guardan como hash (`passwords.py`). Esta capa no sabe de
cookies ni de sesiones: comprueba credenciales y decide qué papel hace falta.
Recordar quién inició sesión es trabajo de la capa de presentación
(`presentation/auth.py`).
"""

from datetime import date, timedelta
from typing import NamedTuple, Optional

from business.exceptions import AuthError, ForbiddenError
from business.passwords import decoy_hash, hash_password, password_matches
from business.reader_service import ReaderService
from data_access.unit_of_work import unit_of_work
from entities.user import LIBRARIAN, READER, User


class DemoAccount(NamedTuple):
    username: str
    password: str
    display_name: str
    role: str
    dni: str = ""
    phone: str = ""
    email: str = ""
    # Días que le quedan al carnet al crear la cuenta. Negativo: ya vencido.
    card_days: int = 0


# Las cuentas de prueba. Las contraseñas son genéricas a propósito: es una
# aplicación de demostración y la pantalla de inicio de sesión las muestra.
# A Juanita se le crea el carnet ya vencido, para ver qué pasa al prestarle.
DEMO_ACCOUNTS = (
    DemoAccount("jorge", "jorge123", "Jorge", LIBRARIAN),
    DemoAccount("pepito", "pepito123", "Pepito Pérez", READER,
                "45678912", "987654321", "pepito@correo.pe", card_days=365),
    DemoAccount("juanita", "juanita123", "Juanita Gómez", READER,
                "41237856", "912345678", "juanita@correo.pe", card_days=-12),
)

# Las cuentas de prueba de la versión anterior, que estas sustituyen.
OLD_DEMO_USERNAMES = ("bibliotecario", "lector")


def authenticate(username: str, password: str) -> User:
    """La cuenta, si el usuario y la contraseña son correctos."""
    with unit_of_work() as uow:
        user = uow.users.get_by_username(username.strip().lower())

    stored = user.password_hash if user else decoy_hash()
    if not password_matches(password, stored) or user is None:
        # El mismo mensaje en los dos casos, por la misma razón.
        raise AuthError("error.bad_credentials")
    return user


def _create_demo_reader(account: DemoAccount) -> None:
    expires = date.today() + timedelta(days=account.card_days)
    ReaderService().create_reader(account.username, {
        "name": account.display_name,
        "dni": account.dni,
        "phone": account.phone,
        "email": account.email,
        "card_expires": expires.isoformat(),
        "password": account.password,
    })


def ensure_demo_accounts() -> None:
    """Crea las cuentas de prueba que falten y quita las antiguas. Al arrancar."""
    with unit_of_work() as uow:
        for username in OLD_DEMO_USERNAMES:
            uow.users.delete_unused(username)
        missing = [
            account for account in DEMO_ACCOUNTS
            if uow.users.get_by_username(account.username) is None
        ]
        for account in missing:
            if account.role == LIBRARIAN:
                uow.users.create(User(
                    id=None,
                    username=account.username,
                    display_name=account.display_name,
                    role=LIBRARIAN,
                    password_hash=hash_password(account.password),
                ))

    # Los lectores se crean como cualquier otro: con sus regex y su carnet.
    for account in missing:
        if account.role == READER:
            _create_demo_reader(account)


def require_login(role: Optional[str]) -> None:
    """Regla de acceso: sin sesión iniciada no se usa la aplicación."""
    if role is None:
        raise AuthError("error.login_required")


def require_librarian(role: Optional[str]) -> None:
    """Regla de acceso: el catálogo, los lectores y los préstamos los gestiona
    el bibliotecario."""
    require_login(role)
    if role != LIBRARIAN:
        raise ForbiddenError("error.forbidden")


def require_reader_role(role: Optional[str]) -> None:
    """Regla de acceso: la cuenta propia y su carnet solo los consulta un lector."""
    require_login(role)
    if role != READER:
        raise ForbiddenError("error.forbidden")
