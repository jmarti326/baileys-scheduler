FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/
COPY views/ ./views/

RUN mkdir -p /app/data

ENV PORT=3000
ENV TZ=America/Puerto_Rico

EXPOSE 3000

CMD ["node", "src/index.js"]
