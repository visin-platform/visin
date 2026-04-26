FROM node:24-alpine AS builder
WORKDIR /app
COPY . .
RUN npm i
RUN npm run build

FROM node:24-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm i --only=production
COPY --from=builder /app/dist ./dist
EXPOSE 5002
CMD ["node", "dist/index.js"]
