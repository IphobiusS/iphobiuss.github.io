#!/usr/bin/env python3
"""Check the new map against existing guide evidence without exposing secrets."""
from pathlib import Path
import hashlib
import json
import re
from lxml import html

ROOT = Path(__file__).resolve().parents[1]


def normalized(value):
    return re.sub(r"\s+", " ", value).strip()


def check_sources():
    graphs = json.loads((ROOT / "content/attack-graphs.json").read_text())
    guides = {name: html.parse(str(ROOT / f"content/guides/{name}.html")) for name in graphs}
    checks = []

    def check(name, condition):
        checks.append({"name": name, "passed": bool(condition)})
        assert condition, name

    cap = guides["cap"]
    table = cap.xpath('//*[@id="idor"]//table')[0]
    captures = {row.xpath('./td')[0].text_content().strip(): normalized(row.text_content()) for row in table.xpath('./tr[td]')}
    check("Own and distinct capture claims match the original guide table", "/data/1" in captures and "0 paquetes" in captures["/data/1"] and "Tu scan" in captures["/data/1"] and "/data/0" in captures and "72 paquetes" in captures["/data/0"] and "NO generaste" in captures["/data/0"])
    pcap = normalized(cap.xpath('//*[@id="pcap"]')[0].text_content())
    check("FTP authentication fields are documented", "Request: USER" in pcap and "Request: PASS" in pcap)
    access = normalized(cap.xpath('//*[@id="access"]')[0].text_content())
    check("SSH identity appears in its own access section", "ssh nathan@" in access)
    privesc = normalized(cap.xpath('//*[@id="privesc"]')[0].text_content())
    check("Capability, interpreter and UID confirmation are documented", "/usr/bin/python3.8" in privesc and "cap_setuid" in privesc and "uid=0(root)" in privesc)
    check("Cap distinguishes credential reading from SSH authentication", [edge['from'] for edge in graphs['cap']['edges']] == ['own-capture', 'other-capture', 'ftp-credentials', 'ssh-nathan'] and 'por sí solo no prueba ese acceso' in graphs['cap']['nodes'][3]['text'])

    forest = guides["forest"]
    source_path = forest.xpath('//*[@id="bloodhound"]//div[contains(concat(" ", normalize-space(@class), " "), " path ")]')[0]
    guide_nodes = [normalized(node.text_content()) for node in source_path.xpath('./span[@class="node"]')]
    guide_edges = [normalized(node.text_content()).replace('─', '').replace('→', '') for node in source_path.xpath('./span[@class="rel"]')]
    new_nodes = [' '.join(node['lines']).replace(' Objeto de dominio', '') for node in graphs['forest']['nodes']]
    new_edges = [edge['label'] for edge in graphs['forest']['edges']]
    check("Forest node order matches the original documented permission path", [name.lower() for name in new_nodes] == [name.lower() for name in guide_nodes])
    check("Forest relation types match the original guide", new_edges == guide_edges == ['MemberOf', 'MemberOf', 'MemberOf', 'GenericAll', 'WriteDacl'])
    section = normalized(forest.xpath('//*[@id="privesc"]')[0].text_content())
    check("Granting replication is a separate step in the guide", "Add-DomainGroupMember" in section and "Get-DomainGroupMember" in section and "Add-DomainObjectAcl" in section and "-Rights DCSync" in section)
    check("Administrator result and membership limit match the guide", "Acceso como Administrator documentado" in section and "DCSync no demuestra por sí solo membresía en Domain Admins" in section and "DCSync no equivale a pertenecer a Domain Admins" in graphs['forest']['result'])
    for guide, graph in graphs.items():
        anchor_ids = set(guides[guide].xpath('//*[@id]/@id'))
        links = [link['url'] for node in graph['nodes'] for link in node['evidence']]
        check(f"Every {guide} map reference names an existing original guide section", all(url.startswith(guide + '.html#') and url.split('#', 1)[1] in anchor_ids for url in links))
        rendered = (ROOT / f"dist/{guide}-caso.html").read_text()
        check(f"Every {guide} rendered text and limit come from its map source", all(node['text'] in rendered for node in graph['nodes']) and graph['limit'] in rendered)
        original_pre = [normalized(pre.text_content()) for pre in guides[guide].xpath('//pre') if 'PASS ' in pre.text_content() or 'DefaultPassword' in pre.text_content() or '$krb5' in pre.text_content() or 'Administrator:500:' in pre.text_content()]
        check(f"The {guide} map omits secret-bearing original transcript blocks", not any(block in json.dumps(graph, ensure_ascii=False) for block in original_pre if len(block) > 30))

    files = [ROOT / 'content/attack-graphs.json', ROOT / 'scripts/site_evolution.py'] + [ROOT / f'content/guides/{name}.html' for name in graphs]
    return {'summary': {'total': len(checks), 'passed': sum(check['passed'] for check in checks)}, 'checks': checks, 'sourceSha256': {str(file.relative_to(ROOT)): hashlib.sha256(file.read_bytes()).hexdigest() for file in files}}


if __name__ == '__main__':
    print(json.dumps(check_sources(), ensure_ascii=False, indent=2))
