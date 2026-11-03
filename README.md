# OSINT Intelligence Workspace

PWA per consultar identificadors amb fonts públiques, sense API keys ni comptes.

## Desplegament
1. Activa GitHub Pages a **Settings → Pages → Deploy from a branch → main / root**.
2. Web: https://maarccorresa.github.io/OSINT/
3. No cal desplegar Cloudflare Worker ni configurar secrets.

## Fonts integrades
- **Email:** XposedOrNot `GET https://api.xposedornot.com/v1/check-email/{email}`. L'API gratuïta no requereix clau per aquest endpoint. Té límits per IP: 2 peticions/segon, 25/hora i 100/dia. Els endpoints de domini sí que requereixen clau. Documentació: https://xposedornot.com/api_doc
- **Telèfon:** libphonenumber-js carregada des de jsDelivr. Valida i normalitza números internacionals; no identifica titulars ni operadora. Documentació: https://github.com/catamphetamine/libphonenumber-js
- **IP:** RIPEstat (WHOIS i informació de routing) + RDAP públic. RIPEstat: https://stat.ripe.net/docs/
- **Domini:** Cloudflare DNS over HTTPS (A, AAAA, MX, NS, TXT) + RDAP. DNS docs: https://developers.cloudflare.com/1.1.1.1/encryption/dns-over-https/
- **Username:** perfil públic de GitHub. Sense token, l'API REST té un límit general de 60 peticions/hora per IP; els endpoints de cerca tenen límits més baixos. Docs: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api

## Limitacions
- Les fonts són globals, no exclusivament europees. La cobertura d'un número o IP depèn de la font.
- La validació telefònica no revela el titular ni confirma que el número estigui actiu.
- GitHub només comprova si existeix un perfil amb aquell username a GitHub, no a totes les xarxes.
- Les APIs externes poden tenir límits, canviar o bloquejar peticions del navegador (CORS). Si una font bloqueja CORS, caldrà un proxy públic propi o una alternativa compatible; no s'ha d'afegir cap clau secreta al frontend.
- Els resultats de filtracions poden ser incomplets. No es mostren contrasenyes ni hashes.
- L'historial es desa al localStorage del navegador i es pot esborrar.

## Privacitat i ús
Les cerques s'envien als proveïdors indicats. No facis consultes sobre dades personals sense autorització i revisa les condicions d'ús de cada font.
