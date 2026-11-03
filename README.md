# OSINT Intelligence Workspace

PWA inicial per centralitzar consultes OSINT. Inclou una primera integració amb BreachDirectory via Cloudflare Worker perquè la clau de RapidAPI no quedi exposada al navegador.

## Desplegament de la web
1. Activa GitHub Pages a **Settings → Pages → Deploy from a branch → main / root**.
2. La web quedarà a https://maarccorresa.github.io/OSINT/ (quan Pages acabi el desplegament).

## Configurar BreachDirectory (Cloudflare Worker)
Cal tenir una subscripció/API key de BreachDirectory a RapidAPI.

1. Instal·la Node.js i Wrangler: `npm install -g wrangler`.
2. Entra a la carpeta `worker` i autentica't: `wrangler login`.
3. Defineix l'origen permès (substitueix-lo per l'URL real de GitHub Pages):
   `wrangler secret put ALLOWED_ORIGIN` no és secret, així que defineix-lo com a variable al tauler de Cloudflare Workers → Settings → Variables, valor `https://maarccorresa.github.io`.
4. Desa la clau de RapidAPI com a secret: `wrangler secret put RAPIDAPI_KEY`.
5. Desplega: `wrangler deploy`.
6. Copia la URL del Worker (ex. `https://osint-breach-proxy.<subdomini>.workers.dev`) i enganxa-la a la constant `API_URL` de `app.js`.
7. Fes commit i espera que GitHub Pages publiqui els canvis.

## API utilitzada
GET `https://breachdirectory.p.rapidapi.com/?func=auto&term=<identificador>`
Headers: `X-RapidAPI-Key` i `X-RapidAPI-Host: breachdirectory.p.rapidapi.com`.

El proxy elimina camps amb contrasenyes, hashes, credencials i tokens abans de retornar el resultat. No es fan cerques de contrasenyes. El mode `auto` deixa que el proveïdor interpreti el tipus d'identificador; no es garanteix que accepti telèfons o tots els formats. Consulta la documentació i els límits del teu pla RapidAPI.

## Privacitat i ús
- Les cerques es transmeten a BreachDirectory/RapidAPI; no són consultes locals.
- L'historial de cerques es desa al localStorage del navegador i es pot esborrar.
- Utilitza-ho només per a investigacions autoritzades i dades que tinguis dret a consultar.
- No posis mai la clau RapidAPI a `app.js`, GitHub Pages o cap codi del navegador.
