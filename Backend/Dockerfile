FROM python:3.14-slim

ARG EXTRA_REQS=dev.txt

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements/base.txt requirements/base.txt
COPY requirements/${EXTRA_REQS} requirements/extra.txt
RUN pip install --no-cache-dir -r requirements/base.txt -r requirements/extra.txt

COPY . .

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
