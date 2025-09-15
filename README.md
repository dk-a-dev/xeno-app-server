# Xeno Shopify Analytics Platform

A full-stack multi-tenant SaaS platform that provides comprehensive analytics and insights for Shopify stores. Built with modern technologies and production-ready architecture.

## **Live Deployment**

- **Backend API:** https://xeno-app-server.onrender.com
- **Frontend Dashboard:** https://xeno-app-web.vercel.app/

## **Features**

### **Analytics Dashboard**
- Real-time business metrics (revenue, orders, customers)
- Customer lifetime value and growth analytics
- Product performance and sales ranking
- Time-series analysis with interactive charts
- Custom event tracking and conversion funnels

### **Shopify Integration**
- OAuth 2.0 secure authentication
- Real-time webhook data synchronization
- Historical data import via REST API
- Rate-limiting compliance and error handling
- Multi-store support per tenant

### **Multi-Tenancy**
- Complete data isolation between tenants
- JWT-based authentication and authorization
- Scalable tenant management
- Role-based access control ready

### **Custom Event Tracking**
- Flexible event schema with JSONB metadata
- Real-time event ingestion
- Custom analytics and reporting
- Conversion funnel analysis

## **Architecture Overview**

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND LAYER                           │
│  ┌─────────────────┐    ┌─────────────────────────────────┐ │
│  │   Next.js App   │    │        Admin Panel              │ │
│  │   (Vercel)      │    │       (Future)                  │ │
│  └─────────────────┘    └─────────────────────────────────┘ │
└─────────────┬───────────────────────────────────────────────┘
              │ HTTPS/REST API
┌─────────────▼───────────────────────────────────────────────┐
│                     API LAYER                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │               Express.js Server (Render)                │ │
│  │                                                         │ │
│  │  Authentication │ Analytics │ Sync │ Webhooks │ Events  │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────┬───────────────────────────────────────────────┘
              │ Prisma ORM
┌─────────────▼───────────────────────────────────────────────┐
│                    DATABASE LAYER                           │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │            PostgreSQL (Render)                          │ │
│  │                                                         │ │
│  │  Tenants │ Customers │ Orders │ Products │ Events       │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## **Technology Stack**

### **Backend**
- **Runtime:** Node.js with TypeScript
- **Framework:** Express.js with middleware
- **ORM:** Prisma for type-safe database operations
- **Database:** PostgreSQL for ACID compliance
- **Authentication:** JWT with bcrypt password hashing
- **Deployment:** Render with automatic deployments

### **Frontend**
- **Framework:** Next.js 14 with React 18
- **Styling:** CSS for responsive design
- **Charts:** Recharts for data visualization
- **State Management:** React hooks with SWR
- **Deployment:** Vercel with edge optimization

### **Infrastructure**
- **Database:** Render PostgreSQL
- **API Hosting:** Render
- **Frontend:** Vercel

## **Quick Start**

### **Prerequisites**
- Node.js and pnpm
- PostgreSQL
- Docker & Docker Compose (optional)

### **Local Development Setup**

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/xeno-dev-app.git
   cd xeno-dev-app
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Setup environment variables**
   ```bash
   # Backend (.env in /server)
   cp server/.env.example server/.env
   
   # Edit server/.env with your values:
   DATABASE_URL=postgresql://xeno_app:xeno_pass@localhost:5432/xeno
   JWT_SECRET=your-super-secret-jwt-key
   SHOPIFY_API_KEY=your-shopify-api-key
   SHOPIFY_API_SECRET=your-shopify-api-secret
   ```

4. **Start the database (Docker)**
   ```bash
   cd server
   docker compose up -d db
   ```

5. **Run database migrations**
   ```bash
   cd server
   pnpm prisma:generate
   pnpm prisma:migrate
   ```

6. **Start the development servers**
   ```bash
   # Terminal 1: Backend API
   cd server
   pnpm dev
   
   # Terminal 2: Frontend
   cd web
   pnpm dev
   ```

7. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8080

### **Docker Development (Alternative)**

```bash
# Start everything with Docker Compose
docker compose up -d

# Access services:
# Frontend: http://localhost:3000
# Backend: http://localhost:8080
# Database: localhost:5432
```

## **API Documentation**

### **Authentication**
```bash
# Register new tenant
curl -X POST http://localhost:8080/api/v1/tenants \
  -H "Content-Type: application/json" \
  -d '{"name":"My Store","email":"user@example.com","password":"password123"}'

# Login
curl -X POST http://localhost:8080/api/v1/tenants/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

### **Core Endpoints**
```bash
# Get business metrics
GET /api/v1/metrics/summary
GET /api/v1/metrics/orders-by-date
GET /api/v1/metrics/top-customers
GET /api/v1/metrics/product-performance

