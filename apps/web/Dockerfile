FROM node:24 AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/contract/package.json packages/contract/
RUN pnpm install --frozen-lockfile --filter web --filter contract
COPY tsconfig.base.json ./
COPY apps/web apps/web
COPY packages/contract packages/contract
COPY specs/001-personal-finance-manager/contracts specs/001-personal-finance-manager/contracts
COPY design design
RUN pnpm --filter contract run contract:generate && pnpm --filter web run build

FROM nginx:1.29
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
