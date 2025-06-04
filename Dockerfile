FROM node:20

WORKDIR /app

# Salin backend langsung dari root/backend
COPY backend/ ./

RUN npm install

CMD ["npm", "start"]
