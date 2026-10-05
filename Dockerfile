# CampusGuard API + web app. Any PaaS (Render, Railway, Fly.io) terminates HTTPS in front of it.
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY campusguard/ campusguard/
COPY models/ models/
COPY server/ server/
COPY web/ web/
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
