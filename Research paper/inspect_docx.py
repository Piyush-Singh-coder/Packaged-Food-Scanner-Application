from docx import Document

doc = Document("AaharIQ_Research_Paper.docx")
print("tables:", len(doc.tables))
for i, table in enumerate(doc.tables):
    first = [c.text.strip()[:40] for c in table.rows[0].cells]
    print(i + 1, len(table.rows), len(table.columns), first)
