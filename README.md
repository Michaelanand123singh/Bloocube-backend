## GCS media storage (Option B - Default Credentials)

Set these environment variables for the backend service (Cloud Run recommended):

- `GCS_BUCKET=blucubemedia`
- `GCS_PROJECT_ID=theta-spirit-473421-u3`
- (Do not set `GCS_KEYFILE` or `GOOGLE_APPLICATION_CREDENTIALS` on Cloud Run; default credentials will be used.)

Grant the Cloud Run service account access:

- Role: `roles/storage.objectAdmin` on bucket `blucubemedia`.

After deploy, uploaded media will be stored at:

- `gs://blucubemedia/media/YYYY/MM/DD/<hash>.<ext>`
- Public URL (if public-read): `https://storage.googleapis.com/blucubemedia/media/...`

Local dev (optional):

```bash
gcloud auth application-default login
export GCS_BUCKET=blucubemedia
export GCS_PROJECT_ID=theta-spirit-473421-u3
```

# Bloocube Backend

Node.js/Express backend for Bloocube – a social media management and AI‑driven influencer marketplace. Implements authentication, campaigns, bids, analytics, admin tooling, AI integrations, background jobs, and notifications.

## Tech Stack

- Runtime: Node.js (Express)
- Database: MongoDB (Mongoose)
- Cache/Rate limiting: Redis
- Auth: JWT (access + refresh)
- Validation: Joi + express-validator
- Jobs/Cron: node-cron
- Emails: Nodemailer
- Logging: Winston + morgan
- Security: helmet, express-mongo-sanitize, hpp, CORS, rate limiters
- AI Integration: External FastAPI/LangChain service

## Prerequisites

- Node.js LTS (>=18)
- npm or yarn
- MongoDB instance
- Redis instance
- Optional: Running AI service (FastAPI) reachable via `AI_SERVICE_URL`

## Getting Started

```bash
# from repo root
cd Bloocube-backend

# install deps
npm install

# copy env and configure
cp .env.example .env

# start dev
npm run dev

# or start prod
npm start
```

Server runs on `http://localhost:5000` by default. Health check: `GET /health`.

## Environment Variables

See `.env.example`. Key variables:

- Server
  - `NODE_ENV` (development|production)
  - `PORT` (default 5000)
- Database
  - `MONGODB_URI` (required)
