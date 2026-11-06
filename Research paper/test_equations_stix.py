import re
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

matplotlib.rcParams["mathtext.fontset"] = "stix"
matplotlib.rcParams["font.family"] = "STIXGeneral"

text = open("AaharIQ_manuscript.md", encoding="utf-8").read()
blocks = re.findall(r"^\\\[$\n(.*?)^\\\]$", text, flags=re.S | re.M)
bad = []
for i, b in enumerate(blocks, 1):
    eq = b.strip().rstrip(".,")
    try:
        fig = plt.figure(figsize=(0.01, 0.01))
        fig.text(0, 0, f"${eq}$", fontsize=11)
        fig.canvas.draw()
        plt.close(fig)
    except Exception as e:
        bad.append((i, eq, str(e)))
        print(f"FAIL {i}: {e}")
        plt.close("all")
print(f"{len(blocks)-len(bad)}/{len(blocks)} rendered with STIX")
