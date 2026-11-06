"""Generate the publication figures for the AaharIQ manuscript.

All figures are drawn from code and, for Figures 3-4, from the reproducible
benchmark output in benchmark-results.json. No AI-generated imagery is used.
"""
from __future__ import annotations

import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Polygon
import numpy as np

HERE = Path(__file__).resolve().parent
OUT = HERE

NAVY = "#1F3864"
TEAL = "#2E7D7B"
AMBER = "#B7791F"
RED = "#A93226"
GREEN = "#2F6B4F"
GRAY = "#5B6573"
LIGHT = "#F2F5F9"
LIGHT_TEAL = "#E6F2F1"
LIGHT_AMBER = "#FBF3E2"
LIGHT_RED = "#F8E9E7"
LIGHT_GREEN = "#E8F1EC"
WHITE = "#FFFFFF"

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 9,
    "axes.edgecolor": "#B8C0CC",
    "axes.linewidth": 0.8,
    "savefig.facecolor": WHITE,
    "figure.facecolor": WHITE,
})


def box(ax, x, y, w, h, text, fc=LIGHT, ec=NAVY, fs=9, weight="normal", lw=1.1):
    patch = FancyBboxPatch(
        (x, y), w, h,
        boxstyle="round,pad=0.008,rounding_size=0.012",
        linewidth=lw, edgecolor=ec, facecolor=fc, zorder=2,
    )
    ax.add_patch(patch)
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center",
            fontsize=fs, color="#1A1A1A", weight=weight, zorder=3, linespacing=1.25)
    return patch


def arrow(ax, xy1, xy2, color=NAVY, style="-|>", lw=1.3, ls="-", rad=0.0, zorder=1):
    arr = FancyArrowPatch(
        xy1, xy2, arrowstyle=style, mutation_scale=12,
        linewidth=lw, color=color, linestyle=ls, zorder=zorder,
        connectionstyle=f"arc3,rad={rad}", shrinkA=2, shrinkB=2,
    )
    ax.add_patch(arr)


def diamond(ax, cx, cy, w, h, text, fc=LIGHT_AMBER, ec=AMBER, fs=8.5):
    pts = [(cx, cy + h / 2), (cx + w / 2, cy), (cx, cy - h / 2), (cx - w / 2, cy)]
    ax.add_patch(Polygon(pts, closed=True, facecolor=fc, edgecolor=ec, linewidth=1.0, zorder=2))
    ax.text(cx, cy, text, ha="center", va="center", fontsize=fs, color="#1A1A1A",
            zorder=3, linespacing=1.15)


def save(fig, name):
    path = OUT / name
    fig.savefig(path, dpi=300, bbox_inches="tight", pad_inches=0.06)
    plt.close(fig)
    print("wrote", path)


