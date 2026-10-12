"""La sesión del usuario: quién inició sesión y con qué papel.

La sesión de Flask es una cookie firmada con la SECRET_KEY: el navegador la
guarda, pero no puede cambiarla sin que el servidor lo note. Aquí se guarda lo
justo para no consultar la base de datos en cada petición: el usuario, su
nombre y su papel.

Qué puede hacer cada papel lo decide el negocio (`auth_service`); esta capa
solo le dice quién está pidiendo.
"""

from typing import Optional, TypedDict

from flask import session

from business import auth_service
from entities.user import User
from presentation.i18n import SESSION_KEY as LANG_KEY

SESSION_KEY = "user"


class SessionUser(TypedDict):
    username: str
    name: str
    role: str


def current_user() -> Optional[SessionUser]:
    """La cuenta de esta sesión, o None si nadie ha iniciado sesión."""
    user: Optional[SessionUser] = session.get(SESSION_KEY)
    return user


def _current_role() -> Optional[str]:
    user = current_user()
    return user["role"] if user else None


def _fresh_session() -> None:
    """Vacía la sesión, salvo el idioma elegido.

    Al entrar o salir no debe quedar nada de la persona anterior, como su
    lista de deseos.
    """
    lang = session.get(LANG_KEY)
    session.clear()
    if lang:
        session[LANG_KEY] = lang


def log_in(user: User) -> SessionUser:
    _fresh_session()
    data: SessionUser = {
        "username": user.username,
        "name": user.display_name,
        "role": user.role,
    }
    session[SESSION_KEY] = data
    return data


def log_out() -> None:
    _fresh_session()


def login_required() -> None:
    """Corta la petición si nadie inició sesión (401)."""
    auth_service.require_login(_current_role())


def librarian_required() -> None:
    """Corta la petición si quien pide no es el bibliotecario (401 o 403)."""
    auth_service.require_librarian(_current_role())
