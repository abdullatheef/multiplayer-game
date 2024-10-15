# Use the official Python slim image as a base
FROM python:3.12-slim

# Install netcat (openbsd version)
RUN apt-get update && apt-get install -y netcat-openbsd && rm -rf /var/lib/apt/lists/*

# Set environment variables to avoid writing .pyc files and buffering stdout/stderr
ENV PYTHONUNBUFFERED 1
ENV PYTHONDONTWRITEBYTECODE 1

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code into the container
COPY . .

# Copy the entrypoint script and set permissions
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

# Expose the port your Django app runs on
EXPOSE 8000

# Set the entrypoint script to run on container start
ENTRYPOINT ["./entrypoint.sh"]
