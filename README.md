# ABSWAR PostgreSQL Persistent Backend

Bu sürüm Railway PostgreSQL'e kalıcı kayıt yapar.

## Gerekli Railway Variable

- DATABASE_URL

Railway PostgreSQL bağlıysa otomatik gelir.

## Endpointler

- GET /health
- GET /api/game/state
- POST /api/player/connect
- POST /api/player/choose-country
- POST /api/game/attack
- POST /api/admin/reset
