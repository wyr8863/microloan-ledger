FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY index.html ./
COPY app.js ./
COPY styles.css ./

ENV PORT=10000
ENV DATA_DIR=/var/data

RUN mkdir -p /var/data

EXPOSE 10000

CMD ["npm", "start"]
