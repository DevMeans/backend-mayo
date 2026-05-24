# Documentacion Operativa - Levantar Backend

Guia paso a paso para ejecutar este backend en local y desplegarlo en servidor.

---

## 1. Objetivo

Levantar un backend `Node.js + Express + Prisma + PostgreSQL` con:

1. Variables de entorno correctas
2. Migraciones aplicadas
3. Seed inicial (opcional)
4. Servidor respondiendo en API

---

## 2. Requisitos previos

- Node.js `20+`
- npm
- PostgreSQL activo (local o remoto)

Verificar versiones:

```bash
node -v
npm -v
```

---

## 3. Scripts disponibles

Archivo: `package.json`

| Script | Comando real | Uso |
|---|---|---|
| `npm run dev` | `tsx watch src/app.ts` | Levantar backend en desarrollo |
| `npm run build` | `rimraf ./dist && tsc` | Compilar TypeScript |
| `npm start` | `npm run build && node dist/app.js` | Ejecutar modo produccion |
| `npm run db:migrate:dev` | `prisma migrate dev` | Migraciones para desarrollo |
| `npm run db:migrate:deploy` | `prisma migrate deploy` | Aplicar migraciones pendientes (staging/prod) |
| `npm run db:generate` | `prisma generate` | Generar Prisma Client |
| `npm run seed` | `tsx src/data/seed.ts` | Cargar datos base |

---

## 4. Configuracion de entorno

### 4.1 Crear `.env`

Linux/macOS:

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

### 4.2 Variables obligatorias

```env
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tienda
JWT_SECRET=tu_secreto_fuerte
PUBLIC_PATH=public
CLOUDINARY_CLOUD_NAME=xxx
CLOUDINARY_API_KEY=xxx
CLOUDINARY_API_SECRET=xxx
```

Nota:
- Aunque no uses subida de imagenes al principio, Cloudinary sigue siendo obligatorio porque el proyecto valida esas variables al arrancar.

---

## 5. Primer arranque local (desde cero)

### 5.1 Instalar dependencias

```bash
npm install
```

### 5.2 Aplicar migraciones

```bash
npm run db:migrate:deploy
```

Si estas cambiando esquema durante desarrollo:

```bash
npm run db:migrate:dev
```

### 5.3 Cargar seed base (recomendado)

```bash
npm run seed
```

Usuarios de prueba creados por seed:

- `admin@example.com` / `password123`
- `user@example.com` / `password123`

### 5.4 Levantar servidor

```bash
npm run dev
```

Base URL esperada:

- `http://localhost:3000`

---

## 6. Verificacion funcional minima

### 6.1 Healthcheck

```bash
GET /health
```

Respuesta esperada:

```json
{
  "status": "ok"
}
```

### 6.2 Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@example.com\",\"password\":\"password123\"}"
```

PowerShell:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3000/api/auth/login" `
  -ContentType "application/json" `
  -Body '{"email":"admin@example.com","password":"password123"}'
```

---

## 7. Flujo diario de desarrollo

### 7.1 Levantar backend

```bash
npm run dev
```

### 7.2 Cuando cambias `schema.prisma`

```bash
npm run db:migrate:dev
npm run db:generate
```

### 7.3 Si necesitas repoblar datos base

```bash
npm run seed
```

---

## 8. Deploy en Railway (recomendado para este backend)

### 8.1 Crear servicios

1. Crear proyecto en Railway
2. Agregar servicio backend desde repo (carpeta `backend`)
3. Agregar PostgreSQL en el mismo proyecto

### 8.2 Configurar variables en Railway

- `DATABASE_URL` (idealmente como Reference Variable desde el servicio Postgres)
- `JWT_SECRET`
- `PUBLIC_PATH`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

`PORT` normalmente lo inyecta Railway automaticamente.

### 8.3 Configurar comandos de despliegue

- Pre-deploy Command:

```bash
npm run db:migrate:deploy
```

- Start Command:

```bash
npm start
```

### 8.4 Networking y healthcheck

1. Generar dominio publico en Railway
2. Configurar healthcheck path: `/health`

---

## 9. Netlify: como aplica en este proyecto

Este backend Express no funciona como servidor persistente en Netlify.

Opciones reales:

1. Refactorizar API a Netlify Functions/Background Functions
2. Mantener backend en Railway y frontend en Netlify

Para salir a produccion rapido, usa opcion 2.

---

## 10. Errores comunes

### 10.1 Error: `Can't reach database server ...`

Causa probable:
- `DATABASE_URL` incorrecta o DB apagada

Accion:
1. Validar host, puerto, usuario y password
2. Confirmar que la base exista y este activa
3. Reintentar migracion:

```bash
npm run db:migrate:deploy
```

### 10.2 Error: `La base de datos necesita migraciones pendientes`

Accion:

```bash
npm run db:migrate:deploy
```

### 10.3 Error por variables de entorno faltantes

Accion:
1. Revisar `.env`
2. Confirmar variables obligatorias de la seccion 4

### 10.4 Puerto ocupado

Accion:
1. Cambiar `PORT` en `.env`
2. O liberar el proceso que usa ese puerto

---

## 11. Checklist rapido de arranque

Antes de empezar:

- [ ] `npm install` ejecutado
- [ ] `.env` completo
- [ ] PostgreSQL accesible
- [ ] `npm run db:migrate:deploy` sin errores
- [ ] `npm run dev` levantado
- [ ] `GET /health` responde `200`

