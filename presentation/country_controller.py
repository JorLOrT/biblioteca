"""Endpoints REST de la consulta de países e idiomas.

El navegador no llama a countries.dev: pide aquí y el servidor consulta el
servicio externo a través del negocio. Así la validación, la caché y los
errores traducidos son los mismos para cualquier cliente.
"""

from flask import Blueprint, Response, jsonify, request

from business.country_service import CountryService
from entities.country import Country
from presentation.auth import login_required
from presentation.i18n import current_locale

country_bp = Blueprint("countries", __name__, url_prefix="/api/countries")
service = CountryService()

country_bp.before_request(login_required)


def _display_name(country: Country, lang: str) -> str:
    """El nombre del país en el idioma del usuario, si el servicio lo tiene."""
    return country.translations.get(lang) or country.name


@country_bp.get("")
def list_countries() -> Response:
    """GET /api/countries?region=Americas — los países de una región."""
    lang = current_locale()
    countries = service.list_countries(request.args.get("region", ""))
    return jsonify(
        [
            {"code": c.code, "name": _display_name(c, lang), "flag": c.flag}
            for c in countries
        ]
    )


@country_bp.get("/<code>")
def get_country(code: str) -> Response:
    """GET /api/countries/PER — un país con sus idiomas y su nombre nativo."""
    country = service.get_country(code)
    return jsonify(
        {
            "code": country.code,
            "name": _display_name(country, current_locale()),
            "native_name": country.native_name,
            "flag": country.flag,
            "region": country.region,
            "languages": [language.to_dict() for language in country.languages],
        }
    )
