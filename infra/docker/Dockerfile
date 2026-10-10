FROM node:22.23.3-alpine3.23 AS build

WORKDIR /app
RUN npm install --global pnpm@12.5.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json

RUN pnpm install --frozen-lockfile

COPY apps apps
COPY packages packages

RUN pnpm --filter @farmacia/database exec prisma generate \
  && pnpm --filter @farmacia/contracts build \
  && pnpm --filter @farmacia/database build \
  && pnpm --filter @farmacia/api build \
  && pnpm --filter @farmacia/worker build \
  && pnpm --filter @farmacia/web build

FROM node:22.23.3-alpine3.23 AS api

WORKDIR /app
ENV NODE_ENV=production

# bash y cliente de PostgreSQL 18 (pg_dump debe ser >= versión del servidor postgres:18);
# age cifra la copia externa, rclone la sube y tzdata da la hora local del programador
RUN apk add --no-cache bash postgresql18-client age rclone tzdata \
  && mkdir -p /app/infra/scripts /app/infra/backups \
  && chown -R node:node /app/infra

COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/packages/contracts packages/contracts
COPY --from=build --chown=node:node /app/packages/database packages/database
COPY --from=build --chown=node:node /app/apps/api apps/api
COPY --chown=node:node infra/scripts /app/infra/scripts
RUN chmod +x /app/infra/scripts/*.sh

USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]

FROM node:22.23.3-alpine3.23 AS worker

WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache bash postgresql18-client \
  && mkdir -p /app/infra/scripts /app/infra/backups \
  && chown -R node:node /app/infra

COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/packages/contracts packages/contracts
COPY --from=build --chown=node:node /app/packages/database packages/database
COPY --from=build --chown=node:node /app/apps/worker apps/worker
COPY --chown=node:node infra/scripts /app/infra/scripts
RUN chmod +x /app/infra/scripts/*.sh

USER node
CMD ["node", "apps/worker/dist/main.js"]

FROM nginx:1.27-alpine AS web

COPY infra/docker/nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
