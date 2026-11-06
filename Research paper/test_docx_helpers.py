import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
import os

def set_cell_background(cell, fill_hex):
    tcPr = cell._element.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._element.get_or_add_tcPr()
    tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
    tcPr.append(tcMar)

def set_cell_border(cell, **kwargs):
    """
    kwargs can contain top, bottom, left, right.
    Value is dict: {'sz': 12, 'val': 'single', 'color': '2B6CB0'}
    """
    tcPr = cell._element.get_or_add_tcPr()
    tcBorders = parse_xml(f'<w:tcBorders {nsdecls("w")}/>')
    for border_name in ['top', 'left', 'bottom', 'right']:
        if border_name in kwargs:
            edge = parse_xml(f'<w:{border_name} {nsdecls("w")} w:val="{kwargs[border_name].get("val", "single")}" w:sz="{kwargs[border_name].get("sz", "4")}" w:space="0" w:color="{kwargs[border_name].get("color", "auto")}"/>')
            tcBorders.append(edge)
        else:
            edge = parse_xml(f'<w:{border_name} {nsdecls("w")} w:val="none"/>')
            tcBorders.append(edge)
    tcPr.append(tcBorders)

def add_callout(doc, text_paragraphs, title=""):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    
    cell = table.cell(0, 0)
    cell.width = Inches(6.5)
    set_cell_background(cell, "F7FAFC")
    set_cell_margins(cell, top=140, bottom=140, left=200, right=180)
    set_cell_border(cell, left={'sz': 24, 'val': 'single', 'color': '1A365D'})
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    if title:
        run_title = p.add_run(f"{title}\n")
        run_title.font.name = "Arial"
        run_title.font.size = Pt(10.5)
        run_title.font.bold = True
        run_title.font.color.rgb = RGBColor(0x1A, 0x36, 0x5D)
        
    for i, t in enumerate(text_paragraphs):
        if i == 0 and not title:
            run = p.add_run(t)
        elif i == 0 and title:
            run = p.add_run(t)
        else:
            p2 = cell.add_paragraph()
            p2.paragraph_format.space_before = Pt(3)
            p2.paragraph_format.space_after = Pt(3)
            p2.paragraph_format.line_spacing = 1.15
            run = p2.add_run(t)
        run.font.name = "Arial"
        run.font.size = Pt(9.5)
        run.font.italic = True
        run.font.color.rgb = RGBColor(0x2D, 0x37, 0x48)

    p_after = doc.add_paragraph()
    p_after.paragraph_format.space_before = Pt(4)
    p_after.paragraph_format.space_after = Pt(4)

print("Helper functions defined.")
