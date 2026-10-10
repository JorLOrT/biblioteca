FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Dentro del contenedor hay que escuchar en todas las interfaces para que el
# puerto publicado con `-p` llegue a la aplicación. La SECRET_KEY no va aquí:
# se pasa al arrancar, con `docker run -e SECRET_KEY=...`.
ENV HOST=0.0.0.0 \
    PORT=5001

EXPOSE 5001

CMD ["python", "app.py"]
