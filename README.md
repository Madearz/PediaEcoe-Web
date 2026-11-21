# PediaECOE AI

Simulador privado de ECOE de pediatría. El navegador usa React, Vite y Firebase Authentication con Google. Firestore conserva perfiles, invitaciones, resultados y progreso. Un Cloudflare Worker comprueba el acceso, controla los tiempos y calcula los puntajes con la rúbrica del caso.

El repositorio se reconstruyó a partir de los archivos de configuración recibidos. La carpeta `src/` del proyecto anterior no estaba entre los adjuntos. El README anterior describía un simulador local sin autenticación, con cinco casos y resultados en LocalStorage. Este proyecto incluye un banco en Firestore y estaciones curriculares de los grupos A y B para revisión médica. Los resultados locales anteriores requieren una migración con el código original.

## 1. Crear Firebase en Spark

1. Abre la [consola de Firebase](https://console.firebase.google.com/). Crea un proyecto exclusivo para PediaECOE AI. Google Analytics es opcional. Conserva **Spark** y deja la facturación sin configurar.
2. En **Configuración del proyecto → General → Tus apps**, registra una aplicación web. Copia `apiKey`, `authDomain`, `projectId` y `appId` de la configuración web. Son valores públicos de Firebase para identificar el proyecto.
3. En **Authentication → Sign-in method**, habilita **Google** y selecciona el correo de asistencia del proyecto. En **Authentication → Settings → Authorized domains**, agrega el host de GitHub Pages, por ejemplo `tuusuario.github.io`. Para pruebas locales, agrega `localhost`. Si usas Cloudflare Pages, agrega también el host `tuproyecto.pages.dev`. Escribe solo el host, sin `https://` ni rutas. Conserva `authDomain` entregado por Firebase.
4. En **Firestore Database**, crea la base predeterminada en **Standard**, elige su región e inicia en modo de producción. Conserva Spark.
5. Instala [Node.js 22 LTS](https://nodejs.org/) o posterior. Abre una terminal en esta carpeta y ejecuta los siguientes comandos.

   ```sh
   npm ci
   npx firebase login
   npx firebase deploy --project TU_ID_DE_PROYECTO --only firestore:rules,firestore:indexes
   ```

   Si prefieres la consola, copia el contenido completo de `firestore.rules` en **Firestore → Rules**, publícalo y crea los índices compuestos de `firestore.indexes.json`. Espera a que estén activos antes de probar el historial.

## 2. Crear la única cuenta administradora

1. Crea `.env.local` a partir de `.env.example`. Completa los cuatro valores web de Firebase. Deja `VITE_API_URL` vacío hasta tener el Worker. Ejecuta `npm run dev` y abre la dirección que aparece en la terminal.
2. Entra con **Continuar con Google** usando tu cuenta administradora. Verás la pantalla de invitación pendiente. Esto crea una identidad en Firebase Authentication.
3. En **Firebase → Authentication → Users**, copia el **UID** de esa cuenta. En **Firestore → Data**, crea estos dos documentos desde la consola administrativa:

   | Colección | ID exacto del documento | Campo |
   |---|---|---|
   | `authorized_emails` | Tu correo de Google en minúsculas | `active`, tipo booleano, valor `true` |
   | `admins` | El UID que acabas de copiar | `active`, tipo booleano, valor `true` |

   El rol se concede por existencia del documento `admins/UID`. El campo se incluye para poder crear el documento desde la consola. Mantén solo un documento en esa colección. Una cuenta que controla Firebase mediante IAM puede gestionar ese documento.
4. Vuelve a cargar la aplicación. En **Administración → Invitaciones**, autoriza los correos de Google de los estudiantes. Puedes escribirlos individualmente o importar un CSV de una columna con hasta 400 filas y encabezado opcional `correo`. La importación agrega correos nuevos y conserva las suspensiones existentes. El CSV con correos personales se conserva fuera del repositorio.
5. En **Administración → Banco de casos**, usa **Importar casos JSON** y selecciona `content/banco-curricular.json` para cargar las estaciones de ambos grupos. La importación conserva los casos que ya existen y marca los nuevos como **En revisión médica**. El archivo `content/COBERTURA-CURRICULAR.md` vincula cada caso y su rúbrica con las páginas de origen. Tras revisar cada estación con la responsable clínica, selecciona **Publicado**, confirma la revisión y guarda. Para un circuito hacen falta al menos tres casos publicados.
6. Las rúbricas y los casos de producción deben introducirse por el panel. Evita subir al repositorio público JSON que contenga rúbricas de uso académico. Los tres borradores iniciales son ejemplos públicos y quedan fuera del sitio compilado. Conserva `content/banco-curricular.json` en una ubicación privada y exclúyelo también si subes archivos manualmente por la web de GitHub. Ese JSON incluye las respuestas y rúbricas del temario. El banco se puede cargar desde tu equipo tras publicar la aplicación.

## 3. Desplegar el Worker en el nivel gratuito

El Worker se necesita para generar circuitos, guardar evaluaciones y ofrecer el diálogo libre. Con `AI_ENABLED = "false"`, funciona con el motor estructurado. Usa **Workers Free** y deja la facturación sin configurar.

1. En [Cloudflare](https://dash.cloudflare.com/), crea o usa una cuenta con **Workers Free**. Ejecuta `npx wrangler login`. El comando abrirá Cloudflare para autorizar el CLI.
2. Edita `wrangler.toml` y establece `FIREBASE_PROJECT_ID` con el ID web del paso 1 y `ALLOWED_ORIGINS` con tus orígenes completos, separados por comas. Por ejemplo, para probar y publicar, escribe `http://localhost:5173,https://tuusuario.github.io`. Elimina el origen local del Worker público una vez terminadas las pruebas. Conserva `AI_ENABLED = "false"`.
3. En [Google Cloud Console → IAM y administración → Cuentas de servicio](https://console.cloud.google.com/iam-admin/serviceaccounts), selecciona el mismo proyecto de Firebase y crea una cuenta específica para el Worker. Concede **Cloud Datastore User** (`roles/datastore.user`) en ese proyecto. Este rol autoriza acceso de datos al servicio, por lo que el Worker aplica sus comprobaciones antes de usarlo. La cuenta no necesita el rol **Owner**, **Editor** ni **Firebase Admin**.
4. En esa cuenta de servicio, crea una clave JSON. Guárdala fuera del repositorio en una ubicación privada. Si la organización bloquea la creación de claves, solicita una cuenta de proyecto habilitada para este método a su responsable. Comparte el acceso al proyecto por IAM y evita compartir el JSON.
5. Despliega el Worker y carga la clave en el almacén de secretos. En macOS o Linux, reemplaza la ruta de ejemplo por la de tu archivo local.

   ```sh
   npx wrangler deploy
   npx wrangler secret put FIREBASE_SERVICE_ACCOUNT < /ruta/privada/service-account.json
   ```

   En Windows PowerShell usa `Get-Content -Raw "C:\ruta\privada\service-account.json" | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT`. También puedes crear el secreto `FIREBASE_SERVICE_ACCOUNT` desde **Cloudflare → Worker → Settings → Variables and Secrets**, pegando el JSON completo en el campo **Secret**. Las claves viven en el Worker. No uses variables `VITE_*` para guardarlas.
6. Copia la URL `https://…workers.dev` que devuelve Wrangler. Ponla en `VITE_API_URL` en tu archivo local. Reinicia `npm run dev`. Abre el simulador con una cuenta autorizada y completa un circuito de prueba. Desde el banco, **Practicar este caso** pone el tema elegido como primera estación y el Worker elige dos más, sin repetición.
7. Si tu cuenta tiene acceso gratuito a **Workers AI**, cambia `AI_ENABLED` a `true` y ejecuta `npx wrangler deploy` de nuevo. Si el binding bloquea el despliegue en tu cuenta, puedes quitar las dos líneas de la sección `[ai]` y mantener `AI_ENABLED = "false"`. El adaptador invoca al modelo configurado en `AI_MODEL` mediante el binding `AI`. Puedes usar el banco, la voz del navegador y la evaluación con la IA apagada o cuando el proveedor agota su cuota. El estudiante ve «IA generativa» o «Respuesta estructurada» según el origen de la respuesta.

## 4. Publicar en GitHub Pages

1. Crea un repositorio **público** en GitHub para usar Pages con GitHub Free. Agrega los archivos fuente de esta carpeta, incluida **.github/workflows/pages.yml**, a la rama `main`. Evita subir `.env.local`, claves JSON, listados de alumnos, PDFs de origen y contenido de evaluación de producción. Excluye también `content/banco-curricular.json` de esa subida. El frontend público muestra la pantalla de acceso. Firestore y el Worker comprueban los permisos de los datos privados.
2. En el repositorio, entra en **Settings → Secrets and variables → Actions → Variables**. Crea estas cinco variables de repositorio con los valores de los pasos anteriores:

   | Variable | Valor |
   |---|---|
   | `VITE_FIREBASE_API_KEY` | `apiKey` web de Firebase |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` web de Firebase |
   | `VITE_FIREBASE_PROJECT_ID` | `projectId` web de Firebase |
   | `VITE_FIREBASE_APP_ID` | `appId` web de Firebase |
   | `VITE_API_URL` | URL del Worker, con HTTPS |

3. En **Settings → Pages**, selecciona **GitHub Actions** como origen. Ve a **Actions → Publicar en GitHub Pages → Run workflow**. La URL aparece en el paso **Publicar** y en **Settings → Pages** cuando termine. Los siguientes cambios en `main` disparan otro despliegue.
4. Abre la página y verifica el acceso. Las rutas usan fragmentos, por ejemplo `https://tuusuario.github.io/tu-repo/#/resultados`, para que las recargas funcionen en alojamiento estático. No se necesita dominio personalizado.
5. Para añadir el logo original, coloca su archivo PNG en `public/logo-pediaecoe.png`, crea la variable web opcional `VITE_BRAND_LOGO=logo-pediaecoe.png` y vuelve a compilar. La marca tipográfica incluida cubre la instalación sin ese archivo.

### Alternativa con Cloudflare Pages

Conecta el repositorio desde **Workers & Pages → Create application → Pages**. Usa `main` como rama de producción, `npm run build` como comando y `dist` como carpeta de salida. Configura las mismas cinco variables web y Node 22 o posterior. Agrega el dominio Pages en Firebase Authentication y el origen HTTPS en `ALLOWED_ORIGINS` del Worker. Si despliegas por carga directa, sube `dist/` después de compilar con las variables correctas.

## 5. Probar antes de invitar al grupo

Las pruebas locales usan un proyecto emulado con identificadores de prueba y un proveedor simulado para verificar los controles del Worker. Para probar OAuth de Google, usa tus propias cuentas en el proyecto Firebase configurado.

1. Ejecuta `npm test`, `npm run build` y `npm run test:rules`. Para el emulador de Firestore necesitas Java 21.
2. Desde una ventana privada, entra con una cuenta de Google que no esté invitada. Verifica el mensaje de acceso y prueba directamente `/#/simulador`, `/#/resultados` y `/#/perfil`.
3. Autorízala desde la cuenta administradora. Comprueba que se cree un solo perfil. Completa un circuito de tres estaciones y abre el historial en otro navegador con la misma cuenta.
4. Entra con otro estudiante y confirma que su historial sea independiente. Suspende al primero mientras mantiene el simulador abierto. La aplicación debe ocultar el área privada y las nuevas lecturas y llamadas al Worker deben ser rechazadas.
5. Entra con la administradora y confirma la importación CSV, los tres estados de casos y estadísticas. Prueba un circuito con la IA desactivada y en un navegador sin micrófono. Las preguntas escritas y las opciones estructuradas siguen disponibles.

## Almacenamiento y cuotas

| Servicio | Nivel gratuito y uso |
|---|---|
| Firebase Authentication | Google como proveedor social. Conserva Spark y el proveedor estándar. No se usa autenticación por SMS ni un proveedor de pago. |
| Firestore Standard | Una base con cuota gratuita por proyecto, 1 GiB, 50 000 lecturas diarias, 20 000 escrituras, 20 000 eliminaciones y 10 GiB mensuales de salida. Las consultas se paginan, el historial usa índices y el resumen se actualiza en la misma escritura del resultado. Las lecturas de reglas también pueden consumir cuota. |
| Workers Free | Hasta 100 000 solicitudes diarias y 10 ms de CPU por solicitud en el plan Free. Los circuitos se limitan a 5 por cuenta y 350 por día en la aplicación. El recuento de la aplicación usa días UTC. |
| Workers AI | La cuota gratuita publicada es 10 000 Neurons diarias por cuenta. Depende del modelo y de los tokens consumidos. El Worker limita los intentos de IA a 8 por estudiante y 100 globales por día, con respuestas cortas. El diálogo en línea tiene un límite adicional de 40 por estudiante y 2 000 globales por día. Las cuotas del proveedor prevalecen. |
| Durable Objects SQLite | El contador de cuotas usa almacenamiento SQLite compatible con Workers Free. Guarda conteos del día por UID y los elimina al cambiar de día. |
| GitHub Pages | Con GitHub Free se publica desde un repositorio público. GitHub aplica límites de tamaño, transferencia y uso de Actions. El repositorio se mantiene libre de datos personales y claves. |

Para un grupo de unos 100 estudiantes con horarios escalonados, programa primero un piloto y revisa el panel de uso. Si Firestore o el Worker alcanzan su límite, los guardados nuevos pueden fallar hasta que se restablezca la cuota. La pérdida de disponibilidad exclusiva del proveedor de IA permite continuar el circuito con respuestas estructuradas y conservar el guardado normal. El reconocimiento y la síntesis dependen de Web Speech del navegador. El navegador puede usar su propio servicio de reconocimiento. Es posible escribir en todo momento durante la estación.

Firestore guarda `users`, `simulation_sessions`, `station_results` y `student_progress` vinculados al UID verificado. `authorized_emails` y `admins` controlan los permisos. Las rúbricas de producción viven en `case_rubrics` y las versiones usadas por cada intento en `private_sessions`. No se guardan audios ni transcripciones completas. Solo se conservan en la pestaña las selecciones pendientes para reanudar la estación al recargar. El servidor registra plazos, calcula el puntaje y usa una operación atómica para que los reintentos no dupliquen el resultado ni el progreso. Los puntajes representan práctica simulada.

Fuentes de cuotas oficiales

- [Cuotas de Firestore](https://firebase.google.com/docs/firestore/quotas)
- [Planes de Firebase](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
- [Límites de Cloudflare Workers](https://developers.cloudflare.com/workers/platform/limits/)
- [Precios de Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Precios de Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Límites de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)

## Modo llamada

Durante una estación, pulsa **Iniciar llamada** y concede permiso al micrófono. Habla cuando aparezca **Te escucha**. La aplicación envía una pregunta, reproduce la respuesta y reactiva el micrófono cuando el familiar termina. **Colgar** cancela el turno y detiene la voz. El dictado editable y las preguntas escritas siguen disponibles.

El micrófono y la voz dependen del soporte de Web Speech en el navegador. Puedes ver la transcripción durante la estación. Con Workers AI, se envían la pregunta y hasta dos turnos recientes como texto para contextualizar la respuesta. La aplicación no sube archivos de audio ni guarda la conversación en Firestore. Si la IA está apagada, no responde o agota su cuota, se leen las respuestas estructuradas del caso. La lista de criterios evaluables sigue disponible en **Anamnesis**.

## Archivos principales

| Archivo o carpeta | Uso |
|---|---|
| `src/auth.tsx` y `src/firebase.ts` | Google, sesión local, perfil y verificación de invitación |
| `src/Admin.tsx` y `src/Student.tsx` | Administración, banco, perfil, historial y estadísticas |
| `src/Circuit.tsx` y `src/voice.ts` | Simulador, herramientas clínicas y voz |
| `firestore.rules` y `firestore.indexes.json` | Permisos e índices de Firestore |
| `worker/` y `shared/clinical.mjs` | Verificación de tokens, cuotas, IA y calificación |
| `content/COBERTURA-CURRICULAR.md` | Matriz de los grupos A y B con referencias por estación |
| `content/banco-curricular.json` | Banco evaluable de uso privado, listo para importar en revisión médica |
| `.github/workflows/pages.yml` | Compilación y publicación estática |
