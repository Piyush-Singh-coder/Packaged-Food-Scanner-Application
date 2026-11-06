import re

t = open("AaharIQ_manuscript.md", encoding="utf-8").read()
body, refs = t.split("## References", 1)
refs = refs.split("## Appendix A", 1)[0]
keys = dict(re.findall(r"^- \*\*(.+?)\*\* — (.*)$", refs, flags=re.M))
cites = []
for m in re.finditer(r"\[@([^\]]+)\]", body):
    for k in m.group(1).split(";"):
        k = k.strip().lstrip("@")
        if k not in cites:
            cites.append(k)
print("refs", len(keys), "cited", len(cites))
print("uncited:", [k for k in keys if k not in cites])
print("missing:", [k for k in cites if k not in keys])
print("order:", cites)
