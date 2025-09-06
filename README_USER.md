# Manual de Usuario — DSS · Evaluación Comparativa de Políticas Digitales (WDI)

Bienvenido/a. Este sistema permite comparar el desempeño digital de un país frente a referencias usando datos del World Bank (WDI).

---

## 1) Concepto general
- **Objetivo:** apoyar decisiones de política digital comparando *Uso de Internet*, *Infraestructura fija* y *Capacidad* entre países.
- **Fuente de datos:** API World Bank WDI (indicadores):
  - Uso: `IT.NET.USER.ZS` (% de personas que usan Internet)
  - Infraestructura fija: `IT.NET.BBND.P2` (suscripciones de banda ancha fija por 100 hab.)
  - Capacidad: `IT.NET.BNDW.PC` (ancho de banda internacional por usuario, en bps → el sistema lo convierte a Mbps).  
    > Si falta `IT.NET.BNDW.PC`, se usa `IT.NET.BBND.P2` como **proxy** (interpretar con cautela).

---

## 2) Cómo usar la interfaz
1. **País principal:** escribe el país base (ej. *Colombia*).
2. **Países de referencia:** agrega hasta 5 países separados por comas (ej. *Chile, México, España, Singapur*).
3. **Año (opcional):** si lo dejas vacío, el sistema usa el **último dato disponible por país**.
4. **Comparar (API):** consulta la API WDI y muestra resultados.
5. **Cargar archivo… (CSV/JSON):** usa tus propios datos con la misma estructura (ver §6).
6. **Descargar CSV:** exporta la tabla de comparación.
7. **Descargar informe:** abre el diálogo de impresión (puedes guardar como PDF).
8. **Limpiar:** vuelve al estado inicial.

> **Tip:** Pasa el mouse por los íconos **“?”** para ver ayuda rápida de cada gráfica.

---

## 3) Interpretación de las gráficas
- **Radar (0–1):** muestra la *posición relativa normalizada* de cada país en: Uso, Infraestructura fija y Capacidad.  
  - 0 = peor valor del conjunto seleccionado; 1 = mejor valor del conjunto seleccionado; 0.5 = neutral/faltante.
- **Barras — Score (0–1):** ranking global como promedio de los ejes disponibles (pesos uniformes por defecto).
- **Indicadores individuales:**
  - **Infraestructura fija:** banda ancha fija por cada 100 hab.
  - **Uso:** % de personas que usan Internet.
  - **Acceso/uso (porcentaje):** misma base que “Uso” para facilitar lectura comparada.
  - **Capacidad:** Mbps/usuario (o proxy si falta).

---

## 4) Tabla de detalle
Muestra valores **brutos** por país, sus **normalizados** (0–1) y el **score** final. Abajo verás los **pesos** aplicados a cada eje (si falta un eje, su peso es 0 y se distribuye entre los demás).

---

## 5) Hallazgos (insights)
El sistema genera una síntesis automática, por ejemplo:
- Mejor desempeño global y brecha con el último.
- Eje con mayor diferenciación (más “dispersión” entre países).
- Líder en cada indicador.
- Notas sobre datos faltantes y uso de proxy.

> **Importante:** estos hallazgos son *descriptivos*; no implican causalidad.

---

## 6) Carga de archivos (CSV/JSON)
Puedes subir datos propios. Estructura mínima esperada por fila (encabezados recomendados):
- `country` (o `pais`/`País`/`Pais`)
- `year` (opcional; si falta, se toma el del campo global “Año” del formulario)
- `access_internet_pct`
- `fixed_broadband_subs_per100`
- `broadband_speed_mbps`

**Ejemplo CSV:**
```csv
country,year,access_internet_pct,fixed_broadband_subs_per100,broadband_speed_mbps
Colombia,2022,70.5,17.2,5.3
Chile,2022,87.1,24.8,7.9
España,2022,94.0,32.1,8.5
```

> Separador: `,` (coma) o `;` (punto y coma). El sistema detecta automáticamente.

---

## 7) Errores frecuentes y soluciones
- **“País no reconocido” (400):** corrige la ortografía o usa su código ISO-3 (ej. COL, CHL, ESP).
- **Año sin datos:** borra el año para que el sistema utilice el último disponible por país.
- **Gráficas vacías:** verifica conexión a Internet y que no haya bloqueos a `api.worldbank.org`.
- **Valores atípicos o idénticos:** si todos los países tienen el mismo valor en un indicador, la normalización asigna 1 a todos (no hay variación).

---

## 8) Privacidad y límites
- No se almacenan datos personales ni cookies. Todo se ejecuta del lado del cliente/servidor local.
- La API WDI puede tener **latencia** o **intermitencias**. Intenta nuevamente o reduce la cantidad de países.

---

## 9) Buenas prácticas de lectura
- Compara países con características razonablemente comparables.
- Observa tendencias con y sin el campo “Año” para comprender evolución vs. valor más reciente.
- Usa los hallazgos como *punto de partida* para un análisis más profundo.
