# Packaged Food Scanner Backend

Production-grade backend and scientific nutrition evaluation engine for Indian packaged foods and beverages. Built with **Node.js**, **Fastify**, **TypeScript**, and **Drizzle ORM** (PostgreSQL).

---

## Key Capabilities

- **Deterministic Nutrition Engine**: Evaluates declared packaging values against ICMR-NIN 2024 Dietary Guidelines for Indians (Table 15.1 HFSS cutoffs), 2,000 mg adult daily sodium limits, and clinical dietary lenses (Diabetic, Cardiac, Renal, Infant).
- **Tiered Atwater Caloric Plausibility**: Caloric consistency evaluated using $4\text{P} + 4\text{C} + 9\text{F}$ without double-counting fibre ($\le 8\%$ Pass, $8\%-20\%$ Warning, $> 20\%$ Fail/Corrupt).
- **Fail-Closed Evidence Gating**: No health grade or green badge is ever issued on incomplete, unverified, or mathematically corrupt data.
- **Packaging OCR Ingestion**: Mathematical plausibility gating against OCR errors (e.g. misread commas or shifted decimals) and anti-poisoning moderation queues for crowdsourced submissions.
- **Resilient Open Food Facts (OFF) Client**: Token-bucket rate limiting (12 req/min), negative caching for missing barcodes (2h), 503 fault isolation, and automatic cleansing of corrupt community estimates.
- **FSSAI 14-Digit License Verification**: Format validation (`/^[12]\d{13}$/`), license vs registration classification, and direct FoSCoS grievance portal links.
- **Marketing Claims Audit**: Audits front-of-pack claims (*"No Added Sugar"*, *"High Protein"*, *"High Fibre"*, *"Low Fat"*, *"Trans Fat Free"*) against FSSAI 2018 Advertising & Claims regulations.
- **Lexicographic Healthier Swaps**: Same-aisle, basis-matched, price-parity swap recommendations with transparent trade-off disclosures for products that still breach HFSS limits.
- **Identity & Security**: OWASP anti-enumeration password reset with cryptographic SHA-256 tokens, bcrypt hashing, username availability checking, session revocation, and device-isolated rate limiting.

---

## Project Structure

```
├── .gitignore                        # Git exclusion rules (Testing/, node_modules/, dist/, .env)
├── README.md                         # Project documentation
└── server/                           # Backend Fastify application
    ├── src/
    │   ├── app.ts                    # Application factory & route registration
    │   ├── server.ts                 # HTTP server entry point with graceful shutdown
    │   ├── config/                   # Zod-validated environment config
    │   ├── common/                   # RFC 7807 AppErrors, GS1 barcode & FSSAI utils
    │   ├── db/                       # Drizzle ORM client & schemas (users, products, ingestion)
    │   ├── plugins/                  # Fastify plugins (JWT, CORS, error-handler, rate-limit)
    │   └── modules/
    │       ├── auth/                 # Identity, sessions, reset tokens & username management
    │       ├── engine/               # Scientific scoring, Atwater verifier, ingredient parser
    │       ├── products/             # Product catalog, seed fixtures & Open Food Facts client
    │       ├── swaps/                # Lexicographic same-aisle healthier swap engine
    │       └── ocr/                  # Packaging OCR parser, plausibility auditor & ingestion
    └── tests/                        # 114 automated test suites (100% pass)
```

---

## Getting Started

### Prerequisites
- **Node.js** >= 20.x
- **npm** >= 10.x

### Installation

```bash
cd server
npm install
```

### Environment Configuration

Copy the example environment file and adjust configuration as needed:

```bash
cp server/.env.example server/.env
```

### Run Tests

Execute the comprehensive test suite across all 36 test modules:

```bash
npm --prefix server test
```

### Build & Run

```bash
# Compile TypeScript to dist/
npm --prefix server run build

# Start development server
npm --prefix server run dev
```
