# HR Assistant

A bilingual (English and Hindi) HR Assistant web application with a Next.js frontend and a FastAPI backend. The project covers internal HR workflows and public career resources; see the engineering guides for scope, requirements, and implementation details.

## Technology

- Frontend: Next.js 13, React 18, and TypeScript
- Backend: Python 3.12+, FastAPI, SQLAlchemy, and Alembic
- Database: PostgreSQL

## Prerequisites

- Node.js and npm
- Python 3.12 or newer
- [`uv`](https://docs.astral.sh/uv/)
- PostgreSQL

## Local setup

### 1. Configure the backend

Create `backend/.env` and set the database connection and a unique development JWT secret:

```dotenv
APP_ENV=development
DEBUG=true
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@localhost:5432/hr_assist
JWT_SECRET_KEY=replace-with-a-unique-secret-at-least-32-characters-long
CORS_ORIGINS=http://localhost:3000,http://localhost:8000
```

Create the `hr_assist` PostgreSQL database (or update `DATABASE_URL` to use an existing database), then install the locked backend dependencies and apply migrations:

```bash
cd backend
uv sync --frozen
uv run --frozen alembic upgrade head
```

### 2. Configure and install the frontend

Create `frontend/.env.local`:

```dotenv
BACKEND_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_APP_NAME=HR Assist
```

Install the frontend dependencies:

```bash
cd frontend
npm ci
```

## Run locally

Start each service in a separate terminal from the repository root.

Backend:

```bash
cd backend
uv run --frozen uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd frontend
npm run dev -- --hostname 127.0.0.1 --port 3000
```

- Frontend: <http://localhost:3000>
- API health: <http://localhost:8000/healthz>
- API readiness (checks the database): <http://localhost:8000/readyz>
- API documentation: <http://localhost:8000/docs>

## Tests and checks

Run backend tests:

```bash
cd backend
uv run --frozen pytest
```

Run frontend type checking:

```bash
cd frontend
npm run typecheck
```

## Project documentation

- [Frontend engineering guide](./Frontend.md)
- [Backend engineering guide](./backend.md)
- [Detailed SRS](./HR_Assistant_Detailed_SRS_v1.docx)
- [Backlog and test cases](./HR_Assistant_Backlog_and_Test_Cases_v1.xlsx)

## Security

Do not commit `.env` files, credentials, or production secrets. Use unique secrets and deployment-specific configuration outside source control.
