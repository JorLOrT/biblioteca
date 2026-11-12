"""Pasarela al servicio externo de países (countries.dev).

Es acceso a datos igual que un repositorio, solo que la fuente no es SQLite
sino una API REST: aquí se escribe la URL, se habla HTTP y se convierte el JSON
en las entidades `Country` y `Language`. Ninguna otra capa sabe de dónde salen
los países, así que cambiar de proveedor (por ejemplo, a restcountries.com, que
desde su v5 pide una clave) solo tocaría este archivo.

countries.dev es gratuito y no pide clave. Antes se llamaba apicountries.com.

Configuración:
  COUNTRIES_API_URL  otra dirección del servicio (https://countries.dev por defecto).
"""

import json
import os
import threading
import time
from typing import Any, Optional
from urllib.error import HTTPError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from entities.country import Country, Language

BASE_URL = os.environ.get("COUNTRIES_API_URL", "https://countries.dev").rstrip("/")
TIMEOUT = 8               # segundos: si tarda más, se avisa al usuario
CACHE_SECONDS = 24 * 3600  # los países casi nunca cambian
# Sin un User-Agent propio, Cloudflare rechaza la petición con un 403.
HEADERS = {"User-Agent": "Biblioteca-N-Capas/1.0", "Accept": "application/json"}

# Solo los campos que usa la aplicación: la respuesta pesa mucho menos.
SUMMARY_FIELDS = "alpha3Code,name,flag,translations"
DETAIL_FIELDS = "alpha3Code,name,flag,translations,region,nativeName,languages"


class CountriesUnavailableError(Exception):
    """El servicio de países no respondió, o respondió algo que no se entiende."""


def _language(data: dict[str, Any]) -> Language:
    return Language(
        name=data.get("name") or "",
        native_name=data.get("nativeName"),
        code=data.get("iso639_1"),
    )


def _country(data: dict[str, Any]) -> Country:
    return Country(
        code=data.get("alpha3Code") or "",
        name=data.get("name") or "",
        region=data.get("region"),
        native_name=data.get("nativeName"),
        flag=data.get("flag"),
        translations=data.get("translations") or {},
        languages=[_language(item) for item in data.get("languages") or []],
    )


class _TimedCache:
    """Guarda respuestas un tiempo, para no repetir la misma consulta por la red.

    Es compartida por todos los hilos del servidor, de ahí el candado. Los
    errores no se guardan: la próxima petición vuelve a intentarlo.
    """

    def __init__(self, seconds: float) -> None:
        self._seconds = seconds
        self._items: dict[str, tuple[float, object]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[object]:
        with self._lock:
            item = self._items.get(key)
            if item is None or time.monotonic() - item[0] > self._seconds:
                return None
            return item[1]

    def put(self, key: str, value: object) -> None:
        with self._lock:
            self._items[key] = (time.monotonic(), value)


class CountryGateway:
    """Consulta countries.dev. No valida ni decide nada: eso es del negocio."""

    _cache = _TimedCache(CACHE_SECONDS)

    def __init__(self, base_url: str = BASE_URL) -> None:
        # urlopen también abriría file:// y otros esquemas: solo se admite HTTP.
        if not base_url.startswith(("https://", "http://")):
            raise ValueError(f"COUNTRIES_API_URL debe ser http(s)://: {base_url}")
        self._base_url = base_url

    def _get_json(self, path: str, fields: str) -> Optional[object]:
        """El JSON de `path`, o None si el servicio dice que no existe (404)."""
        url = f"{self._base_url}{path}?{urlencode({'fields': fields})}"
        cached = self._cache.get(url)
        if cached is not None:
            return cached
        try:
            request = Request(url, headers=HEADERS)  # noqa: S310 (esquema comprobado)
            with urlopen(request, timeout=TIMEOUT) as response:  # noqa: S310
                data: object = json.load(response)
        except HTTPError as error:
            if error.code == 404:
                return None
            raise CountriesUnavailableError(f"HTTP {error.code} en {url}") from error
        except (OSError, ValueError) as error:
            # OSError: sin red, sin DNS o se agotó el tiempo (URLError es uno).
            # ValueError: la respuesta no era JSON.
            raise CountriesUnavailableError(f"{error} en {url}") from error
        self._cache.put(url, data)
        return data

    def get_by_region(self, region: str) -> list[Country]:
        """Los países de una región, sin sus idiomas."""
        data = self._get_json(f"/region/{quote(region)}", SUMMARY_FIELDS)
        if data is None:
            return []
        if not isinstance(data, list):
            raise CountriesUnavailableError(
                f"Respuesta inesperada para la región {region}"
            )
        return [_country(item) for item in data if isinstance(item, dict)]

    def get_by_code(self, code: str) -> Optional[Country]:
        """Un país por su código ISO 3166-1 alfa-3, con sus idiomas, o None."""
        data = self._get_json(f"/alpha/{quote(code)}", DETAIL_FIELDS)
        if data is None:
            return None
        if not isinstance(data, dict):
            raise CountriesUnavailableError(f"Respuesta inesperada para el país {code}")
        return _country(data)
