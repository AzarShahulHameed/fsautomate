FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npx prisma generate

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node seeds/seed.js && node server.js"]
