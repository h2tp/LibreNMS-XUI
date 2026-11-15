# ---- build du frontend
FROM node:22-alpine AS front
WORKDIR /src
COPY frontend/package.json ./
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- runtime
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 STATIC_DIR=/app/static RRD_DIR=/rrd DATA_DIR=/data
RUN apt-get update \
 && apt-get install -y --no-install-recommends rrdtool tini snmp \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -r -u 10001 -d /app xui \
 && mkdir -p /data && chown xui /data
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app.py .
COPY --from=front /src/dist /app/static
USER xui
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8080/healthz')" || exit 1
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","8080","--proxy-headers","--forwarded-allow-ips","*"]
