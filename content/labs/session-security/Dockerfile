FROM python:3.13.7-slim
WORKDIR /lab
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY lab.py fixtures.json resultados.json ./
USER 65532:65532
ENTRYPOINT ["python", "lab.py"]
CMD ["--verify", "resultados.json"]
