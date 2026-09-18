FROM node:20-alpine

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install --ignore-scripts

COPY src ./src
RUN npm run build

ENTRYPOINT ["node", "dist/index.js"]
