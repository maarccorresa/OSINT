# OSINT Intelligence Workspace

PWA per consultar identificadors amb fonts públiques, sense API keys ni comptes.

## Desplegament
1. Activa GitHub Pages a **Settings → Pages → Deploy from a branch → main / root**.
2. Web: https://maarccorresa.github.io/OSINT/
3. No cal desplegar cap backend ni configurar credencials.

## Fonts integrades
- **Correu:** XposedOrNot. Retorna noms de filtracions conegudes associades al correu consultat. No mostra contrasenyes. L'API gratuïta no requereix clau per aquest endpoint i aplica límits per IP. Documentació: https://xposedornot.com/api_doc
- **Telèfon:** libphonenumber-js. Valida i normalitza números internacionals i pot indicar país i tipus de línia. No identifica titulars ni confirma que el número estigui actiu. Documentació: https://github.com/catamphetamine/libphonenumber-js
- **IP:** Shodan InternetDB (ports, noms associats i vulnerabilitats observades) + RDAP (organització responsable del rang). No requereix API key.
- **Domini:** Cloudflare DNS over HTTPS (A, AAAA, MX, NS i TXT) + RDAP (registrador, dates, estat i servidors DNS).
- **Subdominis:** índex públic crt.name, consultat a través de https://proxy.cors.dev perquè crt.name no permet peticions directes des del navegador (CORS). No requereix API key ni registre. L'índex pot contenir noms històrics que ja no estan actius.
- **Username:** perfil públic de GitHub. Sense token, subjecte als límits públics de l'API.

## Com s'interpreten els resultats
- Els resultats es resumeixen amb etiquetes clares i context per evitar confondre dades tècniques amb conclusions.
- Els ports i vulnerabilitats de Shodan són observacions de l'índex, no una auditoria ni un escaneig en directe.
- RDAP identifica l'organització que gestiona un rang d'IP; no identifica necessàriament la persona que l'està fent servir.
- Un registre DNS absent no demostra que un servei no existeixi.
- Els subdominis de crt.name són noms recollits per l'índex; cal comprovar-ne la resolució abans de considerar-los actius.
- La validació telefònica no revela el titular ni confirma que la línia estigui activa.
- GitHub només comprova l'existència d'un perfil a GitHub, no a altres xarxes.

## Limitacions i privacitat
- Les consultes es fan des del navegador a proveïdors externs. En el cas de subdominis, la consulta també passa per un proxy CORS públic sense clau; aquest servei pot veure el domini consultat.
- Els serveis externs poden limitar consultes, canviar o deixar de respondre. Si el proxy públic no està disponible, la resta de funcions continuen funcionant.
- No introdueixis dades sensibles ni facis consultes sobre persones sense una base legítima i autorització.
- L'historial es desa només al localStorage del navegador i es pot esborrar des de l'aplicació.
