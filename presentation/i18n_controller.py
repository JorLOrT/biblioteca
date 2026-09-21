"""Endpoints de idioma.

`GET  /api/i18n`        entrega el catálogo completo, para que el JavaScript
                        pueda traducir lo que pinta dinámicamente.
`POST /api/i18n/<lang>` guarda el idioma elegido en la sesión — es, por tanto,
                        otra función con estado: el servidor recuerda en qué
                        idioma hablarle a este usuario.
"""

from flask import Blueprint, jsonify, session

from presentation.i18n import SESSION_KEY, SUPPORTED, catalog, current_locale, normalize

i18n_bp = Blueprint("i18n", __name__, url_prefix="/api/i18n")


@i18n_bp.get("")
def get_catalog():
    lang = current_locale()
    return jsonify({"lang": lang, "supported": list(SUPPORTED), "messages": catalog(lang)})


@i18n_bp.post("/<lang>")
def set_language(lang: str):
    code = normalize(lang)
    session[SESSION_KEY] = code  # <-- el idioma se recuerda entre peticiones
    return jsonify({"lang": code, "messages": catalog(code)})
