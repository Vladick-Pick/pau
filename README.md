# ПАУ

Веб-приложение для подготовки мероприятий ПАУ: синхронизация Bitrix-сущностей мероприятий и связанных сделок, настройка форматов, batch matching активных участников, генерация LLM-брифов и Word export.

## Стек

- Next.js App Router, React, TypeScript
- shadcn/ui base-nova, Tailwind CSS v4
- Prisma 6 + PostgreSQL
- Vitest для доменной логики

## Быстрый старт

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm prisma:generate
pnpm prisma:push
pnpm db:seed
pnpm dev
```

Откройте [http://localhost:3000](http://localhost:3000). В dev-режиме роли используют пароли по умолчанию: `admin`, `manager`, `viewer`; поле логина можно оставить пустым. Пользователи из раздела `Доступ` входят по своему логину и паролю.

Проект находится в папке с кириллическим именем, поэтому `docker-compose.yml` явно задает `name: pau`. Если Docker Desktop не запущен, `docker compose up -d` может зависнуть до старта daemon.

## Интеграции

`BITRIX_WEBHOOK_URL` должен указывать на входящий webhook Bitrix24 вида `https://example.bitrix24.ru/rest/<user>/<token>`. Предпочтительно задавать `BITRIX24_PORTAL_HOST`, `BITRIX24_WEBHOOK_USER_ID` и `BITRIX24_WEBHOOK_TOKEN`.

ПАУ синхронизирует smart-process/список Bitrix с названием `Посещения мероприятий`. Связь сделки привлечения с мероприятием читается через `UF_CRM_1645692484`. Поля личной встречи `UF_CRM_1669784114991` и `UF_CRM_1669784197394` намеренно исключены из модели и payload.

Форматы ПАУ связываются с типами/категориями мероприятий Bitrix в разделе `Форматы`. Там же хранятся matching rules и prompts для потенциальных участников, активных участников и модератора.

`PAU_ACTIVE_IDENTIFIERS` принимает список через запятую. Совпадение по Bitrix deal ID, contact ID или email помечает участника как активного.

`MATCHING_API_ENDPOINT` и `MATCHING_API_KEY` задают внешний сервис matching. Для мероприятия приложение отправляет event metadata, format metadata и список приглашенных профилей, а ожидает `activeParticipants` и общий `rationale`.

`OPENROUTER_API_KEY` и `OPENROUTER_MODEL` используются для structured-output брифов через `/api/v1/chat/completions`.

## API

- `POST /api/bitrix/sync-events`
- `GET /api/events?scope=upcoming|past`
- `GET /api/events/[eventId]`
- `POST /api/events/[eventId]/match`
- `POST /api/events/[eventId]/briefs`
- `GET /api/events/[eventId]/export`
- `GET /api/formats`
- `PATCH /api/formats`
- `GET /api/account/users`
- `POST /api/account/users`
- `PATCH /api/account/users`

## Проверка

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```
