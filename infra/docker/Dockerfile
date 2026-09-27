FROM node:22.14.0-alpine AS build

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

FROM node:22.14.0-alpine AS api

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/packages/contracts packages/contracts
COPY --from=build --chown=node:node /app/packages/database packages/database
COPY --from=build --chown=node:node /app/apps/api apps/api

USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]

FROM node:22.14.0-alpine AS worker

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/packages/contracts packages/contracts
COPY --from=build --chown=node:node /app/packages/database packages/database
COPY --from=build --chown=node:node /app/apps/worker apps/worker

USER node
CMD ["node", "apps/worker/dist/main.js"]

FROM nginx:1.27-alpine AS web

COPY infra/docker/nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
