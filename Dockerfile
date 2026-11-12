# One image for both processes (restructuring plan §8):
#   API:    node dist/server.js   (default)
#   Worker: node dist/worker.js   (from API-12)
FROM node:22-alpine AS build
RUN npm i -g pnpm@10
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build && pnpm prune --prod

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY openapi ./openapi
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
