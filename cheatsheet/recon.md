# Recon & Enumeración

[⬅ Volver al índice](../CHEATSHEET.md) · [Versión web](https://iphobiuss.github.io)

> [!WARNING]
> **Solo entornos autorizados.** Contenido educativo y de referencia, con placeholders genéricos (`corp.local`, `$DC_IP`). No reproduce hosts, flags ni cadenas de ningún examen. Aplicar estas técnicas sin permiso por escrito es ilegal.

## Teoría

El reconocimiento es la fase más determinante de un pentest: la mayoría de los compromisos no salen de un exploit espectacular, sino de haber enumerado a fondo hasta encontrar la puerta que alguien dejó abierta. La regla práctica es que **la enumeración nunca termina** — cada servicio, credencial o ruta nueva reinicia el ciclo con más contexto.

Se distingue entre reconocimiento **pasivo** (sin tocar el objetivo: DNS público, OSINT) y **activo** (escaneo de puertos, fuzzing, consultas a servicios). En un examen o engagement interno el foco es el activo: identificar qué corre en cada host, en qué versión y qué expone. El objetivo no es "encontrar el exploit" sino construir un mapa completo de la superficie antes de tocar nada.

## Herramientas del área

### nmap

**Qué hace** · Escáner de puertos y servicios; el primer barrido de todo host.  

**Cuándo se usa** · Al empezar cualquier objetivo, para saber qué corre y por dónde entrar.

```bash
nmap -sC -sV -p- --min-rate 5000 $TARGET -oN full.txt
```
📖 [Documentación](https://nmap.org)

### ffuf / wfuzz

**Qué hace** · Fuzzers HTTP rápidos para directorios, parámetros y virtual hosts.  

**Cuándo se usa** · Descubrir rutas ocultas, forzar tokens débiles o enumerar vhosts.

```bash
ffuf -u http://$TARGET/FUZZ -w wordlist.txt -fc 404
```
📖 [Documentación](https://github.com/ffuf/ffuf)

### wpscan

**Qué hace** · Escáner específico de WordPress: usuarios, plugins y temas vulnerables.  

**Cuándo se usa** · Cuando el objetivo corre WordPress y buscas un punto de entrada.

```bash
wpscan --url http://$TARGET -e ap,at,u
```
📖 [Documentación](https://github.com/wpscanteam/wpscan)

### smbmap / nxc

**Qué hace** · NetExec (nxc) habla SMB, LDAP, WinRM y MSSQL desde una sola herramienta; smbmap lista shares.  

**Cuándo se usa** · Enumerar recursos, validar credenciales en masa y ejecutar en toda una red.

```bash
nxc smb $IP/24 -u $USER -p $PASS --shares
```
📖 [Documentación](https://github.com/Pennyw0rth/NetExec)

### BloodHound

**Qué hace** · Grafica AD y revela rutas de privilegio entre usuarios, grupos y hosts.  

**Cuándo se usa** · Tras conseguir cualquier credencial de dominio, para planear la escalada.

```bash
bloodhound-python -u $USER -p $PASS -d $DOMAIN -ns $DC_IP -c All --zip
```
📖 [Documentación](https://github.com/SpecterOps/BloodHound)

## Comandos por objetivo

### Reconocimiento & escaneo

```bash
# interfaces y direccionamiento local
ip -br a
# escaneo completo de puertos + versiones + scripts
nmap -sC -sV -p- --min-rate 5000 $TARGET -oN nmap.txt
# transferencia de zona DNS
dig AXFR $DOMAIN @$IP
# fuzzing de virtual hosts por cabecera Host
ffuf -w subdomains.txt -H "Host: FUZZ.$DOMAIN" -u http://$IP -fs <baseline>
# WordPress: usuarios y plugins vulnerables
wpscan --url http://$TARGET -e ap,at,u --api-token <TOKEN>
```
