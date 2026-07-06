FROM node:26-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm i
COPY . .
RUN npm run build
FROM node:26-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm i --only=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/docs ./docs
EXPOSE 5001
CMD ["node", "dist/index.js"]
