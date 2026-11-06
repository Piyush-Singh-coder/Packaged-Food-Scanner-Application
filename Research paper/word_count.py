import re

t = open("AaharIQ_manuscript.md", encoding="utf-8").read()
body = t.split("## 1. Introduction", 1)[1].split("## Declarations", 1)[0]
plain = re.sub(r"`[^`]*`", " ", body)
plain = re.sub(r"\[@[^\]]+\]", " ", plain)
plain = re.sub(r"\\\([^)]*\\\)", " ", plain)
plain = re.sub(r"^#+ .*$", " ", plain, flags=re.M)
plain = re.sub(r"[*_>#|]", " ", plain)
words = re.findall(r"\b[\w’'-]+\b", plain)
print("main text words:", len(words))
abs_t = t.split("## Abstract", 1)[1].split("## Highlights", 1)[0]
print("abstract words:", len(re.findall(r"\b[\w’'-]+\b", abs_t)))
