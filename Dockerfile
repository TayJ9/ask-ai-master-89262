# Stage 1: build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/
COPY backend/package.json ./backend/
RUN npm ci
COPY frontend ./frontend
RUN npm run build:frontend

# Stage 2: runtime
# COPY from frontend-build BEFORE npm ci so BuildKit runs stages sequentially
# (default order runs both npm ci steps in parallel and OOMs small VPS hosts)
FROM node:20-alpine
WORKDIR /app
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
RUN npm ci --omit=dev
COPY backend ./backend
ENV NODE_ENV=production
WORKDIR /app/backend
EXPOSE 5000
CMD ["npm", "start"]
