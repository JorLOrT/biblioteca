"""Validación de formularios mediante expresiones regulares (regex).

Los patrones viven en la capa de NEGOCIO, no en el formulario HTML. Ese es el
punto importante: el navegador puede saltarse cualquier validación (basta con
desactivar el JavaScript o llamar a la API con curl), así que la comprobación
que manda es la del servidor.

Para no escribir las mismas expresiones dos veces, la capa de presentación
publica estos mismos patrones en `GET /api/validation-rules` y el navegador los
usa tal cual. Hay una sola fuente de verdad: este archivo.

Las expresiones están escritas en el subconjunto común de Python y JavaScript,
de modo que se comportan igual en el servidor y en el navegador.

Las funciones de este módulo son STATELESS: el resultado depende solo de lo que
reciben.
"""

import re
from typing import Dict

from business.exceptions import BusinessError

LETRAS = "A-Za-zÁÉÍÓÚÜÑáéíóúüñ"

PATTERNS: Dict[str, str] = {
    # Título: de 2 a 120 caracteres y que no sea solo espacios.
    "title": r"^(?!\s*$).{2,120}$",

    # Autor: letras, espacios, puntos, apóstrofos y guiones. Ninguna cifra.
    "author": r"^[{L}][{L}.'\- ]{{2,79}}$".format(L=LETRAS),

    # Año: exactamente cuatro cifras (el rango válido lo comprueba BookService).
    "year": r"^\d{4}$",

    # ISBN-13: empieza por 978 o 979 y tiene 13 cifras en total,
    # con guiones o espacios opcionales entre ellas.
    "isbn": r"^97[89][-\s]?(?:\d[-\s]?){9}\d$",

    # Nombre del prestatario: al menos dos palabras de dos letras o más.
    "borrower": r"^[{L}]{{2,}}(?: [{L}]{{2,}})+$".format(L=LETRAS),

    # DNI peruano: ocho cifras.
    "dni": r"^\d{8}$",

    # Correo electrónico.
    "email": r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$",

    # Celular peruano: nueve cifras que empiezan por 9.
    "phone": r"^9\d{8}$",
}

# Se compilan una sola vez, al importar el módulo.
_COMPILADOS = {campo: re.compile(patron) for campo, patron in PATTERNS.items()}


def validate_field(field: str, value: str) -> str:
    """Comprueba un campo contra su expresión regular.

    Devuelve el valor ya recortado si encaja; si no, lanza un `BusinessError`
    con la clave `error.invalid_<campo>`, que la capa de presentación traducirá
    al idioma del usuario.
    """
    if field not in _COMPILADOS:
        raise BusinessError("error.unexpected")

    texto = (value or "").strip() if isinstance(value, str) else str(value or "").strip()

    if not _COMPILADOS[field].match(texto):
        raise BusinessError("error.invalid_{}".format(field))

    return texto


def normalize_isbn(isbn: str) -> str:
    """Deja el ISBN en cifras, sin guiones ni espacios, para guardarlo igual siempre."""
    return re.sub(r"[-\s]", "", isbn or "")
