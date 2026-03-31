# whatsapp-bot

Implementacion base del plan de WhatsApp Bot para desarrollo y pruebas con Bun.

## Requisitos

- Bun 1.3+
- (Opcional) Redis local si quieres estado persistente

## Setup

```bash
bun install
cp .env.example .env
```

Completa los valores reales en `.env`.

## Ejecutar

```bash
bun run dev
```

Endpoints:

- `GET /health`
- `GET /webhook` (verificacion de Meta)
- `POST /webhook` (eventos de WhatsApp)

## Validacion

```bash
bun run check
```