# ---------------------------------------------------------------------------
# Figure 1: architecture
# ---------------------------------------------------------------------------
def figure_architecture():
    # Drawn at approximately the final print width (16 cm) so that 7 pt
    # labels remain 7 pt in the PDF rather than being photo-reduced.
    fig, ax = plt.subplots(figsize=(6.4, 4.4))
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    ax.text(0.012, 0.975, "A. Deterministic evaluation path",
            fontsize=8.4, weight="bold", color=NAVY, ha="left", va="top")
    ax.text(0.012, 0.935,
            "Pure functions over declared values, evidence descriptors and a versioned registry.",
            fontsize=6.5, color=GRAY, ha="left", va="top")

    y = 0.66
    h = 0.20
    w = 0.178
    xs = [0.012, 0.198, 0.384, 0.570, 0.756]
    labels = [
        "Declared label\n+ evidence\n(value, basis, hash)",
        "Layer 1\nIntegrity audit",
        "Evidence &\nbasis gate",
        "Layer 2\nStandards\nregistry",
        "Layer 3\nEvaluability\n& decision",
    ]
    colors = [LIGHT, LIGHT_TEAL, LIGHT_AMBER, LIGHT, LIGHT_TEAL]
    edges = [NAVY, TEAL, AMBER, NAVY, TEAL]
    for x, lab, fc, ec in zip(xs, labels, colors, edges):
        box(ax, x, y, w, h, lab, fc=fc, ec=ec, fs=6.4)

    for i in range(4):
        arrow(ax, (xs[i] + w + 0.003, y + h / 2),
              (xs[i + 1] - 0.003, y + h / 2), lw=1.0)

    # Withholding branch from the evidence gate.
    box(ax, 0.315, 0.435, 0.155, 0.115,
        "Withhold grade\nNOT_EVALUABLE", fc=LIGHT_RED, ec=RED, fs=6.3)
    arrow(ax, (0.470, y - 0.004), (0.448, 0.552), color=RED, lw=0.9,
          ls=(0, (3, 2)))
    ax.text(0.475, 0.590, "gate fails", fontsize=5.8, color=RED,
            ha="left", va="bottom")

    # Outputs from Layer 3.
    out_y = 0.435
    out_w = 0.135
    out_h = 0.115
    outs = [
        (0.545, "Grade +\nreasons"),
        (0.690, "Persona\nverdicts"),
        (0.835, "Claims &\nswaps"),
    ]
    for x, lab in outs:
        box(ax, x, out_y, out_w, out_h, lab, fc=LIGHT_GREEN, ec=GREEN, fs=6.3)
        arrow(ax, (0.845, y - 0.004), (x + out_w / 2, out_y + out_h + 0.004),
              color=GREEN, lw=0.8)

    # Ingestion governance band.
    ax.add_patch(FancyBboxPatch(
        (0.012, 0.050), 0.725, 0.235,
        boxstyle="round,pad=0.004,rounding_size=0.008",
        linewidth=0.7, edgecolor="#C9D0DA", facecolor="#FAFBFC",
        linestyle=(0, (4, 3)), zorder=0,
    ))
    ax.text(0.012, 0.370,
            "B. Ingestion governance (outside the decision path)",
            fontsize=8.0, weight="bold", color=NAVY, ha="left", va="top")
    ax.text(0.012, 0.325,
            "A transcription is not an artefact. Community data remains grade-ineligible until reviewed.",
            fontsize=6.3, color=GRAY, ha="left", va="top")

    box(ax, 0.025, 0.095, 0.195, 0.150,
        "Crowdsourced OCR\nunverified text\n(never graded)",
        fc=LIGHT_RED, ec=RED, fs=6.2)
    box(ax, 0.250, 0.095, 0.195, 0.150,
        "Human review\nverified pack\nartefact",
        fc=LIGHT_AMBER, ec=AMBER, fs=6.2)
    box(ax, 0.475, 0.095, 0.195, 0.150,
        "Per-field verified\nevidence\n(not a score)",
        fc=LIGHT_GREEN, ec=GREEN, fs=6.2)
    arrow(ax, (0.221, 0.170), (0.248, 0.170), color=RED, lw=0.9)
    arrow(ax, (0.446, 0.170), (0.473, 0.170), color=AMBER, lw=0.9)

    ax.text(0.755, 0.170,
            "Decision path:\nsolid arrows only.\nNo LLM. No network call.",
            fontsize=6.2, color=GRAY, ha="left", va="center", linespacing=1.4)

    save(fig, "fig1_architecture.png")


