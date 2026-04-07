FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN addgroup -S maxine && adduser -S -u 10001 -G maxine maxine \
    && mkdir -p /app/data /app/logs \
    && chown -R maxine:maxine /app

USER maxine

EXPOSE 8080

CMD ["node", "index.js"]
