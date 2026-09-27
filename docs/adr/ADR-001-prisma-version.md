# ADR-001: Selección y Estabilización de la Versión de Prisma ORM (Prisma 7.10 frente a Prisma 8)

- **Estado:** Aprobado
- **Fecha:** 2026-09-22
- **Historia de Usuario:** HU-002 (Slice 002.1)
- **Decisores:** Equipo de Arquitectura e Ingeniería

---

## 1. Contexto

El documento de arquitectura (`docs/arquitectura-software-farmacia.md`, líneas 30 y 196) especifica el uso de *Prisma ORM 8* para el acceso a datos, migraciones transaccionales y operaciones de concurrencia en PostgreSQL.

Durante la implementación de la capa de persistencia en HU-001 (Slice 001.2), se identificó el hallazgo **F-07**:
En el registro público de npm, Prisma 8 se encuentra en fase de pre-lanzamiento (Release Candidate: `8.0.0-rc.15`), mientras que la versión GA (*General Availability*) estable vigente y recomendada para producción es **Prisma 7.10.0**.

Antes de ejecutar la primera migración funcional del proyecto (modelos de identidad y sesiones), es mandatorio tomar una decisión técnica formal sobre la versión canónica a utilizar.

---

## 2. Opciones Consideradas

### Opción A: Mantener Prisma 7.10.0 GA estable (Seleccionada)
- **Ventajas:**
  - Versión con soporte oficial para producción y correcciones de seguridad consolidadas.
  - Compatibilidad completa y probada con PostgreSQL 18 a través del driver adapter oficial `@prisma/adapter-pg`.
  - Soporte nativo para `prisma.config.ts`, desacoplando la configuración del datasource.
  - Cero riesgos de regresiones o cambios de API propios de versiones en desarrollo activo (RC).
- **Desventajas:**
  - Discrepancia nominal respecto al texto inicial de la arquitectura que mencionaba versión 8.

### Opción B: Migrar a Prisma 8 (Release Candidate)
- **Ventajas:**
  - Alineación estricta con la numeración mencionada en el documento de arquitectura.
- **Desventajas:**
  - Inaceptable para un sistema operativo de farmacia con manejo crítico de inventario, dinero y transacciones ACID.
  - Las versiones en fase Release Candidate están sujetas a cambios de comportamiento inesperados y falta de estabilidad en herramientas de migración (`prisma migrate`).
  - Viola las directrices de calidad y estabilidad estipuladas en `AGENTS.md`.

---

## 3. Decisión

Se adopta formalmente la **Opción A**: el proyecto se mantiene en **Prisma 7.10.0** como versión canónica de persistencia.

Se mantendrán fijadas las dependencias:
- `prisma@^7.10.0`
- `@prisma/client@^7.10.0`
- `@prisma/config@^7.10.0`
- `@prisma/adapter-pg@^7.10.0`

Esta decisión resuelve y cierra de forma definitiva el hallazgo **F-07**.

---

## 4. Consecuencias

1. Todas las migraciones iniciales y modelos funcionales (partiendo de `User` y `Session`) se generarán y validarán con el motor Prisma 7.10.
2. Se garantiza la reproducibilidad de compilación y pruebas tanto en entornos locales como en el pipeline de Integración Continua (GitHub Actions).
3. No se introducirán paquetes marcados como `rc` o `beta` en la cadena de persistencia.

---

## 5. Condición Futura de Revisión

Se reevaluará una actualización a Prisma 8 únicamente cuando concurran las siguientes condiciones:
1. Publicación formal de una versión **GA estable** de Prisma 8 en npm (no release candidate).
2. Publicación de la guía oficial de migración de Prisma 7 a 8.
3. Validación en un slice exclusivo de spike/infraestructura sin comprometer el modelo funcional existente.
