# Image unique : API + application web, servies ensemble (ex. sur tobe.eledji.com).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DATA_DIR=/data UPLOAD_DIR=/data/uploads
COPY --from=build /app /app
RUN npm prune --omit=dev --workspaces --include-workspace-root || true
VOLUME ["/data"]
EXPOSE 8787
CMD ["npm", "start"]
