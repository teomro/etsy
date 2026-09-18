FROM node:20-alpine AS build

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install --include=dev --ignore-scripts

COPY src ./src
RUN npm run build

FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

COPY --from=build /app/dist ./dist

ENTRYPOINT ["node", "dist/index.js"]
