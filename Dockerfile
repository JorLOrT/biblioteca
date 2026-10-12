FROM python:3.11-slim

# La hora del contenedor es la de Lima: con ella se calculan la fecha de cada
# préstamo, su vencimiento, las multas y la hora del chat. Por defecto sería UTC,
# y a partir de las 19:00 de Perú ya sería «mañana».
ENV TZ=America/Lima \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# La base de datos vive en /data, que se monta como volumen para que sobreviva a
# cada despliegue. La aplicación no corre como root.
RUN useradd --create-home --uid 1000 biblioteca \
    && mkdir -p /data \
    && chown biblioteca:biblioteca /data
USER biblioteca

# La SECRET_KEY no va aquí: se pasa al arrancar (en Dokploy, en Environment).
ENV HOST=0.0.0.0 \
    PORT=5001 \
    LIBRARY_DB=/data/library.db

EXPOSE 5001

# Docker (y Dokploy) sabe si la aplicación responde: pide la página de inicio
# de sesión, que no necesita sesión.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '5001') + '/login', timeout=4)"]

# Gunicorn lee gunicorn.conf.py: un proceso, con hilos para los WebSockets.
CMD ["gunicorn", "app:create_app()"]
