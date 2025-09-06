# Manual Técnico — DSS · Evaluación Comparativa de Políticas Digitales (WDI)

Este documento describe arquitectura, dependencias, endpoints, modelo de datos y flujo de normalización/score del sistema.

---

## 1) Arquitectura
- **Backend:** Node.js (Express). Sirve el frontend estático y expone endpoints REST.
- **Frontend:** HTML + TailwindCSS (CDN) + Chart.js. Tooltips nativos (`title`).
- **Origen de datos:** API World Bank WDI v2.
- **Submódulos del DSS:**
  - *Data Subsystem:* adquisición de indicadores (WDI) + parsing de CSV/JSON.
  - *Model Subsystem:* normalización, cálculo de scores, datasets para gráficas, hallazgos.
  - *UI Subsystem:* interfaz y render de gráficas/tabla/CSV/impresión.

### Estructura de carpetas
```
dss-data360/
  backend/
    package.json
    .env
    src/
      server.js        # servidor Express + rutas
      data.js          # fetch WDI + parse CSV/JSON + mapping ISO
      model.js         # normalización, score, datasets, insights
      iso3.js          # nombres comunes ES/EN -> ISO-3
  frontend/
    index.html         # UI + tooltips nativos
    js/
      app.js           # render gráficas y acciones del usuario
```

---

## 2) Indicadores WDI y reglas
- **Uso:** `IT.NET.USER.ZS` (% personas que usan Internet)
- **Infraestructura fija:** `IT.NET.BBND.P2` (suscripciones banda ancha fija por 100)
- **Capacidad:** `IT.NET.BNDW.PC` (bps/usuario). El sistema convierte a **Mbps** (`/ 1e6`).  
  - Si falta `IT.NET.BNDW.PC`, se usa `IT.NET.BBND.P2` como **proxy** (quedando en unidades “suscripciones/100”; se trata como si fuera *capacidad relativa*). El frontend muestra un mensaje aclaratorio.

**Selección de año:** si `year` no se envía o no existe el dato para ese año, se usa el **último disponible** por país.

---

## 3) Endpoints (REST)
### `GET /api/indicators?countries=...&year=...`
- **Parámetros:**
  - `countries` → lista separada por comas. Acepta nombre en ES/EN o ISO-3.
  - `year` (opcional) → entero (ej. 2022). Si no hay dato para ese país, se toma el último.
- **Respuestas:**
  - **200 OK**
    ```json
    {
      "raw": [ { "country": "Chile", "year": "2023", "access_internet_pct": 94.5, "fixed_broadband_subs_per100": 24.8, "broadband_speed_mbps": 7.9 } ],
      "comparison": [ { "country": "Chile", "norm": { "access": 1, "infra": 0.7, "capacity": 0.9 }, "score": 0.86, "rank": 1 } ],
      "weights": { "access": 0.33, "infra": 0.33, "capacity": 0.33 },
      "charts": { "radar": { ... }, "bars": { ... } },
      "insights": [ "..." ],
      "meta": { "request": { "countries": [...], "year": 2022 }, "resolved": { "requested": [...], "resolved": ["CHL", ...], "perCountryYear": { "CHL": "2023", ... }, "speedSource": { "CHL": "bandwidth_bps_per_user" } } }
    }
    ```
  - **400 Bad Request** (país no reconocido):
    ```json
    { "error": "País no reconocido", "detail": "Revisa: X. Usa nombre ES o ISO-3." }
    ```
  - **500 Error** (WDI/API):
    ```json
    { "error": "Error obteniendo indicadores WDI", "detail": "WDI HTTP 500" }
    ```

### `POST /api/upload`
- **Body:** `multipart/form-data` con `file` (CSV/JSON).  
- **Estructura esperada (columnas mínimas):**
  - `country` | `pais` | `País` | `Pais`
  - `year` (opcional)
  - `access_internet_pct`
  - `fixed_broadband_subs_per100`
  - `broadband_speed_mbps`
- **Respuesta:** igual esquema que `/api/indicators` pero sin `meta.resolved` (se incluye `meta.request.upload = true`).

---

## 4) Normalización y score
- Para cada indicador:
  - Construimos el vector de valores **brutos** sobre los países seleccionados.
  - Normalizamos *min–max*: `norm = (x - min) / (max - min)` (si `max == min`, todos quedan en 1).
  - Si un valor falta → **0.5** (neutral).
- **Pesos:** uniformes sobre ejes con datos disponibles  
  `weights = { access: 1/k, infra: 1/k, capacity: 1/k }` (`k` = nº de ejes presentes).
- **Score:** promedio ponderado de los valores normalizados.  
  `score = access_norm*w_access + infra_norm*w_infra + capacity_norm*w_capacity`
- **Rank:** orden descendente por `score`.

---

## 5) Hallazgos (heurística)
- Top score y brecha con el último.
- Eje más “diferenciador” (mayor desviación estándar entre normalizados).
- Líder por indicador (valor bruto máximo).
- Nota si se imputaron faltantes (0.5) o se usó proxy para capacidad.

> Diseño *determinista* y sin ML para explicabilidad y reproducibilidad.

---

## 6) Dependencias (backend)
- `express`, `cors`, `dotenv`
- `multer` (upload CSV/JSON)
- `papaparse` (CSV robusto, autodetección `,`/`;`)
- `node-fetch` (solo si `globalThis.fetch` no está disponible)

**Scripts**
```bash
npm start   # node src/server.js
```

**.env**
```
PORT=3000
```

---

## 7) Manejo de países
Mapa **ES/EN → ISO-3** en `iso3.js`. Reglas:
- Si el parámetro ya es ISO-3 (`^[A-Za-z]{3}$`), se acepta tal cual.
- Se eliminan acentos y se normaliza *Title Case* para buscar coincidencias.
- Si no se encuentra, se responde **400** con detalle y sugerencia de usar ES o ISO-3.

---

## 8) Seguridad y privacidad
- Sin autenticación ni cookies (requerimiento).
- No se persisten datos de usuario.
- CORS habilitado para uso local.
- Tamaño de archivo controlado por `multer` (configurable).

---

## 9) Extensibilidad
- **Nuevos indicadores:** añadir códigos en `data.js` y ampliar el modelo en `model.js` + front.
- **Pesos personalizados:** exponer en API `?w_access=&w_infra=&w_capacity=` y validar suma 1.
- **Más ayudas:** mantener tooltips nativos o cambiar a tooltips CSS/JS si se quiere estilo enriquecido.
- **Traducciones:** agregar claves al mapa `iso3.js` (ES/EN) o cargar un diccionario externo.

---

## 10) Pruebas y validación
- **Smoke test:** `GET /api/health` → `{ ok: true }`.
- **Indicadores:** probar `countries=Colombia,Chile,España` con/sin `year`.
- **Upload:** validar CSV con separador `,` y `;`, valores `.` y `,` decimales.
- **Faltantes:** forzar un país con una columna vacía para verificar imputación a 0.5.

---

## 11) Despliegue
- Ejecutar como servicio Node (pm2/systemd) o dentro de un contenedor.
- Poner detrás de un proxy (Nginx) si se sirve a Internet.
- Cache-control desactivado para respuestas (datos “frescos” por defecto).

---

## 12) Contribución y estilo
- JS claro, funciones pequeñas, sin acoplamiento entre subsistemas.
- Nombres de variables descriptivos; evitar *magic numbers*.
- Comentarios solo cuando aclaren una decisión no obvia.
