"""Entidades Country (País) y Language (Idioma).

No se guardan en la base de datos: llegan del servicio externo countries.dev a
través de `data_access/country_gateway.py`.
"""

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Language:
    """Un idioma que se habla en un país."""

    name: str                   # en inglés, como lo da el servicio: «Spanish»
    native_name: Optional[str]  # en el propio idioma: «Español»
    code: Optional[str] = None  # ISO 639-1: «es». Algunos idiomas no lo tienen

    def to_dict(self) -> dict[str, object]:
        return {"name": self.name, "native_name": self.native_name, "code": self.code}


@dataclass
class Country:
    """Un país, con su nombre en otros idiomas y los idiomas que se hablan en él."""

    code: str                   # ISO 3166-1 alfa-3: «PER»
    name: str                   # en inglés: «Peru»
    region: Optional[str] = None
    native_name: Optional[str] = None  # en su propio idioma: «Perú»
    flag: Optional[str] = None         # emoji: «🇵🇪»
    # El nombre del país en otros idiomas, por código: {"es": "Perú", ...}.
    translations: dict[str, str] = field(default_factory=dict)
    languages: list[Language] = field(default_factory=list)
