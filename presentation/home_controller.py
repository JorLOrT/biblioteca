"""Sirve la página web de la biblioteca, ya traducida al idioma del usuario."""

from flask import Blueprint, render_template

from presentation.i18n import SUPPORTED, current_locale, translate

home_bp = Blueprint("home", __name__)


@home_bp.get("/")
def index():
    lang = current_locale()

    # `t` se inyecta en la plantilla para traducir los textos fijos. Los textos
    # que pinta el JavaScript se traducen en el navegador con el catálogo que
    # entrega /api/i18n.
    def t(key, **params):
        return translate(key, lang=lang, **params)

    return render_template("index.html", lang=lang, t=t, supported=SUPPORTED)
