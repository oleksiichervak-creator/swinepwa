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

### User department access

- Administrators manage **Department access** in Users: `lobe_dragte`, `farestald`, or both. Administrators always have access to both; Farm and Daily work remain shared.
- `POST /api/users` and `PUT /api/users/:id` accept `department_access` as a nonempty array. Omitting it during an update preserves existing grants.
- Existing users receive both grants during the migration. New users created through the dashboard default to Lobe/Dragte; adjust the checkboxes as needed.
- Department APIs (including legacy aliases and print/export routes) check grants against the current database record on every request. Role changes, revoked access and deleted accounts affect existing sessions immediately.
- Mobile sign-in and user lists use `department=lobe_dragte` or `department=farestald`. The website hides unavailable department groups and does not load their data.

### Farestald

- Separate dashboard groups: Medicine (Medicine Sow, Medicine Sow Storage) and Sow injections (Planned, Done).
- CRUD routes under `/api/farestald/`: `medicine-sow`, `medicine-sow-storage`, `planned-sow-injections`, `done-sow-injections`.
- Four independent PostgreSQL tables: `farestald_medicine_sow`, `farestald_medicine_sow_storage`, `farestald_planed_sow_injections`, `farestald_done_sow_injections`. Created automatically at server startup; no Lobe/Dragte records are copied.
- Stock and injections reference only the Farestald medicine table. Users and farm location directories are shared; injection forms and API accept only pens belonging to the Farestald department (`GET /api/farestald/pens`). Create its rooms and pens under Farm if needed.
- Signed-in users can view; administrators can create, edit and delete. The existing Injections phone app remains attached to Lobe/Dragte.

### Farestald farrowing medication registration

- In **Farestald → Sow injections → Done sow injections**, administrators can use **reg farowings med** to paste 1–40 sow numbers from Excel and select one common Farestald pen and a date.
- Select one Farestald medicine for `Milk deficiency (OX)` and one for `Pain (M)` (spacing and case are normalized). Doses use the existing medicine ratio at 250 kg, once per medicine per sow; no course or planned records are created.
- The form previews the count and doses. Duplicate numbers, invalid doses, missing medicines and non-Farestald pens are rejected. The signed-in administrator is recorded as the performer.
- `/api/farestald/farrowings/options` and `/api/farestald/farrowings/register` are administrator-only. All entries are committed together; `farestald_farrowing_batches` stores request IDs to prevent duplicates on retries of the same batch.

### Farestald Injections phone app

- Install from **Farestald → Medicine → Medicine Sow → Install Farestald Injections**, or open `/farestald-injections/?install=1`.
- Separate PWA identity, scope, icon, cache and login token from the Lobe/Dragte application. Uses the same user accounts.
- Exactly two home actions: **Add injection** and **Injections for today**.
- These screens match Dragte: user picker and PIN keypad, five-step planning, treatment history, recent-treatment warnings, weight buttons, optional Melovem with selected dates, today's medicine totals, pen sorting, Skip and completion.
- Signed-in farm workers can plan a course using Farestald medicines and pens. Dose is calculated from weight; one injection per course day is scheduled, matching the existing Dragte planning behavior.
- `POST /api/farestald/mobile/plans`, `GET /api/farestald/mobile/today?date=YYYY-MM-DD`, `POST /api/farestald/mobile/plans/:id/complete`.
- Completion atomically moves a planned treatment into `farestald_done_sow_injections` and records the signed-in user. Repeated or concurrent completion cannot create duplicate completed records.
- Network access is required for reading and saving treatment data; only the application shell is cached offline.

### Sickplace

- Tab: `#sickplace`; CRUD routes: `/api/sickplace/` and `/sickplace/` (GET, POST, GET/PATCH/DELETE `/:id`).
- Fields: box number, registration date, pig number, group number, status (`observation` by default or `recovered`).
- Box, pig and group numbers are text identifiers, preserving leading zeros; box numbers are entered manually.
- Authenticated users can view records; administrators can add, edit and delete them.
- The phone app at `/injections/` includes Sickplace with pig search, registration and status updates for signed-in users. Mobile writes use `POST /api/injection-pwa/sickplace` and `PATCH /api/injection-pwa/sickplace/:id/status`; the latter accepts only `status`.
- Existing `/seekplace` API routes and the `#seekplace` bookmark remain compatible.
- The `seekplace` PostgreSQL table is created automatically when the updated server starts.
- **Print card** asks for a pig number and uses its latest registration. The printable A4 card includes pig/group numbers, planned and given sow medicine with the corresponding diagnosis from three calendar months before printing through today, and 10 blank daily inspection rows starting on the registration date.
- `GET /api/sickplace/print-card?pig_number=...` returns the card HTML for authenticated users, or 404 when the pig is not registered.

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
