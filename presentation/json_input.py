"""Lectura de los datos JSON que manda el navegador, sin fiarse de su forma.

El cliente puede enviar cualquier cosa: un objeto, una lista, un número o un
texto que ni siquiera es JSON. Los controladores solo trabajan con objetos y
con textos, así que todo lo demás se convierte aquí en «vacío» y la validación
de la capa de negocio lo rechaza con su mensaje de siempre, en lugar de que el
servidor falle con un 500.
"""

from flask import request


def json_object(data: object) -> dict[str, object]:
    """`data` si es un objeto JSON; si es cualquier otra cosa, un objeto vacío."""
    return data if isinstance(data, dict) else {}


def request_json() -> dict[str, object]:
    """El cuerpo JSON de la petición HTTP actual, como objeto."""
    return json_object(request.get_json(silent=True))


def text_field(data: dict[str, object], key: str) -> str:
    """El campo como texto. Un número también vale (el año puede llegar como 1955)."""
    value = data.get(key)
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        return ""
    return str(value)