# ---------------------------------------------------------------------------
# Figure 2: evaluability state machine
# ---------------------------------------------------------------------------
def figure_evaluability():
    fig, ax = plt.subplots(figsize=(7.2, 6.4))
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")

    cx = 0.36
    title_y = 0.965
    ax.text(0.02, title_y, "Evaluability precedence", fontsize=11.5, weight="bold", color=NAVY)
    ax.text(0.02, 0.930,
            "Basis mismatch and physical corruption outrank completeness; completeness outranks provenance.",
            fontsize=7.8, color=GRAY)

    box(ax, cx - 0.130, 0.842, 0.260, 0.060,
        "Input label record\n(values + per-field evidence + basis)",
        fc=LIGHT, ec=NAVY, fs=7.9)

    # 1. Basis mismatch
    diamond(ax, cx, 0.765, 0.285, 0.080, "Basis mismatch\nin any field?")
    box(ax, 0.690, 0.725, 0.275, 0.062, "BASIS_MISMATCH\nno grade", fc=LIGHT_RED, ec=RED, fs=7.6)
    arrow(ax, (cx, 0.842), (cx, 0.805), color=NAVY)
    arrow(ax, (cx + 0.1425, 0.765), (0.688, 0.756), color=RED)
    ax.text(0.560, 0.780, "yes", fontsize=7.2, color=RED, ha="center")

    # 2. Physical corruption
    diamond(ax, cx, 0.665, 0.285, 0.080, "Physical audit\nCORRUPT?")
    box(ax, 0.690, 0.625, 0.275, 0.062, "NOT_EVALUABLE\nno grade", fc=LIGHT_RED, ec=RED, fs=7.6)
    arrow(ax, (cx, 0.725), (cx, 0.705), color=NAVY)
    ax.text(cx + 0.010, 0.714, "no", fontsize=7.0, color=GRAY, ha="left")
    arrow(ax, (cx + 0.1425, 0.665), (0.688, 0.656), color=RED)
    ax.text(0.560, 0.680, "yes", fontsize=7.2, color=RED, ha="center")

    # 3. Completeness
    diamond(ax, cx, 0.565, 0.285, 0.080, "Complete for\nevaluation?")
    arrow(ax, (cx, 0.625), (cx, 0.605), color=NAVY)
    ax.text(cx + 0.010, 0.614, "no", fontsize=7.0, color=GRAY, ha="left")

    # Completeness failure splits into two parallel causes.
    box(ax, 0.560, 0.490, 0.220, 0.065,
        "Completeness failure", fc="#F7F8FA", ec=GRAY, fs=7.5)
    arrow(ax, (cx + 0.1425, 0.565), (0.558, 0.535), color=AMBER)
    ax.text(0.515, 0.545, "no", fontsize=7.2, color=AMBER, ha="center")
    box(ax, 0.560, 0.375, 0.205, 0.065,
        "SOURCE_UNVERIFIED\nunsupported / no evidence", fc=LIGHT_AMBER, ec=AMBER, fs=7.2)
    box(ax, 0.785, 0.375, 0.200, 0.065,
        "LABEL_INCOMPLETE\nrequired field missing", fc=LIGHT_AMBER, ec=AMBER, fs=7.2)
    arrow(ax, (0.645, 0.490), (0.645, 0.442), color=AMBER)
    ax.text(0.652, 0.464, "unsupported", fontsize=6.6, color=AMBER, ha="left")
    arrow(ax, (0.700, 0.490), (0.860, 0.442), color=AMBER)
    ax.text(0.792, 0.472, "missing", fontsize=6.6, color=AMBER, ha="left")

    # 4. Evaluable
    box(ax, cx - 0.1125, 0.445, 0.225, 0.060,
        "EVALUABLE\ncomplete, verified, non-corrupt",
        fc=LIGHT_GREEN, ec=GREEN, fs=7.5)
    arrow(ax, (cx, 0.525), (cx, 0.507), color=GREEN)
    ax.text(cx + 0.010, 0.534, "yes", fontsize=7.0, color=GREEN, ha="left")

    # 5. Minimum assessed nutrients
    diamond(ax, cx, 0.365, 0.245, 0.070, "≥ 3 assessed\nnutrients?")
    arrow(ax, (cx, 0.445), (cx, 0.402), color=GREEN)
    box(ax, cx - 0.1125, 0.225, 0.225, 0.060,
        "Grade\n0 / 1 / ≥2 breaches", fc=LIGHT_GREEN, ec=GREEN, fs=7.6)
    arrow(ax, (cx, 0.3275), (cx, 0.287), color=GREEN)
    ax.text(cx + 0.010, 0.306, "yes", fontsize=7.0, color=GREEN, ha="left")

    box(ax, 0.640, 0.180, 0.245, 0.062,
        "NOT_EVALUABLE\ntoo few assessed nutrients", fc=LIGHT_RED, ec=RED, fs=7.4)
    arrow(ax, (cx + 0.1225, 0.365), (0.638, 0.220), color=RED, rad=0.12)
    ax.text(0.585, 0.320, "no", fontsize=7.2, color=RED, ha="center")

    # Legend
    ax.plot([0.02, 0.05], [0.105, 0.105], color=RED, lw=2.0)
    ax.text(0.058, 0.105, "no grade issued", fontsize=7.0, color=GRAY, va="center")
    ax.plot([0.22, 0.25], [0.105, 0.105], color=GREEN, lw=2.0)
    ax.text(0.258, 0.105, "grade eligible", fontsize=7.0, color=GRAY, va="center")
    ax.plot([0.40, 0.43], [0.105, 0.105], color=AMBER, lw=2.0)
    ax.text(0.438, 0.105, "completeness failure", fontsize=7.0, color=GRAY, va="center")

    save(fig, "fig2_evaluability.png")


