"""Configuración de Gunicorn, el servidor con el que corre la aplicación en Docker.

`python app.py` usa el servidor de desarrollo de Flask, que no está hecho para
producción. En el contenedor la sirve Gunicorn, que lee este archivo solo:
lo busca en la carpeta desde la que se arranca.

Un solo proceso, a propósito. Los contadores de actividad, las conversaciones
del chat y los WebSockets abiertos viven en la memoria del proceso: con dos
procesos, cada uno tendría los suyos y un mensaje no llegaría a quien está
conectado al otro. Para atender a varios a la vez se usan hilos; cada WebSocket
ocupa uno mientras está abierto.
"""

import os

bind = f"0.0.0.0:{os.environ.get('PORT', '5001')}"
workers = 1
threads = int(os.environ.get("GUNICORN_THREADS", "100"))

# Con hilos, el proceso sigue avisando al maestro de que está vivo aunque un
# WebSocket lleve horas abierto: este plazo solo salta si el proceso se cuelga.
timeout = 60
# Al redesplegar, los WebSockets no terminan solos: se les da poco margen y los
# navegadores se reconectan al contenedor nuevo.
graceful_timeout = 10

# Los registros, a la salida estándar: los recoge Docker (y los muestra Dokploy).
accesslog = "-"
errorlog = "-"
