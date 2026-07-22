# Swine Admin PWA

Админ-панель с PostgreSQL, REST API и PWA. При первом старте создаётся пользователь `Oleksii` с ролью `admin`. Пароль берётся из `ADMIN_PASSWORD` (по умолчанию для локального запуска: `1111`) и сохраняется только как bcrypt-хеш.

## Запуск

```powershell
$env:POSTGRES_PASSWORD="strong-database-password"
$env:JWT_SECRET="long-random-production-secret"
$env:ADMIN_PASSWORD="1111"
docker compose up --build
```

Откройте http://localhost:3000 и войдите как `Oleksii` / `1111`.

Перед публикацией обязательно замените пароль пользователя, `POSTGRES_PASSWORD` и `JWT_SECRET`, а также настройте HTTPS через reverse proxy.

## API

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/users` и `GET /api/users/:id` — авторизованные пользователи
- `POST /api/users`, `PUT /api/users/:id`, `DELETE /api/users/:id` — только `admin`

### Departments

- `GET /departments/` and `GET /departments/:id` — authenticated users
- `POST /departments/`, `PATCH /departments/:id`, `DELETE /departments/:id` — admin only
- The same routes are also available under `/api/departments`

### Rooms

- `GET /rooms/` and `GET /rooms/:id` — authenticated users
- `POST /rooms/`, `PATCH /rooms/:id`, `DELETE /rooms/:id` — admin only
- Each room requires a valid `department_id`; responses include `department_name`

### Pens

- `GET /pens/` and `GET /pens/:id` — authenticated users
- `POST /pens/`, `PATCH /pens/:id`, `DELETE /pens/:id` — admin only
- Each pen requires a valid `room_id`; responses include `room_name` and `department_name`

### Planned sow injections

- `GET /planed-sow-injections/` and `GET /planed-sow-injections/:id` — authenticated users
- `POST`, `PATCH`, and `DELETE` — admin only
- Valid `pen_id` and `medicine_sow_id` values are required.

### Medicine Sow

- Full CRUD under `/medicine-sow/` and `/api/medicine-sow/`
- List filters: `search`, `diagnosis`, `max_withdrawal_days`, `max_course_days`

### Medicine Sow Storage

- Full CRUD under `/medicine-sow-storage/` and `/api/medicine-sow-storage/`
- Filter by `medicine_sow_id`; every stock record is linked to a sow medicine

### Vet Questions

- Full CRUD under `/vet-questions/` and `/api/vet-questions/`
- Upload JPEG, PNG, or WebP (up to 5 MB) with multipart field `file` at `/vet-questions/upload`

### File Storage

- List, upload, download, and delete under `/file-storage/` and `/api/file-storage/`
- Maximum file size: 25 MB; files are persisted in a dedicated Docker volume

### Daily Remarks

- Full CRUD under `/daily-remarks/` and `/api/daily-remarks/`
- Optional JPEG, PNG, or WebP upload under `/daily-remarks/upload`

### Repair Locations

- Full CRUD under `/repair-locations/` and `/api/repair-locations/`
- Optional JPEG, PNG, or WebP upload under `/repair-locations/upload`

### Todo List

- Full CRUD under `/todos/` and `/api/todos/`
- Fields: task, due date, completion status, and completion timestamp
- Filter with `?completed=true` or `?completed=false`

## Production deployment (GitHub → Hetzner)

The workflow `.github/workflows/deploy.yml` deploys every push to `main` to `/opt/swine-pwa` and starts `compose.production.yaml`. The server must have Docker Engine, the Docker Compose plugin, `rsync`, and an SSH user allowed to run Docker.

Create these GitHub Environment secrets under `production`:

- `HETZNER_HOST` — server IPv4/hostname
- `HETZNER_USER` — SSH user
- `HETZNER_SSH_KEY` — private Ed25519 key
- `POSTGRES_PASSWORD` — strong database password
- `JWT_SECRET` — random secret of at least 32 characters
- `ADMIN_PASSWORD` — initial Oleksii password for a fresh database

The app binds only to `127.0.0.1:3000`; the server's Nginx terminates HTTPS and proxies the public domain to that port. Open TCP ports 22, 80, and 443.
