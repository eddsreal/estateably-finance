FROM node:24
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter api
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY specs/001-personal-finance-manager/contracts specs/001-personal-finance-manager/contracts
RUN pnpm --filter api run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter api run db:migrate && pnpm --filter api run db:seed && node apps/api/dist/main.js"]
