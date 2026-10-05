# syntax=docker/dockerfile:1
# Build arguments
ARG BUN_VERSION=1.4.2

# =========================================
# Stage 1: Build stage
# =========================================

FROM oven/bun:${BUN_VERSION}-alpine AS builder

WORKDIR /workspace
# Build and pack the adapter, then install this independent example.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY scripts ./scripts
COPY src ./src
COPY index.ts index.d.ts options.d.ts ambient.d.ts ./
RUN bun --bun run pack

WORKDIR /workspace/examples/nginx
COPY examples/nginx/package.json examples/nginx/bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY examples/nginx ./
RUN bun --bun run build

# =========================================
# Stage 2: Production stage
# =========================================

FROM oven/bun:${BUN_VERSION}-alpine AS production

WORKDIR /home/bun/app
# Set timezone to Europe/Podgorica
ENV TZ=Europe/Podgorica
RUN apk add --no-cache tzdata

# Copy built site app
COPY --from=builder --chown=bun:bun /workspace/examples/nginx/build ./

# Create public directory with correct permissions
RUN mkdir -p /home/bun/public && chown -R bun:bun /home/bun/public

USER bun

# Expose port
ENV PORT=3000
EXPOSE 3000

ENTRYPOINT [ "sh", "./entrypoint.sh" ]
# Start the application
CMD ["bun", "--bun", "run", "./index.js"]
