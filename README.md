# Brava e' Bella Nail's Studio

App web instalable (PWA) para el estudio: citas sin choques, tratamientos con precio,
recordatorios por WhatsApp o SMS, calendario del teléfono, portafolio y finanzas.

## Correr en tu computadora

```bash
npm install
npm run dev      # abre http://localhost:5173
npm run build    # deja la app lista en dist/
```

## Publicación (GitHub Pages)

Cada `push` a `main` compila la app y la publica sola (`.github/workflows/deploy.yml`).
Una sola vez, en el repo: **Settings → Pages → Source: GitHub Actions**.

Queda en `https://bravaebella.github.io/gestioncitas/`.

En el iPhone: abrir esa dirección en Safari → Compartir → **Agregar a inicio**.
Se abre a pantalla completa y funciona sin internet.

## Dónde viven los datos hoy

Por ahora todo se guarda en el teléfono:

- Citas, clientas, tratamientos, gastos y ajustes: `localStorage` (`src/lib/store.tsx`).
- Fotos y videos del portafolio: IndexedDB (`src/lib/media.ts`).

Hay respaldo manual en Ajustes (descargar y restaurar un `.json`, sin fotos ni videos).

## Conectar Supabase después

El modelo de datos (`src/lib/types.ts`) es el mismo del esquema `brava`
(`brava_schema.sql`). Para conectar:

1. Aplicar `brava_schema.sql` en el proyecto y agregar `brava` a los esquemas expuestos de la API.
2. Cambiar las acciones de `src/lib/store.tsx` por llamadas a `supabase.schema('brava')`.
   Las pantallas no cambian.
3. Cambiar `src/lib/media.ts` por el bucket `brava-portafolio`.
4. Agregar inicio de sesión (Supabase Auth) para la dueña.

## Lo que la app no hace sola (todavía)

- **Recordatorios automáticos:** hoy la app avisa en "Hoy" cuando toca mandar cada
  recordatorio y abre WhatsApp o SMS con el mensaje listo; la dueña lo envía con un toque.
  El envío 100 % automático necesita un servicio de mensajería con servidor (por ejemplo,
  la API de WhatsApp Business), que tiene costo.
- **Calendario:** con Google se abre Google Calendar con la cita lista para guardar; con
  iPhone se descarga un `.ics` con alarmas de 1 h y 30 min. Una PWA no puede escribir
  directo en el calendario sin que la persona confirme.

## Estructura

```
src/
  App.tsx              rutas (#hoy, #agenda, #portafolio, #finanzas, #ajustes) y barra inferior
  index.css            colores, tipografía y componentes (look A)
  lib/
    types.ts           modelo de datos
    store.tsx          datos y acciones (aquí se conecta Supabase)
    agenda.ts          choques, huecos y horas libres
    enlaces.ts         WhatsApp/SMS, Google Calendar y .ics
    media.ts           fotos y videos
    ejemplo.ts         datos de prueba opcionales
  screens/             Hoy, Agenda, CitaForm, CitaDetalle, Portafolio, Finanzas, Ajustes
```