# ---------------------------------------------------------------------------
# Figure 3: fault-injection outcomes
# ---------------------------------------------------------------------------
def figure_faults():
    data = json.loads((HERE / "benchmark-results.json").read_text(encoding="utf-8"))
    order = [
        ("Clean label", "clean"),
        ("Energy inflated by 50%", "corrupting"),
        ("Energy deflated by 50%", "corrupting"),
        ("Energy decimal shift (×10)", "corrupting"),
        ("Zero energy with non-zero macros", "corrupting"),
        ("Mass inflation (+40 g carbohydrate)", "corrupting"),
        ("Sodium/salt stoichiometric conflict", "corrupting"),
        ("Added sugar exceeds total sugar", "arithmetic"),
        ("Total sugar exceeds carbohydrate", "arithmetic"),
        ("Saturated fat exceeds total fat", "arithmetic"),
        ("Added sugar field absent", "structural"),
        ("Trans fat field absent", "structural"),
        ("Sodium field absent", "structural"),
        ("Basis mismatch (per-serving evidence)", "structural"),
        ("Unverified evidence", "structural"),
    ]
    n = data["bases"]
    rows = []
    for name, cat in order:
        subset = [c for c in data["cases"] if c["fault"] == name]
        withheld = sum(1 for c in subset if not c["isGraded"])
        warn = sum(1 for c in subset if c["isGraded"] and c["confidence"] != "HIGH")
        high = sum(1 for c in subset if c["isGraded"] and c["confidence"] == "HIGH")
        rows.append((name, cat, withheld, warn, high))

    family_prefix = {
        "clean": "Clean",
        "corrupting": "Corrupting",
        "arithmetic": "Arithmetic",
        "structural": "Structural",
    }
    labels = [
        "Clean control" if r[1] == "clean" else f"{family_prefix[r[1]]}: {r[0]}"
        for r in rows
    ]
    withheld = np.array([r[2] for r in rows])
    warn = np.array([r[3] for r in rows])
    high = np.array([r[4] for r in rows])

    fig, ax = plt.subplots(figsize=(7.2, 6.8))
    y = np.arange(len(rows))[::-1]
    bar_h = 0.62

    ax.barh(y, withheld, height=bar_h, color=RED, edgecolor="white", linewidth=0.6,
            label="Grade withheld")
    ax.barh(y, warn, left=withheld, height=bar_h, color=AMBER, edgecolor="white",
            linewidth=0.6, label="Graded, consistency SUSPECT")
    ax.barh(y, high, left=withheld + warn, height=bar_h, color=GREEN, edgecolor="white",
            linewidth=0.6, label="Graded, HIGH confidence")

    for yi, (name, cat, w, a, h) in zip(y, rows):
        if w:
            ax.text(w / 2, yi, str(w), ha="center", va="center", fontsize=7.8,
                    color="white", weight="bold")
        if a:
            ax.text(w + a / 2, yi, str(a), ha="center", va="center", fontsize=7.8,
                    color="white", weight="bold")
        if h:
            ax.text(w + a + h / 2, yi, str(h), ha="center", va="center", fontsize=7.8,
                    color="white", weight="bold")

    # Group separators and family labels.
    group_bounds = []
    for i in range(1, len(rows)):
        if rows[i][1] != rows[i - 1][1]:
            group_bounds.append(i - 0.5)
    for b in group_bounds:
        ax.axhline(b, color="#C9D0DA", linewidth=0.8, zorder=0)

    ax.set_yticks(y)
    ax.set_yticklabels(labels, fontsize=8.3)
    ax.set_xlim(0, n)
    ax.set_xticks(range(0, n + 1))
    ax.set_xlabel(f"Cases per condition (n = {n})", fontsize=9)
    ax.set_title("Outcome of the controlled label-fault injection experiment",
                 fontsize=12, weight="bold", color=NAVY, pad=10)
    ax.legend(loc="lower center", bbox_to_anchor=(0.5, -0.17), ncol=3,
              frameon=False, fontsize=8.3)
    ax.grid(axis="x", color="#E3E7ED", linewidth=0.7, zorder=0)
    ax.set_axisbelow(True)
    for spine in ["top", "right"]:
        ax.spines[spine].set_visible(False)

    save(fig, "fig3_fault_injection.png")


