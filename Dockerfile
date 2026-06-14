FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
RUN npm install tsconfig-paths
COPY --from=builder /app/dist ./dist
COPY tsconfig.json .
EXPOSE 3000
CMD ["node", "-r", "tsconfig-paths/register", "dist/main"]