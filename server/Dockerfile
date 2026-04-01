FROM node:22-alpine
# better-sqlite3 requires native compilation
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json ./
RUN npm install
COPY index.js ./
RUN mkdir -p data
ENV PORT=3002
EXPOSE 3002
CMD ["node", "index.js"]
