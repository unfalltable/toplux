FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig*.json vite.config.ts ./
COPY apps/api apps/api
COPY apps/admin_web apps/admin_web
COPY design design
RUN npm run build && npx tsc -p tsconfig.server.json

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/apps/api/migrations ./apps/api/migrations
COPY --from=build /app/design ./design
USER node
EXPOSE 3180
CMD ["node","dist/api/main.js"]