# ---------------------------------------------------------------------------
# Figure 4: latency
# ---------------------------------------------------------------------------
def figure_latency():
    data = json.loads((HERE / "benchmark-results.json").read_text(encoding="utf-8"))
    latency = data["latencies"]
    # Short labels for the figure.
    short = [
        "Layer 1 audit\n(single label)",
        "Full evaluation\n(single label)",
        "Full evaluation\n(13-label batch)",
        "Ranking\n(1,000 candidates)",
    ]
    p50 = [x["p50_us"] for x in latency]
    p95 = [x["p95_us"] for x in latency]
    p99 = [x["p99_us"] for x in latency]

    fig, ax = plt.subplots(figsize=(7.2, 4.0))
    y = np.arange(len(short))[::-1]
    h = 0.24
    ax.barh(y + h, p50, height=h, color=NAVY, label="p50", edgecolor="white")
    ax.barh(y, p95, height=h, color=TEAL, label="p95", edgecolor="white")
    ax.barh(y - h, p99, height=h, color=AMBER, label="p99", edgecolor="white")

    for yi, a, b, c in zip(y, p50, p95, p99):
        ax.text(a * 1.10, yi + h, f"{a:,.0f}", va="center", fontsize=7.4, color=NAVY)
        ax.text(b * 1.10, yi, f"{b:,.0f}", va="center", fontsize=7.4, color=TEAL)
        ax.text(c * 1.10, yi - h, f"{c:,.0f}", va="center", fontsize=7.4, color=AMBER)

    ax.set_xscale("log")
    ax.set_xlim(1, 200_000)
    ax.set_yticks(y)
    ax.set_yticklabels(short, fontsize=8.6)
    ax.set_xlabel("Latency per operation (microseconds, log scale)", fontsize=9)
    ax.set_title("Deterministic evaluation latency on a commodity laptop",
                 fontsize=12, weight="bold", color=NAVY, pad=10)
    ax.legend(loc="lower right", frameon=False, ncol=3, fontsize=8.4)
    ax.grid(axis="x", color="#E3E7ED", linewidth=0.7)
    ax.set_axisbelow(True)
    for spine in ["top", "right"]:
        ax.spines[spine].set_visible(False)
    ax.text(0.0, -0.24,
            "Values are medians of three internal trials; 20,000 / 10,000 / 500 / 500 iterations respectively. "
            "No network or database call is included.",
            transform=ax.transAxes, fontsize=7.2, color=GRAY)

    save(fig, "fig4_latency.png")


if __name__ == "__main__":
    figure_architecture()
    figure_evaluability()
    figure_faults()
    figure_latency()
