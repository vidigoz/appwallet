# 👛 App Wallet

Una **PWA instalable** que muestra tus apps de Netlify como tarjetas (con vista
previa en vivo) y las abre a pantalla completa dentro de la propia cartera.

Sin frameworks, sin build, sin backend: HTML + CSS + JavaScript vanilla.

---

## ✨ Qué hace

- **Tarjetas con preview real**: cada app se renderiza dentro de un `<iframe>`
  escalado, así ves tu app de verdad en la tarjeta.
- **Visor a pantalla completa**: al tocar una tarjeta se abre la app a pantalla
  completa con botones de **volver**, **recargar**, **pantalla completa** y
  **abrir en pestaña externa**.
- **Botón atrás integrado**: además del botón propio del visor, se agrega una
  entrada al historial, así el gesto/botón atrás del móvil vuelve a la cartera.
- **Alta, edición y borrado** de apps con nombre, URL, emoji y color.
- **Buscador** para filtrar cuando tienes muchas apps.
- **Persistencia en `localStorage`**: tus apps viven en tu dispositivo.
- **Exportar / importar respaldo** en JSON.
- **PWA instalable**: manifest, service worker con caché del shell y botón
  "Instalar" cuando el navegador lo ofrece.

## 📁 Estructura

```
index.html              Shell de la app (markup + plantillas)
manifest.webmanifest    Manifiesto PWA
service-worker.js       Caché del app shell (funciona offline)
netlify.toml            Configuración de deploy (sin build)
apps.json               Apps de ejemplo que se cargan la primera vez
css/styles.css          Design system completo
js/app.js               Orquestador: estado, editor, visor, PWA
js/cards.js             Vista de tarjetas (previews diferidos + escalado)
js/storage.js           Persistencia y saneo de datos
js/config.js            Constantes (paleta, claves, tamaños)
icons/                  Íconos PWA generados
scripts/                Herramientas de desarrollo (no se publican)
```

## 🚀 Probar en local

Necesitas servirlo por HTTP (los módulos ES y el service worker no funcionan
con `file://`):

```bash
cd appwallet
python3 -m http.server 8777
# abre http://localhost:8777
```

Para ver la vista previa real de cada app, abre el sitio en Chrome y activa el
modo móvil en DevTools.

## 🧪 Tests

```bash
node scripts/e2e.mjs          # 56 comprobaciones (UI + datos) en Chrome headless
node scripts/check.mjs        # valida ids y referencias de index.html
node scripts/gen-icons.mjs    # regenera los íconos PNG
```

## 📦 Desplegar en Netlify

### Opción A — Desde GitHub (recomendada: cada `git push` re-despliega)

1. Sube el proyecto al repositorio:

   ```bash
   git init -b main
   git add -A
   git commit -m "App Wallet PWA"
   git remote add origin https://github.com/vidigoz/appwallet.git
   git push -u origin main
   ```

2. En <https://app.netlify.com> → **Add new site → Import an existing project**
   → **GitHub** → autoriza y elige `vidigoz/appwallet`.
3. Netlify lee el `netlify.toml`: deja **Build command vacío** y
   **Publish directory = `.`** (tal como lo detecta). Pulsa **Deploy**.
4. Listo. La URL será `https://<nombre>.netlify.app`; cámbiala en
   **Site configuration → Change site name** si quieres algo más corto.

### Opción B — Drag & drop (sin CLI ni Git)

1. Comprime la carpeta `appwallet` (o arrástrala tal cual).
2. Entra en <https://app.netlify.com/drop> y suelta la carpeta.
3. Netlify te dará una URL tipo `https://algo-random.netlify.app`.
   Renómbrala en **Site settings → Change site name**.

### Opción C — Netlify CLI

```bash
cd appwallet
netlify deploy --dir=. --prod
```

> Al entrar desde la URL publicada, en Android/Chrome aparecerá el botón
> **Instalar**; en iOS usa **Compartir → Añadir a pantalla de inicio**.

## ✏️ Personalizar

