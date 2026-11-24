"""Reglas de la consulta de países e idiomas.

Los datos vienen de un servicio externo (`data_access/country_gateway.py`); el
negocio decide qué se le puede pedir y qué hacer cuando algo falla:
  - Las regiones son una lista fija: no cambian y así no hace falta una
    consulta por la red solo para llenar el primer desplegable.
  - Una región que no está en la lista o un código de país mal formado se
    rechazan antes de salir a la red.
  - Si el servicio no responde, el usuario recibe un aviso traducido, no un 500.
"""

import logging
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Optional

from business.exceptions import BusinessError, NotFoundError, ServiceUnavailableError
from business.validators import validate_field
from data_access.country_gateway import CountriesUnavailableError, CountryGateway
from entities.country import Country

# Las regiones que reconoce countries.dev. «Polar» es la Antártida.
REGIONS = ("Africa", "Americas", "Asia", "Europe", "Oceania", "Polar")

logger = logging.getLogger(__name__)


@contextmanager
def _service_errors() -> Iterator[None]:
    """Si la pasarela falla, el usuario recibe un aviso traducido y el registro
    del servidor guarda la causa real."""
    try:
        yield
    except CountriesUnavailableError as error:
        logger.warning("Servicio de países sin respuesta: %s", error)
        raise ServiceUnavailableError("error.countries_unavailable") from None


class CountryService:
    """Países por región y los idiomas de cada país."""

    def __init__(self, gateway: Optional[CountryGateway] = None) -> None:
        # La pasarela se puede sustituir (por ejemplo, en una prueba) sin tocar
        # este código.
        self._gateway = gateway or CountryGateway()

    def list_countries(self, region: str) -> list[Country]:
        """Los países de una región. La región se acepta sin distinguir mayúsculas."""
        wanted = region.strip().lower()
        canonical = next((r for r in REGIONS if r.lower() == wanted), None)
        if canonical is None:
            raise BusinessError("error.invalid_region")
        with _service_errors():
            return self._gateway.get_by_region(canonical)

    def get_country(self, code: str) -> Country:
        """Un país con sus idiomas, por su código de tres letras («PER»)."""
        clean_code = validate_field("country_code", code).upper()
        with _service_errors():
            country = self._gateway.get_by_code(clean_code)
        if country is None:
            raise NotFoundError("error.country_not_found", code=clean_code)
        return country
