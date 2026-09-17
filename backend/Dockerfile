FROM node:20-slim AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src
COPY dist ./dist

EXPOSE 3001

CMD ["node", "dist/index.js"]
