# Esquemas JSON de Hacienda para 01 y 03

Los archivos de esta carpeta son copias sin cambios de los esquemas publicados por el
Ministerio de Hacienda (MH). Se descargaron el 13 de octubre de 2026. No los edite: si
MH publica una versión nueva, reemplace el archivo completo y actualice esta página.

## ministerio-2026/ (fuente principal)

Origen: página de información técnica de MH, <https://factura.gob.sv/informacion-tecnica-y-funcional/>,
paquete "JSON Schemas (anexo al manual técnico)", enlace de descarga número 4399. El
paquete es `svfe-json-schemas.zip`; dentro, la fecha de modificación es el 27 de julio de 2026.

| Archivo | Ruta dentro del zip | Tipo | Versión que exige | SHA-256 |
|---|---|---|---|---|
| `fe-f-v2.json` | `v2/fe-f-v2.json` | 01 Factura de consumidor final | `identificacion.version` = 2 | `2887ff3ccf5594eb1f49dcec1ce8bba134a86462f900069de1365d18ff997aff` |
| `fe-ccf-v4.json` | `v4/fe-ccf-v4.json` | 03 Comprobante de crédito fiscal | `identificacion.version` = 4 | `2c2db8b3f6144bdd0d128ec2babecd38f277f8493458a06cf1b2be7b816fba32` |

Los dos archivos coinciden byte a byte con las copias del espejo de la sección siguiente
(`DTE-FE-v2.json` y `DTE-CCFE-v4.json` en ese repositorio), lo que sirve de prueba independiente.

## espejo-herson/ (versiones anteriores, solo para pruebas)

Origen: repositorio comunitario <https://github.com/herson/dte-json-schemas> (rama `main`,
descargado el 13 de octubre de 2026). No está afiliado a MH.

| Archivo | Tipo | Versión | SHA-256 |
|---|---|---|---|
| `DTE-FE-v1.json` | 01 | 1 | `748673c0f2d45d84e6b13a21d2ba411eb731ce199eb946dc33ca9b995571f0c1` |
| `DTE-CCFE-v3.json` | 03 | 3 | `dec029ecec57015c17f5e96f36a55321cb61b8433e1e410b08330502fc1f3740` |

Estas dos versiones contienen el patrón `^(0[1-9]||10||99)$` (01) y `^(0[1-9]||1[0-3]||99)$`
(03) en `resumen.pagos[].codigo`, que es el hecho central del caso de estudio. La
herramienta no emite documentos con estas versiones. Se usan para demostrar el defecto del
patrón y para comparar. El README del espejo dice que la Normativa de Cumplimiento v2.0 es
obligatoria desde el 1 de diciembre de 2026 y que hasta esa fecha MH acepta también las
versiones anteriores. Esa fecha no se verificó contra la normativa de MH.

## Comprobaciones hechas

- Cada archivo se leyó como JSON y se revisó `identificacion.tipoDte` (constante) y
  `identificacion.version` (constante).
- Los archivos `fe-f-v2.json` y `fe-ccf-v4.json` tienen el mismo SHA-256 que `DTE-FE-v2.json`
  y `DTE-CCFE-v4.json` del espejo.
- Los catálogos usados (CAT-011, 012, 013, 014, 015, 016, 017, 019) se leyeron del libro
  oficial "Catálogos - Facturación Electrónica" (descarga 5353 de factura.gob.sv).

## Generación `caso` y municipios

La generación `caso` usa los archivos de `espejo-herson/`, que son una copia de un repositorio
comunitario y no del Ministerio. Sus `allOf` por departamento limitan `municipio` a la lista
anterior a la reforma municipal: el departamento 05 admite los códigos 01 a 22 y el 06, los 01 a
19. Los códigos 18 (Tamanique, departamento 05) y 14 (San Salvador, departamento 06) de
`fixtures/caso/` vienen del paquete npm de terceros `seedcode-catalogos-mh`, en las versiones 1.0.0
a 7.0.0. Desde la versión 8.0.0 ese paquete usa la lista posterior. Ver `docs/hallazgos.md`,
sección 4.
