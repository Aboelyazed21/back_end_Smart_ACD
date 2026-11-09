# syntax=docker/dockerfile:1
# Build context: repository root (needs db/ and regulation-data/).
FROM node:20-alpine AS deps
WORKDIR /app/backend
COPY backend-api/package.json backend-api/package-lock.json ./
RUN npm ci

FROM deps AS build
COPY backend-api/tsconfig.json ./
COPY backend-api/src ./src
RUN npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=development \
    PORT=4000 \
    REGULATION_DATA_DIR=/app/regulation-data
WORKDIR /app/backend
COPY backend-api/package.json backend-api/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist ./dist
COPY db /app/db
COPY regulation-data /app/regulation-data
COPY backend-api/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
