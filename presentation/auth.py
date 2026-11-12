"""Quién hace cada petición: por su cookie de sesión o por su token JWT.

Hay dos formas de identificarse, y las dos llevan lo justo para no consultar la
base de datos en cada petición: el usuario, su nombre y su papel.

  - El NAVEGADOR usa la sesión de Flask: una cookie firmada con la SECRET_KEY,
    HttpOnly, que el JavaScript de la página no puede leer.
  - Un CLIENTE DE LA API envía `Authorization: Bearer <token>` con el JWT que le
    dio `POST /api/auth/token`. Si la cabecera está, manda ella: un token malo
    responde 401 aunque también llegue una cookie válida.

Qué puede hacer cada papel lo decide el negocio (`auth_service`); esta capa
solo le dice quién está pidiendo.
"""

from typing import Optional, TypedDict

from flask import current_app, g, request, session

from business import auth_service
from business.exceptions import AuthError
from business.token_service import TokenService
from entities.user import User
from presentation.i18n import SESSION_KEY as LANG_KEY

SESSION_KEY = "user"
# Dónde guarda create_app() el servicio de tokens.
TOKENS_EXTENSION = "token_service"


class SessionUser(TypedDict):
    username: str
    name: str
    role: str


def token_service() -> TokenService:
    service: TokenService = current_app.extensions[TOKENS_EXTENSION]
    return service


def _bearer_token() -> Optional[str]:
    """El token de la cabecera Authorization; None si la petición no la trae."""
    header = request.headers.get("Authorization")
    if header is None:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise AuthError("error.token_invalid")
    return token.strip()


def auth_method() -> Optional[str]:
    """"bearer" o "session", según cómo se identificó la petición."""
    if request.headers.get("Authorization") is not None:
        return "bearer"
    return "session" if session.get(SESSION_KEY) else None


def current_user() -> Optional[SessionUser]:
    """La cuenta que hace la petición, o None si nadie se identificó.

    Se calcula una vez por petición: el token se comprueba una sola vez aunque
    varias funciones pregunten quién es.
    """
    if "auth_user" not in g:
        token = _bearer_token()
        if token is not None:
            claims = token_service().verify(token)
            g.auth_user = SessionUser(username=claims.username, name=claims.name,
                                      role=claims.role)
        else:
            g.auth_user = session.get(SESSION_KEY)
    user: Optional[SessionUser] = g.auth_user
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
    g.auth_user = data
    return data


def log_out() -> None:
    _fresh_session()
    g.pop("auth_user", None)


def login_required() -> None:
    """Corta la petición si nadie inició sesión (401)."""
    auth_service.require_login(_current_role())


def librarian_required() -> None:
    """Corta la petición si quien pide no es el bibliotecario (401 o 403)."""
    auth_service.require_librarian(_current_role())


def reader_required() -> None:
    """Corta la petición si quien pide no es un lector (401 o 403)."""
    auth_service.require_reader_role(_current_role())
