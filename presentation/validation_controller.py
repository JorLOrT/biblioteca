"""Publica las expresiones regulares de validación para el navegador.

El formulario del navegador y la capa de negocio deben aplicar exactamente las
mismas reglas. En lugar de copiar los patrones en el JavaScript —donde se
quedarían desfasados en cuanto alguien cambiara uno—, se entregan aquí los que
define `business/validators.py`.

Es importante entender qué valida cada lado:
  - El navegador valida para dar aviso inmediato al usuario. Es comodidad.
  - El servidor valida porque es la autoridad. Aunque alguien desactive el
    JavaScript o llame a la API con curl, la validación se aplica igual.
"""

from flask import Blueprint, jsonify

from business.validators import PATTERNS

validation_bp = Blueprint("validation", __name__, url_prefix="/api/validation-rules")

# Qué campo del formulario usa qué patrón.
FORM_FIELDS = {
    "book": ["title", "author", "year", "isbn"],
    "loan": ["borrower", "dni", "email", "phone"],
}


@validation_bp.get("")
def get_rules():
    return jsonify({"patterns": PATTERNS, "forms": FORM_FIELDS})
