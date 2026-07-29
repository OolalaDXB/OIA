# OIA Funding workers — runs the discover→fetch→qualify→persist pipeline.
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
RUN corepack enable

WORKDIR /app

# Install workspace deps (leverage lockfile caching).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/workers ./apps/workers
RUN pnpm install --frozen-lockfile

# Run the worker for a project slug (default: bawaba). Override CMD as needed.
WORKDIR /app/apps/workers
CMD ["pnpm", "start", "--", "--project", "bawaba"]