- **Apps de ejemplo**: edita `apps.json`. Solo se usan la primera vez (o al
  pulsar "Cargar apps de ejemplo" en el menú de datos). Después mandan tus
  datos guardados en el navegador.
- **Colores sugeridos**: la paleta está en `js/config.js` (`ACCENTS`).
- **Apariencia**: los tokens de color y radios están al inicio de
  `css/styles.css`.

## ⚠️ Notas sobre los iframes

La cartera abre cada app dentro de un `<iframe>`, no en una pestaña nueva: así
funcionan la **vista previa** de las tarjetas y el **visor** con barra, botón
*volver* y recarga. Un `<iframe>` es un documento *anidado* dentro del nuestro, y
los navegadores tratan ese caso de forma distinta al de una pestaña normal: una
web puede **permitir o prohibir** ser enmarcada (con `X-Frame-Options` o CSP
`frame-ancestors`), pero no puede impedir que la abras en su propia pestaña. Por
eso el botón **abrir en pestaña externa** funciona incluso con `DENY`.

Algunas webs envían `X-Frame-Options` o `Content-Security-Policy:
frame-ancestors` y **no permiten** mostrarse dentro de otra página. Netlify **no**
añade esas cabeceras por defecto, pero es fácil que estén en el `netlify.toml`
de tus propios sitios (es un header que se copia mucho como "buena práctica").
Si es el caso, el navegador muestra un error en consola del tipo:

```text
Refused to display 'https://tu-app.netlify.app/' in a frame because it set
'X-Frame-Options' to 'sameorigin'.
```

**En ese caso la tarjeta se verá en blanco**: el iframe es de otro origen, así
que la cartera no puede leer lo que pasó dentro. El navegador **no puede
detectarlo desde la página**: no se pueden leer las cabeceras de otro origen
(CORS) y, además, Chrome dispara el evento `load` del iframe aunque la web se
bloquee. Por eso la comprobación se hace en el servidor, con la función de
Netlify `netlify/functions/frame-check.mjs`:

```text
GET /.netlify/functions/frame-check?url=https://tu-app.netlify.app
→ { "embeddable": false, "reason": "x-frame-options: SAMEORIGIN" }
```

Con eso la cartera se comporta así:

| Situación | Qué hace la cartera |
| --- | --- |
| La web **permite** iframes | Vista previa normal en la tarjeta y en el visor |
| La web **bloquea** iframes | La tarjeta deja su **ícono como fondo** (sin rectángulo en blanco) y el visor avisa al instante |

Y lo puedes cambiar a mano cuando quieras:

- En la tarjeta: **⋮ → Mostrar solo el ícono** (y *Intentar vista previa* para volver atrás).
- En el editor: la casilla **Vista previa dentro de la tarjeta**.
- En el visor: **Reintentar** vuelve a preguntar al servidor, así que si arreglas
  la web, la vista previa vuelve sola.
- Automático: al abrir la cartera se comprueba cada app una vez (en segundo
  plano) y las que bloquean pasan a solo-ícono. Lo que decidas a mano nunca se
  sobrescribe.

En todos los casos tienes el botón **abrir en pestaña nueva**: en la esquina de
cada tarjeta (↗), en su menú (⋮) y en el visor. Ese botón funciona incluso con
`X-Frame-Options: DENY`, porque el bloqueo solo se aplica a los iframes.

**Cómo arreglarlo en la app incrustada** (no en la cartera): quita su
`X-Frame-Options` de `netlify.toml` o `_headers` y, si quieres mantener la
protección, usa CSP `frame-ancestors` (que sí acepta varios orígenes):

```toml
[[headers]]
  for = "/*"
  [headers.values]
    Content-Security-Policy = "frame-ancestors 'self' https://*.netlify.app"
```

Recuerda que las cabeceras las aplica Netlify en el **deploy**: hay que hacer
`git push` y esperar el redeploy para que el cambio surta efecto.

Como el iframe es de otro origen, la cartera no puede leer su contenido: por eso
el botón **volver** es propio (no se puede usar el "atrás" del navegador dentro
del iframe).
