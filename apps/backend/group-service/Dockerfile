FROM node:26-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:26-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/docs ./docs
EXPOSE 5006
# The base image's unprivileged user: nothing here writes outside /tmp.
USER node
CMD ["node", "dist/index.js"]