# Manage data
GET /api/v1/customers
GET /api/v1/orders
GET /api/v1/products

# Custom events
GET /api/v1/events
POST /api/v1/events

# Data synchronization
POST /api/v1/sync/trigger
POST /api/v1/webhooks/shopify
```

## 🗄️ **Database Schema**

### **Core Tables**
```sql
-- Multi-tenant isolation
tenants (id, name, email, password_hash, created_at)

-- Shopify integration
shopify_shops (id, tenant_id, shop_domain, access_token, install_state)

-- Customer data
customers (id, tenant_id, shopify_id, email, first_name, last_name)

-- Product catalog
products (id, tenant_id, shopify_id, title, created_at)

-- Order transactions
orders (id, tenant_id, customer_id, shopify_id, order_date, total_price)

-- Order details
order_line_items (id, tenant_id, order_id, product_id, quantity, unit_price)

-- Custom analytics
custom_events (id, tenant_id, customer_id, type, metadata, occurred_at)
```

### **Key Design Decisions**
- **Multi-tenancy:** All tables include `tenant_id` for data isolation
- **JSONB Metadata:** Flexible event tracking without schema changes
- **Decimal Precision:** Financial calculations use DECIMAL type
- **Indexed Queries:** Optimized for analytics workloads

## **Data Synchronization**

### **Shopify Integration Flow**
1. **OAuth Setup:** Tenant authorizes app access
2. **Webhook Registration:** Real-time event notifications
3. **Initial Sync:** Historical data import via REST API
4. **Incremental Updates:** Webhook-driven updates
5. **Conflict Resolution:** Handle concurrent modifications

### **Sync Strategies**
- **Real-time:** Webhooks for immediate updates
- **Scheduled:** Cron jobs for data consistency checks
- **Manual:** On-demand sync triggers
- **Recovery:** Automatic retry with exponential backoff


## Roadmap & Status

### Implemented
- [x] Backend scaffold
- [x] Prisma schema & migrations
- [x] Auth & tenant onboarding
- [x] Shopify OAuth scaffold
- [x] Webhook ingestion (HMAC verify + dedupe)
- [x] Scheduler integration
- [x] Metrics enrichment (AOV, 7-day revenue, LTV proxy, top products/customers, growth, hourly distribution)
- [x] Metrics charts & visualizations (time-series, bar, pie, growth, hourly)
- [x] Dev utilities (seed, create-shop)
- [x] Custom events model + endpoints + aggregation
- [x] Events explorer UI + dev create event form
- [x] Shops page filters + dev create shop UI

### Future Scope
- [ ] analytics (checkout_started → checkout_completed vs cart_abandoned)
- [ ] Event type time-series & trend charts
- [ ] Advanced analytics (RFM, cohorts, retention curves)
- [ ] incremental sync via updated_at cursors
- [ ] Webhook replay window & stale/replay rejection
- [ ] Security hardening (cookie auth, rate limiting, audit logging)
- [ ] Async ingestion scaling (batching, concurrency tuning, worker pool)
- [ ] Predictive anomaly detection


### Key API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/tenants | Create tenant |
| POST | /api/tenants/login | Login, receive JWT |
| POST | /api/sync/trigger | Manual ingestion (stub) |
| GET | /api/metrics/summary | Totals summary |
| GET | /api/metrics/orders-by-date | Orders grouped by date |
| GET | /api/metrics/top-customers | Top 5 customers by spend |
| GET | /api/shops | List Shopify shops for tenant |

### Multi-Tenancy Model
All domain tables contain `tenantId`. Authorization middleware injects `req.auth.tenantId`; queries must always filter by it to ensure isolation.

### Scheduler
Configured via `SYNC_INTERVAL_CRON` (default `*/15 * * * *`). Iterates active shops and runs `fullSync`.

### Shopify Integration (Current State)
1. OAuth install & callback storing access token (fake or real mode)
2. Webhooks for customers/products/orders updating DB incrementally
3. Full sync scaffold with pagination & soft rate limit handling
4. Future: delta sync and extended pagination for historical backfill


### Custom Events (Bonus Feature)

Captured lightweight lifecycle events (e.g. `cart_abandoned`, `checkout_started`, `checkout_completed`) for richer funnel analysis.

### Data Model
`CustomEvent` includes:
- `tenantId`
- `type` (string)
- `customerId` (optional)
- `metadata` (JSON – arbitrary payload like cart items, cart value, checkout step)
- `occurredAt` timestamp (defaults now)

### Create Event
```bash
API_BASE=http://localhost:8080/api
curl -X POST "$API_BASE/events" \
	-H "Authorization: Bearer $TOKEN" \
	-H 'Content-Type: application/json' \
	-d '{
		"type": "checkout_started",
		"customerId": "<customer-id>",
		"metadata": { "cartValue": 129.50, "items": 3 }
	}'
