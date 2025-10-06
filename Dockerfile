# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    TZ=UTC

WORKDIR /app

# Install system deps (git, ca-certificates) if needed
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install only production deps
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Copy app source
COPY src ./src
COPY scripts ./scripts

# Expose the port (Cloud Run will set PORT, default 5000)
ENV PORT=5000
EXPOSE 5000

# Healthcheck (optional but useful for GCP)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+process.env.PORT+'/health',r=>{if(r.statusCode!==200)process.exit(1)}).on('error',()=>process.exit(1))" || exit 1

# Start the server
CMD ["node", "src/server.js"]
