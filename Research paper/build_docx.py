#!/usr/bin/env python3
"""Build a publication-ready DOCX from AaharIQ_manuscript.md.

The Markdown source is the single source of truth. This script adds the
typographic layer: A4 layout, Times New Roman body text, numbered citations,
booktabs-style tables, rendered display equations, figure captions, running
headers, and page numbers.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image
from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

BASE = Path(__file__).resolve().parent
SOURCE = BASE / "AaharIQ_manuscript.md"
OUTPUT = BASE / "AaharIQ_Research_Paper.docx"
EQUATION_DIR = BASE / "equation_images"

BODY_FONT = "Times New Roman"
CODE_FONT = "Consolas"
PAGE_WIDTH_CM = 16.0

matplotlib.rcParams["mathtext.fontset"] = "stix"
matplotlib.rcParams["font.family"] = "STIXGeneral"


# ---------------------------------------------------------------------------
# Small XML helpers
# ---------------------------------------------------------------------------


def _set_run_font(run, name: str) -> None:
    run.font.name = name
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.find(qn("w:rFonts"))
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.append(rfonts)
    for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
        rfonts.set(qn(attr), name)


def _set_paragraph_border(paragraph, edge: str = "bottom", sz: int = 6,
                          color: str = "808080", space: int = 4) -> None:
    ppr = paragraph._p.get_or_add_pPr()
    pbdr = ppr.find(qn("w:pBdr"))
    if pbdr is None:
        pbdr = OxmlElement("w:pBdr")
        ppr.append(pbdr)
    el = OxmlElement(f"w:{edge}")
    el.set(qn("w:val"), "single")
    el.set(qn("w:sz"), str(sz))
    el.set(qn("w:space"), str(space))
    el.set(qn("w:color"), color)
    pbdr.append(el)


def _set_cell_bottom_border(cell, sz: int = 8) -> None:
    tcpr = cell._tc.get_or_add_tcPr()
    borders = tcpr.find(qn("w:tcBorders"))
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tcpr.append(borders)
    bottom = OxmlElement("w:bottom")
    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), str(sz))
    bottom.set(qn("w:space"), "0")
    bottom.set(qn("w:color"), "000000")
    borders.append(bottom)


def _set_table_borders(table) -> None:
    tbl = table._tbl
    tblpr = tbl.tblPr
    existing = tblpr.find(qn("w:tblBorders"))
    if existing is not None:
        tblpr.remove(existing)
    borders = OxmlElement("w:tblBorders")
    specs = {
        "top": (12, "000000"),
        "left": (0, "000000"),
        "bottom": (12, "000000"),
        "right": (0, "000000"),
        "insideH": (4, "BFBFBF"),
        "insideV": (0, "000000"),
    }
    for edge, (sz, color) in specs.items():
        el = OxmlElement(f"w:{edge}")
        if sz == 0:
            el.set(qn("w:val"), "nil")
        else:
            el.set(qn("w:val"), "single")
            el.set(qn("w:sz"), str(sz))
            el.set(qn("w:space"), "0")
            el.set(qn("w:color"), color)
        borders.append(el)
    lookup = tblpr.find(qn("w:tblLook"))
    if lookup is not None:
        lookup.addprevious(borders)
    else:
        tblpr.append(borders)


def _set_table_cell_margins(table, top: int = 30, bottom: int = 30,
                            left: int = 70, right: int = 70) -> None:
    tblpr = table._tbl.tblPr
    existing = tblpr.find(qn("w:tblCellMar"))
    if existing is not None:
        tblpr.remove(existing)
    mar = OxmlElement("w:tblCellMar")
    for edge, value in (("top", top), ("left", left),
                        ("bottom", bottom), ("right", right)):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:w"), str(value))
        el.set(qn("w:type"), "dxa")
        mar.append(el)
    lookup = tblpr.find(qn("w:tblLook"))
    if lookup is not None:
        lookup.addprevious(mar)
    else:
        tblpr.append(mar)


def _set_table_fixed(table, widths_cm: list[float]) -> None:
    table.autofit = False
    table.allow_autofit = False
    tblpr = table._tbl.tblPr
    tblw = OxmlElement("w:tblW")
    tblw.set(qn("w:w"), str(int(sum(widths_cm) * 567)))
    tblw.set(qn("w:type"), "dxa")
    existing = tblpr.find(qn("w:tblW"))
    if existing is not None:
        tblpr.remove(existing)
    tblpr.append(tblw)
    layout = OxmlElement("w:tblLayout")
    layout.set(qn("w:type"), "fixed")
    tblpr.append(layout)
    for row in table.rows:
        for idx, width in enumerate(widths_cm):
            row.cells[idx].width = Cm(width)
    # Keep the grid in sync so Word does not re-autofit.
    grid = table._tbl.tblGrid
    for idx, col in enumerate(grid.gridCol_lst):
        if idx < len(widths_cm):
            col.w = Cm(widths_cm[idx])


def _set_repeat_header(row) -> None:
    trpr = row._tr.get_or_add_trPr()
    header = OxmlElement("w:tblHeader")
    header.set(qn("w:val"), "true")
    trpr.append(header)


def _set_cant_split(row) -> None:
    trpr = row._tr.get_or_add_trPr()
    trpr.append(OxmlElement("w:cantSplit"))


def _add_field(paragraph, instruction: str) -> None:
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    run._r.append(begin)

    run = paragraph.add_run()
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = instruction
    run._r.append(instr)

    run = paragraph.add_run()
    sep = OxmlElement("w:fldChar")
    sep.set(qn("w:fldCharType"), "separate")
    run._r.append(sep)

    paragraph.add_run("1")

    run = paragraph.add_run()
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.append(end)


# ---------------------------------------------------------------------------
# Markdown parsing
# ---------------------------------------------------------------------------


def parse_front_matter(text: str) -> tuple[dict, str]:
    match = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not match:
        return {}, text
    meta: dict[str, str] = {}
    for line in match.group(1).splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        meta[key.strip()] = value.strip().strip('"')
    return meta, text[match.end():]


def citation_keys(text: str) -> list[str]:
    keys: list[str] = []
    for match in re.finditer(r"\[@([^\]]+)\]", text):
        for key in match.group(1).split(";"):
            key = key.strip().lstrip("@")
            if key and key not in keys:
                keys.append(key)
    return keys


def build_citation_map(body: str) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for key in citation_keys(body):
        mapping[key] = len(mapping) + 1
    return mapping


def clean_words(text: str) -> int:
    plain = re.sub(r"`[^`]*`", " ", text)
    plain = re.sub(r"\[@[^\]]+\]", " ", plain)
    plain = re.sub(r"\\\(.*?\\\)", " ", plain, flags=re.S)
    plain = re.sub(r"^#+ .*$", " ", plain, flags=re.M)
    plain = re.sub(r"[*_>#|]", " ", plain)
    return len(re.findall(r"\b[\w’'-]+\b", plain))


# ---------------------------------------------------------------------------
# Inline math
# ---------------------------------------------------------------------------

MATH_SYMBOLS = {
    "times": "×", "cdot": "·", "pm": "±", "mp": "∓",
    "le": "≤", "leq": "≤", "ge": "≥", "geq": "≥",
    "ne": "≠", "neq": "≠", "approx": "≈", "equiv": "≡",
    "rightarrow": "→", "to": "→", "leftarrow": "←",
    "leftrightarrow": "↔", "Rightarrow": "⇒",
    "in": "∈", "notin": "∉", "subset": "⊂", "subseteq": "⊆",
    "land": "∧", "wedge": "∧", "lor": "∨", "vee": "∨", "neg": "¬",
    "sum": "∑", "prod": "∏", "int": "∫", "infty": "∞",
    "partial": "∂", "nabla": "∇", "sqrt": "√",
    "mu": "µ", "nu": "ν", "ell": "ℓ", "Delta": "Δ", "delta": "δ",
    "alpha": "α", "beta": "β", "gamma": "γ", "lambda": "λ",
    "sigma": "σ", "theta": "θ", "pi": "π", "phi": "φ", "omega": "ω",
    "Omega": "Ω", "tau": "τ", "rho": "ρ", "kappa": "κ",
    "quad": " ", "qquad": "  ",
}

MATH_FUNCTIONS = {"max", "min", "log", "ln", "exp", "sin", "cos", "tan",
                  "lim", "sup", "inf", "det", "gcd"}


def _read_group(text: str, pos: int) -> tuple[str, int]:
    """Read a brace-delimited group starting at pos (or one character)."""
    if pos >= len(text):
        return "", pos
    if text[pos] != "{":
        return text[pos], pos + 1
    depth = 0
    start = pos + 1
    i = pos
    while i < len(text):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[start:i], i + 1
        i += 1
    return text[start:], len(text)


def math_runs(latex: str) -> list[dict]:
    """Convert a small LaTeX subset into styled text runs."""
    runs: list[dict] = []

    def emit(text: str, italic: bool = False, sub: bool = False,
             sup: bool = False, bold: bool = False) -> None:
        if not text:
            return
        if (runs and runs[-1]["italic"] == italic and runs[-1]["sub"] == sub
                and runs[-1]["sup"] == sup and runs[-1]["bold"] == bold):
            runs[-1]["text"] += text
        else:
            runs.append({"text": text, "italic": italic, "sub": sub,
                         "sup": sup, "bold": bold})

    def parse(text: str, upright: bool = False, sub: bool = False,
              sup: bool = False, bold: bool = False) -> None:
        i = 0
        while i < len(text):
            char = text[i]
            if char == "\\":
                if i + 1 >= len(text):
                    break
                nxt = text[i + 1]
                if nxt == " ":
                    emit(" ", sub=sub, sup=sup)
                    i += 2
                    continue
                if nxt in ",;:!":
                    emit(" " if nxt in ",;:" else "", sub=sub, sup=sup)
                    i += 2
                    continue
                if nxt in "{}%_&#$":
                    emit(nxt, sub=sub, sup=sup, bold=bold)
                    i += 2
                    continue
                match = re.match(r"\\([A-Za-z]+)", text[i:])
                if not match:
                    i += 1
                    continue
                command = match.group(1)
                i += 1 + len(command)
                if command in ("mathrm", "text", "operatorname"):
                    content, i = _read_group(text, i)
                    parse(content, upright=True, sub=sub, sup=sup, bold=bold)
                elif command in ("mathbf", "textbf"):
                    content, i = _read_group(text, i)
                    parse(content, upright=True, sub=sub, sup=sup, bold=True)
                elif command in ("mathit", "textit"):
                    content, i = _read_group(text, i)
                    parse(content, upright=False, sub=sub, sup=sup, bold=bold)
                elif command == "frac":
                    numerator, i = _read_group(text, i)
                    denominator, i = _read_group(text, i)
                    num = re.sub(r"\\[A-Za-z]+", "", numerator)
                    den = re.sub(r"\\[A-Za-z]+", "", denominator)
                    emit(f"{num}/{den}", sub=sub, sup=sup, bold=bold)
                elif command in ("left", "right"):
                    continue
                elif command in MATH_SYMBOLS:
                    emit(MATH_SYMBOLS[command], sub=sub, sup=sup, bold=bold)
                elif command in MATH_FUNCTIONS:
                    emit(command, upright=True, sub=sub, sup=sup, bold=bold)
                else:
                    emit(command, upright=True, sub=sub, sup=sup, bold=bold)
            elif char in "_^":
                sub_flag = char == "_"
                sup_flag = char == "^"
                content, i = _read_group(text, i + 1)
                parse(content, upright=(len(content) > 1 or not content.isalpha()),
                      sub=sub or sub_flag, sup=sup or sup_flag, bold=bold)
            elif char == "{":
                content, i = _read_group(text, i)
                parse(content, upright=upright, sub=sub, sup=sup, bold=bold)
            elif char.isalpha():
                emit(char, italic=not upright, sub=sub, sup=sup, bold=bold)
                i += 1
            else:
                emit(char, sub=sub, sup=sup, bold=bold)
                i += 1

    parse(latex)
    return runs


# ---------------------------------------------------------------------------
# Inline rendering
# ---------------------------------------------------------------------------

INLINE_RE = re.compile(
    r"(\*\*.+?\*\*|\*[^*\n]+?\*|`[^`]+?`|\\\(.+?\\\)|\[@[^\]]+\])",
    re.S,
)


def add_inline(paragraph, text: str, *, bold: bool = False, italic: bool = False,
               size: float | None = None, color: RGBColor | None = None,
               citation_map: dict[str, int] | None = None,
               break_code: bool = False) -> None:
    """Add Markdown inline text (bold, italic, code, math, citations)."""
    pos = 0
    for match in INLINE_RE.finditer(text):
        if match.start() > pos:
            _add_plain(paragraph, text[pos:match.start()], bold, italic,
                       size, color)
        token = match.group(0)
        if token.startswith("**"):
            add_inline(paragraph, token[2:-2], bold=True, italic=italic,
                       size=size, color=color, citation_map=citation_map,
                       break_code=break_code)
        elif token.startswith("*"):
            add_inline(paragraph, token[1:-1], bold=bold, italic=True,
                       size=size, color=color, citation_map=citation_map,
                       break_code=break_code)
        elif token.startswith("`"):
            code_text = token[1:-1]
            if break_code:
                # Allow long enum identifiers to wrap at underscores rather
                # than at an arbitrary character.
                code_text = re.sub(r"_(?=[A-Za-z])", "_\u200b", code_text)
            run = paragraph.add_run(code_text)
            _set_run_font(run, CODE_FONT)
            run.font.size = Pt((size or 11) - 0.6)
            run.bold = bold
            run.italic = italic
            if color is not None:
                run.font.color.rgb = color
        elif token.startswith("\\("):
            for spec in math_runs(token[2:-2]):
                run = paragraph.add_run(spec["text"])
                _set_run_font(run, BODY_FONT)
                run.italic = spec["italic"] or italic
                run.bold = spec["bold"] or bold
                if spec["sub"]:
                    run.font.subscript = True
                if spec["sup"]:
                    run.font.superscript = True
                if size is not None:
                    run.font.size = Pt(size)
                if color is not None:
                    run.font.color.rgb = color
        elif token.startswith("[@"):
            keys = [k.strip().lstrip("@") for k in token[2:-1].split(";")]
            numbers = []
            for key in keys:
                if citation_map and key in citation_map:
                    numbers.append(citation_map[key])
                else:
                    numbers.append(None)
            if any(n is None for n in numbers):
                label = token
            elif len(numbers) >= 3 and numbers == list(range(numbers[0], numbers[0] + len(numbers))):
                label = f"[{numbers[0]}–{numbers[-1]}]"
            else:
                label = "[" + ", ".join(str(n) for n in numbers) + "]"
            _add_plain(paragraph, label, bold, italic, size, color)
        pos = match.end()
    if pos < len(text):
        _add_plain(paragraph, text[pos:], bold, italic, size, color)


def _add_plain(paragraph, text: str, bold: bool, italic: bool,
               size: float | None, color: RGBColor | None) -> None:
    if not text:
        return
    run = paragraph.add_run(text)
    run.bold = bold
    run.italic = italic
    if size is not None:
        run.font.size = Pt(size)
    if color is not None:
        run.font.color.rgb = color


def add_superscript_text(paragraph, text: str, size: float | None = None,
                         bold: bool = False) -> None:
    """Render ^{1} markers used in the author block."""
    pos = 0
    for match in re.finditer(r"\^\{([^}]*)\}|\^(\d)", text):
        if match.start() > pos:
            run = paragraph.add_run(text[pos:match.start()])
            run.bold = bold
            if size:
                run.font.size = Pt(size)
        run = paragraph.add_run(match.group(1) or match.group(2))
        run.font.superscript = True
        run.bold = bold
        if size:
            run.font.size = Pt(size)
        pos = match.end()
    if pos < len(text):
        run = paragraph.add_run(text[pos:])
        run.bold = bold
        if size:
            run.font.size = Pt(size)


# ---------------------------------------------------------------------------
# Document construction
# ---------------------------------------------------------------------------


class PaperBuilder:
    def __init__(self, meta: dict, body: str, citation_map: dict[str, int]):
        self.meta = meta
        self.body = body
        self.citation_map = citation_map
        self.doc = Document()
        self.equation_number = 0
        self.table_count = 0
        self.figure_count = 0
        self._setup_page()
        self._setup_styles()
        self._setup_header_footer()

    # -- setup ------------------------------------------------------------

    def _setup_page(self) -> None:
        section = self.doc.sections[0]
        section.page_width = Cm(21.0)
        section.page_height = Cm(29.7)
        section.top_margin = Cm(2.5)
        section.bottom_margin = Cm(2.5)
        section.left_margin = Cm(2.5)
        section.right_margin = Cm(2.5)
        section.header_distance = Cm(1.25)
        section.footer_distance = Cm(1.25)
        section.different_first_page_header_footer = True

    def _setup_styles(self) -> None:
        styles = self.doc.styles

        normal = styles["Normal"]
        normal.font.name = BODY_FONT
        normal.font.size = Pt(11)
        normal.font.color.rgb = RGBColor(0, 0, 0)
        normal.paragraph_format.line_spacing = 1.15
        normal.paragraph_format.space_after = Pt(6)
        normal.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        normal.paragraph_format.widow_control = True
        rpr = normal.element.get_or_add_rPr()
        rfonts = rpr.find(qn("w:rFonts"))
        if rfonts is None:
            rfonts = OxmlElement("w:rFonts")
            rpr.append(rfonts)
        for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
            rfonts.set(qn(attr), BODY_FONT)

        heading_specs = {
            "Heading 1": (14, True, False, 18, 6),
            "Heading 2": (12, True, False, 12, 4),
            "Heading 3": (11, True, True, 10, 3),
        }
        for name, (size, bold, italic, before, after) in heading_specs.items():
            style = styles[name]
            style.font.name = BODY_FONT
            style.font.size = Pt(size)
            style.font.bold = bold
            style.font.italic = italic
            style.font.color.rgb = RGBColor(0, 0, 0)
            style.paragraph_format.space_before = Pt(before)
            style.paragraph_format.space_after = Pt(after)
            style.paragraph_format.keep_with_next = True
            style.paragraph_format.line_spacing = 1.0
            style.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
            rpr = style.element.get_or_add_rPr()
            rfonts = rpr.find(qn("w:rFonts"))
            if rfonts is None:
                rfonts = OxmlElement("w:rFonts")
                rpr.append(rfonts)
            for attr in ("w:ascii", "w:hAnsi", "w:eastAsia", "w:cs"):
                rfonts.set(qn(attr), BODY_FONT)

    def _setup_header_footer(self) -> None:
        section = self.doc.sections[0]

        header = section.header
        header.is_linked_to_previous = False
        paragraph = header.paragraphs[0]
        paragraph.text = ""
        paragraph.paragraph_format.tab_stops.clear_all()
        paragraph.paragraph_format.tab_stops.add_tab_stop(Cm(PAGE_WIDTH_CM),
                                                          alignment=2)
        run = paragraph.add_run(self.meta.get("short_title", "Manuscript"))
        run.italic = True
        run.font.size = Pt(8.5)
        run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)
        paragraph.add_run("\t")
        run = paragraph.add_run(self.meta.get("article_type", "Manuscript"))
        run.font.size = Pt(8.5)
        run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)
        _set_paragraph_border(paragraph, "bottom", sz=4, color="BFBFBF", space=2)

        footer = section.footer
        footer.is_linked_to_previous = False
        paragraph = footer.paragraphs[0]
        paragraph.text = ""
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = paragraph.add_run("Page ")
        run.font.size = Pt(8.5)
        run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)
        _add_field(paragraph, " PAGE ")
        run = paragraph.add_run(" of ")
        run.font.size = Pt(8.5)
        run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)
        _add_field(paragraph, " NUMPAGES ")

        # Blank first-page header and footer.
        first_header = section.first_page_header
        first_header.is_linked_to_previous = False
        first_header.paragraphs[0].text = ""
        first_footer = section.first_page_footer
        first_footer.is_linked_to_previous = False
        first_footer.paragraphs[0].text = ""

    # -- title page -------------------------------------------------------

    def add_title_page(self, main_words: int, abstract_words: int,
                       n_tables: int, n_figures: int) -> None:
        doc = self.doc
        paragraph = doc.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_before = Pt(90)
        paragraph.paragraph_format.space_after = Pt(10)
        run = paragraph.add_run(self.meta.get("article_type", "Original Research Article").upper())
        run.font.size = Pt(9)
        run.font.bold = True
        run.font.color.rgb = RGBColor(0x44, 0x44, 0x44)
        run.font.small_caps = True

        paragraph = doc.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_before = Pt(10)
        paragraph.paragraph_format.space_after = Pt(8)
        paragraph.paragraph_format.line_spacing = 1.1
        run = paragraph.add_run(self.meta.get("title", "Title"))
        run.font.size = Pt(19)
        run.font.bold = True

        rule = doc.add_paragraph()
        rule.paragraph_format.space_before = Pt(4)
        rule.paragraph_format.space_after = Pt(14)
        _set_paragraph_border(rule, "bottom", sz=8, color="000000", space=1)

        paragraph = doc.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_after = Pt(10)
        add_superscript_text(paragraph, self.meta.get("authors", ""), size=12)

        paragraph = doc.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_after = Pt(18)
        add_superscript_text(paragraph, self.meta.get("affiliations", ""), size=9.5)

        paragraph = doc.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_after = Pt(4)
        run = paragraph.add_run("Corresponding author")
        run.font.size = Pt(8.5)
        run.font.bold = True
        run.font.small_caps = True
        run.font.color.rgb = RGBColor(0x44, 0x44, 0x44)

        paragraph = doc.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_after = Pt(0)
        run = paragraph.add_run(self.meta.get("corresponding", ""))
        run.font.size = Pt(9)

        # Bottom metadata block.
        paragraph = doc.add_paragraph()
        paragraph.paragraph_format.space_before = Pt(210)
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = paragraph.add_run(f"Running title: {self.meta.get('short_title', '')}")
        run.font.size = Pt(9)
        run.font.italic = True

        paragraph = doc.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_after = Pt(0)
        run = paragraph.add_run(
            f"Main text: {main_words:,} words  ·  Abstract: {abstract_words} words  ·  "
            f"{n_tables} tables  ·  {n_figures} figures"
        )
        run.font.size = Pt(8.5)
        run.font.color.rgb = RGBColor(0x44, 0x44, 0x44)

        paragraph = doc.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = paragraph.add_run("Prepared November 2026")
        run.font.size = Pt(8.5)
        run.font.color.rgb = RGBColor(0x44, 0x44, 0x44)

    # -- block helpers ----------------------------------------------------

    def add_heading(self, text: str, level: int, page_break: bool = False) -> None:
        style = {1: "Heading 1", 2: "Heading 2", 3: "Heading 3"}[level]
        paragraph = self.doc.add_paragraph(style=style)
        if page_break:
            paragraph.paragraph_format.page_break_before = True
        add_inline(paragraph, text, bold=True, citation_map=self.citation_map)

    def add_body(self, text: str, *, size: float = 11, first: bool = False,
                 compact: bool = False) -> None:
        paragraph = self.doc.add_paragraph()
        code_spans = re.findall(r"`([^`]+)`", text)
        code_heavy = len(code_spans) >= 3 or any(len(c) > 24 for c in code_spans)
        paragraph.paragraph_format.alignment = (
            WD_ALIGN_PARAGRAPH.LEFT if code_heavy else WD_ALIGN_PARAGRAPH.JUSTIFY
        )
        paragraph.paragraph_format.space_after = Pt(3 if compact else 6)
        paragraph.paragraph_format.line_spacing = 1.08 if compact else 1.15
        if first:
            paragraph.paragraph_format.space_before = Pt(2)
        add_inline(paragraph, text, size=size, citation_map=self.citation_map)

    def add_bullet(self, text: str, style: str = "•") -> None:
        paragraph = self.doc.add_paragraph()
        paragraph.paragraph_format.left_indent = Cm(0.65)
        paragraph.paragraph_format.first_line_indent = Cm(-0.65)
        paragraph.paragraph_format.space_after = Pt(4)
        paragraph.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
        paragraph.add_run(f"{style}\t")
        paragraph.paragraph_format.tab_stops.add_tab_stop(Cm(0.65))
        add_inline(paragraph, text, citation_map=self.citation_map)

    def add_numbered(self, number: str, text: str) -> None:
        paragraph = self.doc.add_paragraph()
        paragraph.paragraph_format.left_indent = Cm(0.75)
        paragraph.paragraph_format.first_line_indent = Cm(-0.75)
        paragraph.paragraph_format.space_after = Pt(5)
        paragraph.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
        paragraph.paragraph_format.tab_stops.add_tab_stop(Cm(0.75))
        run = paragraph.add_run(f"{number}.\t")
        run.bold = True
        add_inline(paragraph, text, citation_map=self.citation_map)

    def add_caption(self, text: str, *, figure: bool = False) -> None:
        paragraph = self.doc.add_paragraph()
        paragraph.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
        paragraph.paragraph_format.space_before = Pt(8 if not figure else 3)
        paragraph.paragraph_format.space_after = Pt(3 if not figure else 12)
        paragraph.paragraph_format.line_spacing = 1.0
        paragraph.paragraph_format.keep_with_next = not figure
        add_inline(paragraph, text, size=9, citation_map=self.citation_map)

    # -- figures ----------------------------------------------------------

    def add_figure(self, path: Path, caption: str) -> None:
        if not path.exists():
            raise FileNotFoundError(path)
        with Image.open(path) as image:
            width_px, height_px = image.size
        width_cm = 16.0
        height_cm = width_cm * height_px / width_px
        if height_cm > 19.0:
            height_cm = 19.0
            width_cm = height_cm * width_px / height_px
        paragraph = self.doc.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_before = Pt(10)
        paragraph.paragraph_format.space_after = Pt(0)
        paragraph.paragraph_format.keep_with_next = True
        run = paragraph.add_run()
        run.add_picture(str(path), width=Cm(width_cm), height=Cm(height_cm))
        self.figure_count += 1
        self.add_caption(caption, figure=True)

    # -- tables -----------------------------------------------------------

    def add_table(self, rows: list[list[str]], alignments: list[str],
                  caption_number: int, caption_text: str) -> None:
        ncols = len(rows[0])
        widths = {
            1: [2.8, 2.4, 2.6, 2.4, 2.3, 3.5],
            2: [2.6, 3.0, 3.4, 3.6, 3.4],
            3: [3.0, 3.8, 2.4, 3.5, 3.3],
            4: [2.8, 5.4, 5.0, 2.8],
            5: [2.4, 6.0, 3.0, 4.6],
            6: [3.0, 11.0, 2.0],
            7: [4.6, 1.4, 1.8, 1.4, 3.0, 3.8],
            8: [5.2, 2.6, 2.0, 2.0, 2.2, 2.0],
            9: [5.2, 6.8, 4.0],
            10: [2.8, 4.2, 3.6, 2.4, 3.0],
        }.get(caption_number)
        if widths is None or len(widths) != ncols:
            weights = []
            for col in range(ncols):
                lengths = [len(re.sub(r"\*\*|`|\[@[^\]]+\]", "", row[col]))
                           for row in rows]
                weights.append(max(8, sum(lengths) / len(lengths)))
            total = sum(weights)
            widths = [PAGE_WIDTH_CM * w / total for w in weights]

        font_size = 8.0 if ncols >= 6 else 8.5 if ncols == 5 else 9.0
        if caption_number == 10:
            font_size = 8.0
        table = self.doc.add_table(rows=len(rows), cols=ncols)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        _set_table_borders(table)
        _set_table_cell_margins(table, top=18 if caption_number == 10 else 30,
                                bottom=18 if caption_number == 10 else 30)
        _set_table_fixed(table, widths)

        keep_all = len(rows) <= 7
        for r_idx, row in enumerate(rows):
            table_row = table.rows[r_idx]
            _set_cant_split(table_row)
            if r_idx == 0:
                _set_repeat_header(table_row)
            for c_idx, cell_text in enumerate(row):
                cell = table_row.cells[c_idx]
                cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
                paragraph = cell.paragraphs[0]
                paragraph.paragraph_format.space_before = Pt(0)
                paragraph.paragraph_format.space_after = Pt(0)
                paragraph.paragraph_format.line_spacing = 1.0
                if keep_all and r_idx < len(rows) - 1:
                    paragraph.paragraph_format.keep_with_next = True
                elif not keep_all and r_idx <= 1:
                    paragraph.paragraph_format.keep_with_next = True
                if alignments[c_idx] == "right":
                    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                elif alignments[c_idx] == "center":
                    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
                else:
                    paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
                add_inline(paragraph, cell_text.strip(), bold=(r_idx == 0),
                           size=font_size, citation_map=self.citation_map,
                           break_code=True)
                if r_idx == 0:
                    _set_cell_bottom_border(cell, sz=8)

        self.table_count += 1
        # A small spacer keeps the following text from touching the table.
        spacer = self.doc.add_paragraph()
        spacer.paragraph_format.space_before = Pt(0)
        spacer.paragraph_format.space_after = Pt(0)
        spacer.paragraph_format.line_spacing = 1.0
        spacer.add_run("").font.size = Pt(2)

    # -- equations --------------------------------------------------------

    def add_equation(self, latex: str) -> None:
        EQUATION_DIR.mkdir(exist_ok=True)
        self.equation_number += 1
        digest = hashlib.sha1(latex.encode("utf-8")).hexdigest()[:10]
        path = EQUATION_DIR / f"eq_{self.equation_number:02d}_{digest}.png"
        eq = latex.strip().rstrip(".,")
        fig = plt.figure(figsize=(0.01, 0.01))
        fig.text(0, 0, f"${eq}$", fontsize=12.5, color="black")
        fig.savefig(path, dpi=600, bbox_inches="tight", pad_inches=0.035,
                    facecolor="white")
        plt.close(fig)

        with Image.open(path) as image:
            width_px, height_px = image.size
        width_cm = width_px / 600 * 2.54
        if width_cm > 15.0:
            width_cm = 15.0
        height_cm = width_cm * height_px / width_px

        table = self.doc.add_table(rows=1, cols=2)
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.autofit = False
        _set_cant_split(table.rows[0])
        widths = [15.2, 0.8]
        _set_table_fixed(table, widths)
        tblpr = table._tbl.tblPr
        borders = OxmlElement("w:tblBorders")
        for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
            el = OxmlElement(f"w:{edge}")
            el.set(qn("w:val"), "nil")
            borders.append(el)
        lookup = tblpr.find(qn("w:tblLook"))
        if lookup is not None:
            lookup.addprevious(borders)
        else:
            tblpr.append(borders)
        _set_table_cell_margins(table, top=20, bottom=20, left=0, right=0)

        left = table.rows[0].cells[0]
        left.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        paragraph = left.paragraphs[0]
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_before = Pt(4)
        paragraph.paragraph_format.space_after = Pt(4)
        run = paragraph.add_run()
        run.add_picture(str(path), width=Cm(width_cm), height=Cm(height_cm))

        right = table.rows[0].cells[1]
        right.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        paragraph = right.paragraphs[0]
        paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        paragraph.paragraph_format.space_before = Pt(0)
        paragraph.paragraph_format.space_after = Pt(0)
        run = paragraph.add_run(f"({self.equation_number})")
        run.font.size = Pt(10)

    # -- references -------------------------------------------------------

    def add_references(self, entries: dict[str, str]) -> None:
        ordered = sorted(entries.items(), key=lambda kv: self.citation_map.get(kv[0], 10**6))
        for number, (key, text) in enumerate(ordered, 1):
            paragraph = self.doc.add_paragraph()
            paragraph.paragraph_format.left_indent = Cm(0.75)
            paragraph.paragraph_format.first_line_indent = Cm(-0.75)
            paragraph.paragraph_format.space_after = Pt(3)
            paragraph.paragraph_format.line_spacing = 1.0
            paragraph.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT
            paragraph.paragraph_format.tab_stops.add_tab_stop(Cm(0.75))
            run = paragraph.add_run(f"{number}.\t")
            run.font.size = Pt(9.5)
            add_inline(paragraph, text, size=9.5, citation_map=self.citation_map)

    # -- main parse -------------------------------------------------------

    def build(self) -> None:
        lines = self.body.splitlines()
        i = 0
        abstract_words = 0
        in_abstract = False
        pending_table_caption: str | None = None
        references_mode = False
        references_entries: dict[str, str] = {}
        appendix_mode = False

        # Pre-extract references so the section itself can be skipped.
        ref_block = self.body.split("## References", 1)
        if len(ref_block) == 2:
            ref_text = ref_block[1].split("## Appendix A", 1)[0]
            for match in re.finditer(r"^- \*\*(.+?)\*\* — (.*)$", ref_text, flags=re.M):
                references_entries[match.group(1)] = match.group(2).strip()

        while i < len(lines):
            line = lines[i]
            stripped = line.strip()

            if not stripped:
                i += 1
                continue

            if stripped.startswith("## "):
                title = stripped[3:].strip()
                if title == "References":
                    self.add_heading("References", 1, page_break=True)
                    self.add_references(references_entries)
                    references_mode = True
                    i += 1
                    continue
                if title.startswith("Appendix A"):
                    appendix_mode = True
                    references_mode = False
                    self.add_heading(title, 1, page_break=True)
                    i += 1
                    continue
                if title == "Abstract":
                    in_abstract = True
                    self.add_heading(title, 1, page_break=True)
                    i += 1
                    continue
                if title == "Highlights":
                    in_abstract = False
                    self.add_heading(title, 1, page_break=True)
                    i += 1
                    continue
                if title == "Declarations":
                    in_abstract = False
                    self.add_heading(title, 1, page_break=True)
                    i += 1
                    continue
                in_abstract = False
                self.add_heading(title, 1)
                i += 1
                continue

            if references_mode:
                i += 1
                continue

            if stripped.startswith("### "):
                self.add_heading(stripped[4:].strip(), 2)
                i += 1
                continue

            if stripped.startswith("#### "):
                self.add_heading(stripped[5:].strip(), 3)
                i += 1
                continue

            if stripped.startswith("!["):
                match = re.match(r"!\[(.*?)\]\((.*?)\)", stripped)
                if match:
                    alt, path = match.group(1), match.group(2)
                    caption = alt
                    # Use the following explicit caption if present.
                    j = i + 1
                    while j < len(lines) and not lines[j].strip():
                        j += 1
                    if j < len(lines):
                        cap_match = re.match(r"^\*\*(Figure \d+\.)\*\*\s*(.*)$",
                                             lines[j].strip())
                        if cap_match:
                            caption = f"**{cap_match.group(1)}** {cap_match.group(2)}"
                            i = j
                    self.add_figure(BASE / path, caption)
                i += 1
                continue

            if stripped == "\\[":
                j = i + 1
                chunk = []
                while j < len(lines) and lines[j].strip() != "\\]":
                    chunk.append(lines[j])
                    j += 1
                self.add_equation("\n".join(chunk).strip())
                i = j + 1
                continue

            if stripped.startswith("|"):
                table_lines = []
                while i < len(lines) and lines[i].strip().startswith("|"):
                    table_lines.append(lines[i].strip())
                    i += 1
                rows = []
                alignments = []
                for t_idx, t_line in enumerate(table_lines):
                    cells = [c.strip() for c in t_line.strip("|").split("|")]
                    if t_idx == 1 and all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                        alignments = []
                        for c in cells:
                            if c.startswith(":") and c.endswith(":"):
                                alignments.append("center")
                            elif c.endswith(":"):
                                alignments.append("right")
                            else:
                                alignments.append("left")
                        continue
                    rows.append(cells)
                if len(alignments) != len(rows[0]):
                    alignments = ["left"] * len(rows[0])
                caption_number = self.table_count + 1
                if pending_table_caption:
                    match = re.search(r"\*\*Table\s+([A-Z]?\d+)\.\*\*", pending_table_caption)
                    if match and match.group(1).isdigit():
                        caption_number = int(match.group(1))
                self.add_table(rows, alignments, caption_number,
                               pending_table_caption or "")
                pending_table_caption = None
                continue

            if re.match(r"^\d+\.\s", stripped):
                number, text = stripped.split(".", 1)
                self.add_numbered(number, text.strip())
                i += 1
                continue

            if stripped.startswith("- "):
                self.add_bullet(stripped[2:].strip())
                i += 1
                continue

            # Paragraph. Join continuation lines until a blank or block start.
            paragraph_lines = [stripped]
            j = i + 1
            while j < len(lines):
                nxt = lines[j].strip()
                if (not nxt or nxt.startswith("#") or nxt.startswith("![")
                        or nxt == "\\[" or nxt.startswith("|")
                        or re.match(r"^\d+\.\s", nxt) or nxt.startswith("- ")):
                    break
                paragraph_lines.append(nxt)
                j += 1
            text = " ".join(paragraph_lines)
            if text.startswith("**Table "):
                pending_table_caption = text
                self.add_caption(text)
            elif in_abstract:
                abstract_words += clean_words(text)
                self.add_body(text, size=10.5)
            elif appendix_mode:
                self.add_body(text, size=10.5, compact=True)
            else:
                self.add_body(text)
            i = j

        # Closing metadata and fields.
        settings = self.doc.settings.element
        update = OxmlElement("w:updateFields")
        update.set(qn("w:val"), "true")
        settings.append(update)

    def save(self, path: Path) -> None:
        props = self.doc.core_properties
        props.title = self.meta.get("title", "")
        props.author = self.meta.get("authors", "").replace("^{1}", "").replace("^{2}", "")
        props.subject = "Packaged-food label evaluation; data provenance; fail-closed systems"
        props.keywords = ("front-of-pack nutrition labelling; food composition data; "
                          "data provenance; fail-closed systems; nutrient profiling; India")
        props.comments = "Generated from AaharIQ_manuscript.md"
        self.doc.save(path)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    text = SOURCE.read_text(encoding="utf-8")
    meta, body = parse_front_matter(text)
    citation_map = build_citation_map(body.split("## References", 1)[0])

    main_text = body.split("## 1. Introduction", 1)[1].split("## Declarations", 1)[0]
    abstract_text = body.split("## Abstract", 1)[1].split("## Highlights", 1)[0]
    main_words = clean_words(main_text)
    abstract_words = clean_words(abstract_text)
    n_tables = len(re.findall(r"^\*\*Table ", body, flags=re.M))
    n_figures = len(re.findall(r"^!\[", body, flags=re.M))

    builder = PaperBuilder(meta, body, citation_map)
    builder.add_title_page(main_words, abstract_words, n_tables, n_figures)
    builder.build()
    builder.save(OUTPUT)
    print(f"Wrote {OUTPUT}")
    print(f"  words: {main_words:,} main / {abstract_words} abstract")
    print(f"  citations: {len(citation_map)}; tables: {n_tables}; figures: {n_figures}")
    print(f"  equations: {builder.equation_number}; tables placed: {builder.table_count}")


if __name__ == "__main__":
    main()
