FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=development
ENV PORT=4000
ENV TZ=Asia/Kolkata

EXPOSE 4000

CMD ["node", "src/server.js"]
