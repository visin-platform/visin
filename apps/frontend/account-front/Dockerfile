# ---- Build Stage ----
FROM node:24-alpine AS builder
WORKDIR /app

# Copy source code and build
COPY . .
RUN npm i
RUN npm run build

# ---- Production Stage ----
FROM nginx:alpine

# Copy built app
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration  
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

# Copy startup script
COPY ./docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

# Use custom entrypoint to generate config at runtime
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
