FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci


FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /app/uploads

EXPOSE 3001

CMD ["npm", "start"]
