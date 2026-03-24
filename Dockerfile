# ---------- Base ----------
FROM node:20-alpine AS base
RUN apk add --no-cache openssl openssl-dev
WORKDIR /app
RUN corepack enable

# ---------- Dependencies ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- Builder ----------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN pnpm prisma generate

# Build TypeScript
RUN pnpm build

# ---------- Production ----------
FROM node:20-alpine AS production
RUN apk add --no-cache openssl openssl-dev
WORKDIR /app
RUN corepack enable

# Copy only required files
COPY package.json pnpm-lock.yaml ./

# Install ONLY production deps
RUN pnpm install --frozen-lockfile --prod

# Copy built app
COPY --from=builder /app/dist ./dist

# Copy Prisma (schema needed for migrations/runtime)
COPY prisma ./prisma

# Copy Prisma client (inside node_modules)
COPY --from=builder /app/node_modules ./node_modules

# Expose port
EXPOSE 3000

# Start app
CMD ["node", "dist/server.js"]
