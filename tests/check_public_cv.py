"""Reject direct contact details and active payloads in the public CV."""
import json
import re
from pathlib import Path

from pypdf import PdfReader
from pypdf.generic import ByteStringObject, IndirectObject, StreamObject

ROOT = Path(__file__).resolve().parents[1]
CONTACT = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?<!\w)\+\d{1,3}(?:[\s().-]*\d){7,14}(?!\d)|(?:mailto|tel|sms):", re.I)


def check(path):
    reader = PdfReader(path)
    texts = [page.extract_text() or "" for page in reader.pages]
    assert len(texts) == 2 and all(len(text) > 500 for text in texts), "CV must retain searchable content"
    assert "Santiago, Chile" in texts[0], "Location line must remain legible"
    seen = set()
    strings = list(texts)

    def visit(value):
        if isinstance(value, IndirectObject):
            key = (value.idnum, value.generation)
            if key in seen:
                return
            seen.add(key)
            value = value.get_object()
        if isinstance(value, str):
            strings.append(value)
        elif isinstance(value, (bytes, ByteStringObject)):
            strings.extend(bytes(value).decode(encoding, errors="ignore") for encoding in ("utf-8", "utf-16-be", "utf-16-le"))
        elif isinstance(value, dict):
            assert not any(key in value for key in ("/JavaScript", "/EmbeddedFiles")), "Unexpected active or attached payload"
            assert value.get("/S") not in ("/JavaScript", "/Launch", "/SubmitForm", "/ImportData"), "Unexpected active action"
            for child in value.values():
                visit(child)
            if isinstance(value, StreamObject) and value.get("/Type") in ("/Metadata", "/EmbeddedFile"):
                visit(value.get_data())
        elif isinstance(value, (list, tuple)):
            for child in value:
                visit(child)

    visit(reader.trailer)
    assert not any(CONTACT.search(text) for text in strings), "Public CV contains direct contact details"
    links = [annotation.get_object().get("/A", {}).get("/URI", "") for page in reader.pages for annotation in page.get("/Annots", [])]
    assert len([uri for uri in links if str(uri).startswith("https://")]) >= 10, "Professional and credential links must remain available"
    return {"pages": len(texts), "direct_contact_details": 0, "professional_links": len(links)}


if __name__ == "__main__":
    source = ROOT / "content/public/downloads/cv-sebastian-latorre.pdf"
    published = ROOT / "dist/downloads/cv-sebastian-latorre.pdf"
    result = check(source)
    assert published.read_bytes() == source.read_bytes(), "Published CV differs from its approved source"
    print(json.dumps({"public_cv": "passed", **result}))