- Redis
  - `REDIS_URL` (e.g., redis://localhost:6379)
- JWT
  - `JWT_SECRET` (required)
  - `JWT_EXPIRE` (default 7d)
  - `JWT_REFRESH_SECRET`
  - `JWT_REFRESH_EXPIRE` (default 30d)
- Email
  - `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM`
- CORS
  - `CORS_ORIGIN` (default http://localhost:3000)
- AI Service
  - `AI_SERVICE_URL` (e.g., http://localhost:8000)
  - `AI_SERVICE_API_KEY`
- Logging
  - `LOG_LEVEL` (info|debug|warn|error)

## NPM Scripts

- `npm run dev` – start with nodemon
- `npm start` – start server
- `npm test` – run tests (scaffold)
- `npm run seed` – seed basic data
- `npm run migrate` – placeholder (Mongoose schemas)
- `npm run backup` – database backup shell script

## Project Structure

```text
src/
  app.js                 # Express app bootstrap (middlewares, routes)
  server.js              # Entrypoint: DB/Redis connect, start server
  config/
    env.js               # Env loader + defaults
    db.js                # Mongoose connection + lifecycle
    redis.js             # Redis client wrapper
  controllers/
    authController.js    # Auth, profile, password flows
    campaignController.js# Campaign CRUD, shortlist, analytics
    bidController.js     # Bid CRUD, feedback, analytics
    analyticsController.js
    adminController.js   # Admin dashboards, user mgmt
    aiController.js      # AI endpoints → AI service
  middlewares/
    auth.js              # authenticate/authorize/ownership
    errorHandler.js      # async handler + global error handling
    rateLimiter.js       # Redis/memory-backed rate limits
  models/
    User.js              # Users (creator|brand|admin)
    Campaign.js          # Campaigns created by brands
    Bid.js               # Creator bids on campaigns
    Analytics.js         # Post analytics per platform
    AI_Results.js        # AI outputs and metadata
  routes/
    auth.routes.js
    campaign.routes.js
    bid.routes.js
    analytics.routes.js
    admin.routes.js
    ai.routes.js
  services/
    aiClient.js          # HTTP client to AI service
    notifier/
      email.js           # Email sender (Nodemailer)
      push.js            # Push sender (ext service)
    scheduler/
      jobScheduler.js    # Cron jobs (sync/cleanup)
    social/
      instagram.js, linkedin.js, twitter.js, youtube.js
  utils/
    logger.js            # Winston logger
    jwt.js               # JWT helpers
    validator.js         # Joi/express-validator schemas
    constants.js         # enums, statuses, config constants
  jobs/
    cleanup.js           # Expired AI results cleanup
scripts/
  seed_db.js            # Seed sample users
  migrate.js            # Placeholder migrations
  backup.sh             # Mongo backup script
```

## API Overview

Base URL: `/api`

- Auth (`/auth`)
  - `POST /register`
  - `POST /login`
  - `GET /me` (auth)
  - `PUT /me` (auth)
  - `POST /change-password` (auth)
  - `POST /request-password-reset`
  - `POST /reset-password/:token`
  - `POST /logout` (auth)
  - `GET /verify/:token`
  - `POST /resend-verification` (auth)

- Campaigns (`/campaigns`)
  - `GET /` (auth) – list with filters/pagination
  - `POST /` (brand|admin) – create
  - `GET /:id` (auth) – details
  - `PUT /:id` (owner|admin)
  - `DELETE /:id` (owner|admin)
  - `GET /brand/:brandId` (brand|admin)
  - `GET /:id/bids` (owner|admin)
  - `POST /:campaignId/bids/:bidId/accept` (owner|admin)
  - `POST /:campaignId/bids/:bidId/reject` (owner|admin)
  - `GET /:id/analytics` (owner|admin)

- Bids (`/bids`)
  - `POST /` (creator|admin) – create
  - `GET /` (auth) – list (creator sees own, admin sees all)
  - `GET /:id` (auth)
  - `PUT /:id` (creator|admin)
  - `POST /:id/withdraw` (creator|admin)
  - `GET /creator/:creatorId` (creator|admin)
  - `GET /:id/analytics` (auth)
  - `POST /:id/feedback` (auth)

- Analytics (`/analytics`)
  - `POST /` (admin)
  - `GET /user/:userId` (auth)
  - `GET /top` (auth)
  - `GET /platform/:platform` (auth)

- Admin (`/admin`) (admin only)
  - `GET /dashboard`
  - `GET /users`
  - `PATCH /users/:id/toggle`
  - `GET /campaigns`
  - `GET /logs`

- AI (`/ai`) (auth)
  - `POST /competitor-analysis`
  - `POST /suggestions`
  - `POST /matchmaking`

Authentication uses Bearer access tokens; some flows also rely on refresh tokens.

## Validation & Error Handling

- Joi schemas for request bodies; express-validator for route‑level rules.
- Global error handler returns JSON with `success=false`, `message`, `code` and (in dev) `stack`.
- Common error codes defined in `utils/constants.js`.

## Security

- `helmet`, `cors`, `express-mongo-sanitize`, `hpp`, JSON limits, compression.
- Role-based authorization via `middlewares/auth.js`.
- Rate limiting (memory in dev, Redis in prod) configured in `middlewares/rateLimiter.js`.

## Logging & Monitoring

- `winston` logs to console (dev) and files (`logs/*`) with timestamps and JSON metadata.
- `morgan` HTTP request logging.
- Helper channels: `logger.api`, `logger.database`, `logger.security`, `logger.performance`.

## Background Jobs

- Cron schedules defined in `utils/constants.CR0N_SCHEDULES` and bootstrapped in `services/scheduler/jobScheduler.js` (e.g., analytics sync, AI results cleanup).
- One-off job example in `jobs/cleanup.js`.

## Seeding & Migrations

```bash
# seed sample users (admin/brand/creator)
npm run seed

# migrations placeholder (using Mongoose schemas)
npm run migrate
```

## Backups

```bash
MONGODB_URI="mongodb://..." npm run backup
```
Outputs to `backups/<timestamp>/` via `scripts/backup.sh`.

## Docker (suggested)

Create a `docker-compose.yml` to run MongoDB, Redis, and the backend. Example snippet:

```yaml
services:
  mongo:
    image: mongo:7
    ports: ["27017:27017"]
  redis:
    image: redis:7
    ports: ["6379:6379"]
  backend:
    build: .
    env_file: .env
    ports: ["5000:5000"]
    depends_on: [mongo, redis]
```

## Testing

- Test framework is scaffolded (`jest`, `supertest`). Add tests under `tests/`:

```bash
npm test
```

## Conventions

- RESTful resource naming
- Consistent response envelope `{ success, message?, data? }`
- Use pagination (`page`, `limit`), sorting (`sort`), and filters in list endpoints

## Extending

- Implement real social API clients in `services/social/*` (OAuth, posting, insights)
- Implement real email templates and SMTP/provider secrets
- Integrate AI service response schemas with `AI_Results` model
- Add comprehensive unit/integration tests and CI/CD
- Add Dockerfiles and k8s manifests for production

## License

Proprietary – Nextin Vision. All rights reserved.





