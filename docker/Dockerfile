# Base (dependency install)
FROM node:20-alpine AS deps
WORKDIR /app
# Tools for git-based deps & native addons
RUN apk add --no-cache git openssh python3 make g++
COPY package.json yarn.lock ./
RUN yarn install

# Source layer (keeps deps cached if only src changes)
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=development
# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Dev runtime
FROM base AS dev
ENV NODE_ENV=development
EXPOSE 4000
CMD ["yarn","start:dev"]

# Production build (optional – skips dev deps)
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache git openssh python3 make g++
COPY package.json yarn.lock ./
RUN yarn install --production
COPY . .
EXPOSE 4000
CMD ["yarn","start"]