import re
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

text = open("AaharIQ_manuscript.md", encoding="utf-8").read()
blocks = re.findall(r"^\\\[$\n(.*?)^\\\]$", text, flags=re.S | re.M)
print(f"found {len(blocks)} display equations")
bad = []
for i, b in enumerate(blocks, 1):
    eq = b.strip()
    if eq.endswith(","):
        eq = eq[:-1]
    if eq.endswith("."):
        eq = eq[:-1]
    try:
        fig = plt.figure(figsize=(0.01, 0.01))
        fig.text(0, 0, f"${eq}$", fontsize=12)
        fig.canvas.draw()
        plt.close(fig)
        print(f"OK   {i}: {eq[:80]}")
    except Exception as e:
        bad.append((i, eq, str(e)))
        print(f"FAIL {i}: {eq[:80]}\n     {type(e).__name__}: {e}")
        plt.close("all")
print(f"\n{len(blocks)-len(bad)}/{len(blocks)} rendered")
