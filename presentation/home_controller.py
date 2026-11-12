"""Las páginas ya traducidas: inicio de sesión, la vista de cada papel y países.

Hay una página por papel. El bibliotecario ve el mostrador (préstamos y
catálogo para gestionar); el lector, el catálogo para consultar, su lista de
deseos y el chat con la biblioteca. Las dos usan la misma API: lo que cambia es
qué puede pedir cada uno, y eso lo comprueba el servidor en cada endpoint.
"""

from typing import Union

from flask import Blueprint, redirect, render_template, url_for
from werkzeug.wrappers import Response

from business.auth_service import DEMO_ACCOUNTS
from business.country_service import REGIONS
from entities.user import LIBRARIAN
from presentation.auth import current_user
from presentation.i18n import current_locale, translate

home_bp = Blueprint("home", __name__)

VIEWS = {LIBRARIAN: "librarian.html"}
READER_VIEW = "reader.html"


def _render(template: str, **context: object) -> str:
    lang = current_locale()

    # `t` se inyecta en la plantilla para traducir los textos fijos. Los textos
    # que pinta el JavaScript se traducen en el navegador con el catálogo que
    # entrega /api/i18n.
    def t(key: str, **params: object) -> str:
        return translate(key, lang=lang, **params)

    return render_template(template, lang=lang, t=t, **context)


@home_bp.get("/")
def index() -> Union[str, Response]:
    user = current_user()
    if user is None:
        return redirect(url_for("home.login"))
    return _render(VIEWS.get(user["role"], READER_VIEW), user=user)


@home_bp.get("/countries")
def countries() -> Union[str, Response]:
    """Países e idiomas: la misma página para los dos papeles."""
    user = current_user()
    if user is None:
        return redirect(url_for("home.login"))
    # Las regiones son fijas: van ya en la página y no hace falta pedirlas.
    return _render("countries.html", user=user, regions=REGIONS)


@home_bp.get("/login")
def login() -> Union[str, Response]:
    if current_user() is not None:
        return redirect(url_for("home.index"))
    return _render("login.html", user=None, accounts=DEMO_ACCOUNTS)