```

### List Events
```bash
curl -H "Authorization: Bearer $TOKEN" \
	"$API_BASE/events?type=checkout_started&from=2025-09-01&to=2025-09-14"
```

### Aggregate Counts
```bash
curl -H "Authorization: Bearer $TOKEN" \
	"$API_BASE/metrics/custom-event-counts?start=2025-09-01&end=2025-09-14"
```
Sample:
```json
[
	{ "type": "checkout_started", "count": 42 },
	{ "type": "cart_abandoned", "count": 17 },
	{ "type": "checkout_completed", "count": 29 }
]
```

---

## **Testing & Data Seeding**

### **Test Data Generation**
```bash
# Backend generates realistic test data
curl -X POST https://xeno-app-server.onrender.com/api/v1/sync/trigger \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Generates:
# - 8 diverse customers
# - 8 varied products ($24.99 - $299.99)
# - 10-16 orders distributed over 30 days
# - Custom events for analytics
```

### **Demo Credentials**
```
Email: test@example.com
Password: testpass123
```





## Development Utilities
Two helper endpoints exist for local iteration (protected by auth):

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/dev/seed` | Idempotent seed of sample customers/orders/products for the authenticated tenant |
| POST | `/api/dev/create-shop` | Creates & activates a `ShopifyShop` row (used before real OAuth or for webhook tests) |

Example create shop:
```bash
curl -X POST http://localhost:8080/api/dev/create-shop \\
	-H "Authorization: Bearer $TOKEN" \\
	-H 'Content-Type: application/json' \\
	-d '{"shopDomain":"example-store.myshopify.com"}'
```

## Ingestion & Sync Modes
1. Manual trigger: `POST /api/sync/trigger` (currently invokes `fullSync` using stub or real mode)
2. Scheduled: Cron expression from `SYNC_INTERVAL_CRON` iterates active shops
3. Webhooks: Near real-time delta updates for customers, products, and orders
4. (Optional) Async queue: when `QUEUE_DRIVER=redis`, webhooks enqueue jobs processed by a separate worker

### Full Sync
`shopifyService.fullSync` handles paginated REST fetch (stubbed in fake mode) with:
- Link header parsing for pagination (future: extended beyond basic pages)
- Soft rate limit backoff (pauses when usage approaches limit)
- Upserting core entities (Customer, Product, Order + OrderLineItem)

### Incremental Sync via Webhooks
Webhooks insert or update a single entity + related line items, giving low latency updates that feed metrics without waiting for the next scheduled job.

## Webhook Processing
Endpoint: `POST /api/webhooks/shopify`

Express is configured with a raw body parser specifically for this path so HMAC verification uses the exact byte sequence Shopify sent.

Supported topics currently handled:
- `customers/create`, `customers/update`
- `products/create`, `products/update`
- `orders/create`, `orders/updated`, `orders/paid`

Pipeline steps:
1. Normalize header keys (case-insensitive)
2. Verify `X-Shopify-Hmac-Sha256` using app secret (skipped entirely only if in fake mode; real handler enforces 401 on mismatch)
3. Lookup shop by `X-Shopify-Shop-Domain` (202 Accepted if unknown)
4. Dedupe using `X-Shopify-Event-Id` persisted in `WebhookEvent` table
5. Persist hash of raw body (privacy) + metadata (topic, triggeredAt, shopDomain)
6. Parse JSON and route to topic handler (upsert + relational linking)
7. Idempotent line item rewrite for order updates
8. (If queue enabled) enqueue & async process

### HMAC Verification & Dev Bypass
For real Shopify webhooks the `X-Shopify-Hmac-Sha256` header is required and verified against the *raw* request body. In local development you can skip verification by setting:
```
WEBHOOK_SKIP_HMAC=true
```
This is automatically true if `DEV_FAKE_SHOPIFY=true`. Never enable this in any shared / deployed environment.

To manually compute a matching HMAC for a test payload:
```bash
BODY='{"id":123,"total_price":"10.00","line_items":[]}'
HMAC=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SHOPIFY_API_SECRET" -binary | base64)
curl -X POST http://localhost:8080/api/webhooks/shopify \
	-H "X-Shopify-Topic: orders/create" \
	-H "X-Shopify-Shop-Domain: example-store.myshopify.com" \
	-H "X-Shopify-Hmac-Sha256: $HMAC" \
	-H "X-Shopify-Event-Id: evt-test-1" \
	--data "$BODY" -i
```
If you see `401 Invalid HMAC` double‑check: (1) raw body not prettified, (2) secret matches `SHOPIFY_API_SECRET`, (3) base64 flag used.

