"""Tokens JWT: la credencial de quien usa los servicios sin navegador.

El navegador entra con la cookie de sesión. Un cliente de la API (otro
programa, Postman, curl) pide un token a `POST /api/auth/token` y lo envía en
cada petición como `Authorization: Bearer <token>`.

El token es un JWT firmado con HMAC-SHA256 (HS256). Lleva quién es la cuenta,
su papel y hasta cuándo vale. El servidor no guarda nada: le basta comprobar la
firma y la fecha para saber que el token lo emitió él y que nadie lo cambió.

Reglas al comprobarlo:
  - Solo se acepta HS256. Un token con otro algoritmo, o con "none", se rechaza.
  - Son obligatorios el emisor, el sujeto, la emisión y el vencimiento.
  - Un token vencido o alterado no da acceso: el negocio lanza AuthError (401).

La firma usa una clave derivada de la SECRET_KEY, distinta de la que firma la
cookie de sesión: si una se filtrara, no serviría para fabricar la otra.
"""

import hashlib
import hmac
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import jwt

from business.exceptions import AuthError
from entities.user import LIBRARIAN, READER

ALGORITHM = "HS256"
ISSUER = "biblioteca-n-capas"
DEFAULT_LIFETIME = timedelta(hours=1)
# Etiqueta para derivar la clave de los tokens a partir de la SECRET_KEY.
_KEY_LABEL = b"biblioteca-jwt"
_ROLES = (LIBRARIAN, READER)


@dataclass(frozen=True)
class IssuedToken:
    """Un token recién emitido y los segundos que vale."""

    access_token: str
    expires_in: int


@dataclass(frozen=True)
class TokenClaims:
    """Quién es la cuenta del token: lo que se firma y lo que se lee al comprobarlo."""

    username: str
    name: str
    role: str


def derive_key(secret: str) -> bytes:
    """32 bytes para firmar los tokens, sacados de la SECRET_KEY con HMAC-SHA256.

    HS256 pide una clave de al menos 256 bits; así la clave siempre los tiene,
    aunque la SECRET_KEY sea más corta.
    """
    return hmac.new(secret.encode("utf-8"), _KEY_LABEL, hashlib.sha256).digest()


class TokenService:
    """Emite y comprueba los JWT de la aplicación."""

    def __init__(self, secret: str, lifetime: timedelta = DEFAULT_LIFETIME) -> None:
        if not secret:
            raise ValueError("Hace falta una clave para firmar los tokens")
        if lifetime <= timedelta(0):
            raise ValueError("La vigencia de un token debe ser positiva")
        self._key = derive_key(secret)
        self._lifetime = lifetime

    def issue(self, claims: TokenClaims) -> IssuedToken:
        """Un token para la cuenta, que vence al cumplirse la vigencia."""
        now = datetime.now(timezone.utc)
        payload = {
            "iss": ISSUER,
            "sub": claims.username,
            "name": claims.name,
            "role": claims.role,
            "iat": now,
            "exp": now + self._lifetime,
            # Identificador único: dos tokens de la misma cuenta nunca son iguales.
            "jti": uuid.uuid4().hex,
        }
        token = jwt.encode(payload, self._key, algorithm=ALGORITHM)
        return IssuedToken(token, int(self._lifetime.total_seconds()))

    def verify(self, token: str) -> TokenClaims:
        """Lo que dice el token, si la firma y las fechas son válidas. Si no, 401."""
        try:
            payload = jwt.decode(
                token,
                self._key,
                algorithms=[ALGORITHM],
                issuer=ISSUER,
                options={"require": ["iss", "sub", "iat", "exp"]},
            )
        except jwt.ExpiredSignatureError:
            raise AuthError("error.token_expired") from None
        except jwt.InvalidTokenError:
            raise AuthError("error.token_invalid") from None

        # La firma es buena, pero el contenido también debe tener sentido.
        username = payload.get("sub")
        name = payload.get("name")
        role = payload.get("role")
        if not isinstance(username, str) or not isinstance(name, str):
            raise AuthError("error.token_invalid")
        if not isinstance(role, str) or role not in _ROLES:
            raise AuthError("error.token_invalid")
        return TokenClaims(username=username, name=name, role=role)
