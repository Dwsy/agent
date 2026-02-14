FROM oven/bun:1 AS base
WORKDIR /app

# Install pi CLI
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g @mariozechner/pi-coding-agent && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Copy source
COPY src/ src/
COPY pi-gateway.jsonc ./

EXPOSE 52134

# Data volumes
VOLUME ["/root/.pi/gateway", "/root/.pi/agent"]

CMD ["bun", "run", "src/cli.ts", "gateway", "--port", "52134"]
