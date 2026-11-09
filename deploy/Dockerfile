FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY api/package.json api/package.json
COPY web/package.json web/package.json
RUN npm ci

FROM dependencies AS build
COPY api/ api/
COPY web/ web/
ARG NEXT_PUBLIC_SUPPORT_WHATSAPP
ARG NEXT_PUBLIC_PAYMENT_REVIEW_HOURS=24
ENV API_INTERNAL_ORIGIN=http://api:3000 NEXT_TELEMETRY_DISABLED=1
RUN DATABASE_URL=postgresql://build:build@localhost/build npm run db:generate
RUN npm run build && rm -rf web/.next/cache web/.next/dev

FROM dependencies AS production
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 API_INTERNAL_ORIGIN=http://api:3000
COPY --from=build /app/api/dist api/dist
COPY --from=build /app/api/prisma api/prisma
COPY --from=build /app/api/prisma.config.ts api/prisma.config.ts
COPY --from=build /app/web/.next web/.next
COPY --from=build /app/web/public web/public
COPY --from=build /app/web/next.config.ts web/next.config.ts
RUN mkdir -p web/.next/cache api/storage && chown -R node:node web/.next/cache api/storage
USER node
