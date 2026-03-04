FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

---

## 3️⃣ `backend\.dockerignore`
```
node_modules
uploads/
.env
*.log
TAG_Image/