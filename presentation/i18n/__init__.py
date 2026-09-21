"""Internacionalización (i18n) — vive en la capa de Presentación.

El idioma es una cuestión de presentación, no de negocio. Por eso la capa de
negocio lanza CLAVES de mensaje (`error.book_already_lent`) junto con sus
parámetros, y es aquí donde esas claves se convierten en un texto en el idioma
del usuario. La capa de negocio sigue sin saber en qué idioma se le hablará.

El idioma se decide en este orden:
  1. `?lang=en` en la URL          (para enlazar o probar un idioma concreto)
  2. el idioma guardado en la sesión (lo que el usuario eligió antes)
  3. la cabecera `Accept-Language`   (el idioma del navegador)
  4. español, por defecto
"""

import json
import os
from typing import Dict, Optional

from flask import request, session

SUPPORTED = ("es", "en")
DEFAULT = "es"
SESSION_KEY = "lang"

_CATALOG_DIR = os.path.dirname(os.path.abspath(__file__))
_catalogs: Dict[str, Dict[str, str]] = {}


def normalize(lang: Optional[str]) -> str:
    """Devuelve un idioma soportado. 'en-US' -> 'en'; cualquier otro -> 'es'."""
    if not lang:
        return DEFAULT
    code = str(lang).strip().lower()[:2]
    return code if code in SUPPORTED else DEFAULT


def catalog(lang: Optional[str] = None) -> Dict[str, str]:
    """Carga (y cachea) el diccionario de traducciones de un idioma."""
    code = normalize(lang)
    if code not in _catalogs:
        path = os.path.join(_CATALOG_DIR, "{}.json".format(code))
        with open(path, encoding="utf-8") as archivo:
            _catalogs[code] = json.load(archivo)
    return _catalogs[code]


def current_locale() -> str:
    """El idioma que corresponde a esta petición.

    Si viene `?lang=` se guarda además en la sesión. Es importante: la página la
    renderiza el servidor, pero el JavaScript pide su catálogo en otra petición
    aparte (`/api/i18n`) que no lleva ese parámetro. Si `?lang=` no se guardara,
    la página se vería en un idioma y los textos dinámicos en otro.
    """
    if request.args.get("lang"):
        code = normalize(request.args.get("lang"))
        session[SESSION_KEY] = code
        return code

    if session.get(SESSION_KEY):
        return normalize(session.get(SESSION_KEY))

    return normalize(request.accept_languages.best_match(SUPPORTED))


def translate(key: str, lang: Optional[str] = None, **params) -> str:
    """Traduce una clave y sustituye sus parámetros.

    Si la clave no existe se devuelve la propia clave: así un texto sin
    traducir se nota enseguida, en lugar de aparecer vacío.
    """
    plantilla = catalog(lang or current_locale()).get(key, key)
    try:
        return plantilla.format(**params)
    except (KeyError, IndexError):
        return plantilla
