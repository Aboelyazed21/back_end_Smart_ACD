# syntax=docker/dockerfile:1
# Build context: repository root (needs regulation-data/).
FROM python:3.11-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    REGULATION_DATA_DIR=/app/regulation-data
WORKDIR /app
COPY rule-engine/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY rule-engine/app ./app
COPY regulation-data /app/regulation-data
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).read()"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