### Async Queue (Optional)
If `QUEUE_DRIVER=redis` the route returns `202 Enqueued` after minimal validation and pushes the job onto a BullMQ queue (`ingestion`). A separate worker (`pnpm --filter server run worker` or `pnpm worker` inside `server`) processes jobs and invokes the same processing logic. In `memory` mode processing happens inline (good for local fast iteration without Redis).

Start Redis via compose:
```bash
docker compose up -d redis
```
Run worker (new terminal):
```bash
cd server
pnpm worker
```

Environment toggle summary:
| Mode | QUEUE_DRIVER | Behavior |
|------|--------------|----------|
| Inline | memory | Webhook handled synchronously (200) |
| Async  | redis  | Webhook enqueued (202) and processed by worker |

`WebhookEvent` schema excerpt:
```
model WebhookEvent {
	id          String   @id @default(cuid())
	topic       String
	shopDomain  String
	eventId     String   @unique
	triggeredAt DateTime?
	rawBodyHash String?
	createdAt   DateTime @default(now())
	@@index([shopDomain, topic])
}
```

### Simulating a Webhook (Dev)
1. Ensure a shop row exists (`/api/dev/create-shop`).
2. Craft JSON payload (e.g. order with line items).
3. Compute HMAC:
```bash
BODY='{"id":12345,"total_price":"25.00","line_items":[{"product_id":777,"quantity":1,"price":"25.00","title":"Test"}]}'
HMAC=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SHOPIFY_API_SECRET" -binary | base64)
curl -X POST http://localhost:8080/api/webhooks/shopify \\
	-H "X-Shopify-Topic: orders/create" \\
	-H "X-Shopify-Shop-Domain: example-store.myshopify.com" \\
	-H "X-Shopify-Hmac-Sha256: $HMAC" \\
	-H "X-Shopify-Event-Id: evt-123" \\
	--data "$BODY"
```

If HMAC matches you'll receive `200 OK` and subsequent metrics will reflect the order.

## Metrics Summary
Endpoint: `GET /api/metrics/summary`

Fields:
- `totalCustomers`
- `totalOrders`
- `totalRevenue`
- `averageOrderValue` (AOV = revenue / orders)
- `customerLtv` (proxy = revenue / customers)
- `recent7DayRevenue` (rolling 7-day sum)

Planned additions: order trend timeseries, top products, cohort retention.
## Shopify OAuth
Minimal OAuth flow implemented (install + callback) storing access token in `ShopifyShop`.

### Env Requirements
Set in `.env` (already in example):
```
SHOPIFY_API_KEY=your_key
SHOPIFY_API_SECRET=your_secret
SHOPIFY_SCOPES=read_orders,read_products,read_customers
SHOPIFY_APP_URL=http://localhost:8080
SHOPIFY_API_VERSION=2024-04
DEV_FAKE_SHOPIFY=true   # set false to hit real Shopify
```

### Flow
1. Tenant authenticates (signup/login) to obtain JWT
2. `POST /api/shopify/install` returns `installUrl`
3. Merchant approves (real mode) → Shopify redirects to callback
4. Access token stored, shop `installState` becomes `active`

### Dev Fake Mode
`DEV_FAKE_SHOPIFY=true` lets you bypass real OAuth and populate a shop row rapidly (or use `/api/dev/create-shop`). Set to `false` only when your app credentials & redirect URL are configured in the Shopify Partner dashboard.

---

## Challenges faces
---
Updated to reflect current implemented feature set (September 2025).
```bash
lsof -i :8080
kill -9 <PID>
```
Or set a different `PORT` in `.env`.

### Prisma P1000 (Auth Failed)
Ensure `server/.env` credentials match `docker-compose.yml`:
```
POSTGRES_USER=xeno_app
POSTGRES_PASSWORD=xeno_pass
POSTGRES_DB=xeno
```
If you changed them after the first run, remove the old volume:
```bash
docker compose down
docker volume rm xeno-dev-app_db_data
docker compose up -d db
```
Then rerun migrations.

### Check Database Health
```bash
docker compose logs -f db
PGPASSWORD=xeno_pass psql -h localhost -U xeno_app -d xeno -c '\dt'
```

### Scheduler Won't Start
It starts after server bind when `SCHEDULER_ENABLED` is not `false`. If using a fallback port, confirm logs mention `startScheduler()` invocation; otherwise check for early process exit.
