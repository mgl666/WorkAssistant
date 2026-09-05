FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY index.mjs schema.sql ./
USER node
EXPOSE 3001
CMD ["npm", "start"]
