"""Builds the Fresh Price user manual (end users + administrators) as a PDF."""
import sys
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, CondPageBreak, Flowable, Frame, KeepTogether, NextPageTemplate, PageBreak,
    PageTemplate, Paragraph, Spacer, Table, TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

OUT = sys.argv[1] if len(sys.argv) > 1 else "Fresh-Price-User-Manual.pdf"

# ---------------------------------------------------------------- fonts & colours
FONT_DIR = "C:/Windows/Fonts/"
pdfmetrics.registerFont(TTFont("UI", FONT_DIR + "segoeui.ttf"))
pdfmetrics.registerFont(TTFont("UI-Bold", FONT_DIR + "segoeuib.ttf"))
pdfmetrics.registerFont(TTFont("UI-Semi", FONT_DIR + "seguisb.ttf"))
pdfmetrics.registerFont(TTFont("UI-Italic", FONT_DIR + "segoeuii.ttf") if False else TTFont("UI-Light", FONT_DIR + "segoeuisl.ttf"))
from reportlab.pdfbase.pdfmetrics import registerFontFamily
pdfmetrics.registerFont(TTFont("UI-It", FONT_DIR + "segoeuii.ttf"))
pdfmetrics.registerFont(TTFont("UI-BoldIt", FONT_DIR + "segoeuiz.ttf"))
registerFontFamily("UI", normal="UI", bold="UI-Bold", italic="UI-It", boldItalic="UI-BoldIt")

BRAND = colors.HexColor("#2f7d32")
BRAND_DARK = colors.HexColor("#256628")
BRAND_SOFT = colors.HexColor("#e3f1e1")
INK = colors.HexColor("#17201a")
MUTED = colors.HexColor("#5d6b61")
LINE = colors.HexColor("#dde3d8")
BG = colors.HexColor("#f6f7f4")
SURFACE2 = colors.HexColor("#eef1ea")
WARN = colors.HexColor("#9a6700")
WARN_SOFT = colors.HexColor("#fff4d6")
DANGER = colors.HexColor("#c0392b")
DANGER_SOFT = colors.HexColor("#fdecea")
INFO_SOFT = colors.HexColor("#e8f0fb")
INFO = colors.HexColor("#1f5fa8")

# ---------------------------------------------------------------- styles
S = {
    "body": ParagraphStyle("body", fontName="UI", fontSize=10, leading=15, textColor=INK, spaceAfter=6),
    "small": ParagraphStyle("small", fontName="UI", fontSize=8.5, leading=12, textColor=MUTED),
    "h1": ParagraphStyle("h1", fontName="UI-Bold", fontSize=22, leading=28, textColor=INK, spaceAfter=4),
    "kicker": ParagraphStyle("kicker", fontName="UI-Semi", fontSize=9, leading=12, textColor=BRAND, spaceAfter=2),
    "lead": ParagraphStyle("lead", fontName="UI", fontSize=11.5, leading=17, textColor=MUTED, spaceAfter=12),
    "h2": ParagraphStyle("h2", fontName="UI-Bold", fontSize=15, leading=20, textColor=INK, spaceBefore=14, spaceAfter=6),
    "h3": ParagraphStyle("h3", fontName="UI-Semi", fontSize=11.5, leading=16, textColor=INK, spaceBefore=8, spaceAfter=3),
    "cell": ParagraphStyle("cell", fontName="UI", fontSize=9, leading=12.5, textColor=INK),
    "cellb": ParagraphStyle("cellb", fontName="UI-Semi", fontSize=9, leading=12.5, textColor=INK),
    "cellh": ParagraphStyle("cellh", fontName="UI-Semi", fontSize=8.5, leading=11, textColor=BRAND_DARK),
    "step": ParagraphStyle("step", fontName="UI", fontSize=10, leading=15, textColor=INK),
    "stepn": ParagraphStyle("stepn", fontName="UI-Bold", fontSize=10, leading=15, textColor=colors.white, alignment=TA_CENTER),
    "callout": ParagraphStyle("callout", fontName="UI", fontSize=9.5, leading=14, textColor=INK),
    "caption": ParagraphStyle("caption", fontName="UI", fontSize=8.5, leading=11.5, textColor=MUTED, alignment=TA_CENTER),
    "bullet": ParagraphStyle("bullet", fontName="UI", fontSize=10, leading=15, textColor=INK, leftIndent=14, bulletIndent=3, spaceAfter=2),
    "toc1": ParagraphStyle("toc1", fontName="UI-Semi", fontSize=11, leading=18, textColor=INK, leftIndent=0),
    "toc2": ParagraphStyle("toc2", fontName="UI", fontSize=9.5, leading=15, textColor=MUTED, leftIndent=14),
}

CONTENT_W = A4[0] - 2 * 20 * mm


def P(text, style="body"):
    return Paragraph(text, S[style])


def bullets(items):
    return [Paragraph(t, S["bullet"], bulletText="•") for t in items]


def steps(items, start=1):
    rows = []
    for i, t in enumerate(items, start):
        rows.append([Paragraph(str(i), S["stepn"]), Paragraph(t, S["step"])])
    t = Table(rows, colWidths=[7 * mm, CONTENT_W - 7 * mm])
    style = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (0, -1), 0),
        ("LEFTPADDING", (1, 0), (1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for r in range(len(rows)):
        style.append(("BACKGROUND", (0, r), (0, r), BRAND))
    t.setStyle(TableStyle(style))
    return [t, Spacer(1, 6)]


def callout(text, kind="tip"):
    tones = {
        "tip": (BRAND_SOFT, BRAND, "Tip"),
        "note": (INFO_SOFT, INFO, "Note"),
        "warn": (WARN_SOFT, WARN, "Important"),
        "admin": (SURFACE2, INK, "Admin only"),
    }
    bg, bar, label = tones[kind]
    p = Paragraph(f'<font name="UI-Semi" color="{bar.hexval()}">{label}.</font> {text}', S["callout"])
    t = Table([[p]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LINEBEFORE", (0, 0), (0, -1), 3, bar),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return [t, Spacer(1, 8)]


def table(header, rows, widths):
    data = [[Paragraph(h, S["cellh"]) for h in header]]
    for r in rows:
        data.append([Paragraph(c, S["cellb"] if i == 0 else S["cell"]) for i, c in enumerate(r)])
    total = sum(widths)
    t = Table(data, colWidths=[CONTENT_W * w / total for w in widths], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_SOFT),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, BRAND),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return [t, Spacer(1, 10)]


class Heading(Paragraph):
    """Paragraph that registers itself in the table of contents."""

    def __init__(self, text, style, level):
        super().__init__(text, S[style])
        self.toc_level = level
        self.toc_text = text


def part(kicker, title, lead):
    return [
        P(kicker.upper(), "kicker"),
        Heading(title, "h1", 0),
        P(lead, "lead"),
    ]


def h2(text):
    return [CondPageBreak(45 * mm), Heading(text, "h2", 1)]


def h3(text):
    return [CondPageBreak(30 * mm), P(text, "h3")]


# ---------------------------------------------------------------- phone mockups
class Phone(Flowable):
    """Stylised phone screen built from simple UI elements (illustration, not a screenshot)."""

    W, H = 60 * mm, 118 * mm

    def __init__(self, elements, tab=None, sticky=None):
        super().__init__()
        self.elements = elements
        self.tab = tab
        self.sticky = sticky
        self.width, self.height = self.W, self.H

    # helpers ------------------------------------------------------------
    def _text(self, c, x, y, s, size=6.5, font="UI", color=INK, anchor="l"):
        c.setFont(font, size)
        c.setFillColor(color)
        if anchor == "r":
            c.drawRightString(x, y, s)
        elif anchor == "c":
            c.drawCentredString(x, y, s)
        else:
            c.drawString(x, y, s)

    def _rrect(self, c, x, y, w, h, r=2.2, fill=colors.white, stroke=LINE, sw=0.5):
        c.setFillColor(fill)
        if stroke is not None:
            c.setStrokeColor(stroke)
        c.setLineWidth(sw)
        c.roundRect(x, y, w, h, r, stroke=1 if stroke else 0, fill=1)

    def draw(self):
        c = self.canv
        W, H = self.W, self.H
        # body
        c.setFillColor(colors.HexColor("#1d241f"))
        c.roundRect(0, 0, W, H, 7 * mm, stroke=0, fill=1)
        sx, sy, sw, sh = 2.4 * mm, 2.4 * mm, W - 4.8 * mm, H - 4.8 * mm
        c.setFillColor(BG)
        c.roundRect(sx, sy, sw, sh, 5 * mm, stroke=0, fill=1)
        # notch
        c.setFillColor(colors.HexColor("#1d241f"))
        c.roundRect(W / 2 - 8 * mm, H - 5.2 * mm, 16 * mm, 2.6 * mm, 1.3 * mm, stroke=0, fill=1)

        x0, x1 = sx + 3 * mm, sx + sw - 3 * mm
        cw = x1 - x0
        y = sy + sh - 7 * mm
        # app bar
        c.setFillColor(colors.white)
        c.rect(sx, y - 5.5 * mm, sw, 7 * mm, stroke=0, fill=1)
        c.setStrokeColor(LINE)
        c.line(sx, y - 5.5 * mm, sx + sw, y - 5.5 * mm)
        c.setFillColor(BRAND)
        c.circle(x0 + 1.4 * mm, y - 2 * mm, 1.2 * mm, stroke=0, fill=1)
        self._text(c, x0 + 3.6 * mm, y - 3 * mm, "Fresh Price", 6.8, "UI-Semi")
        self._rrect(c, x1 - 15 * mm, y - 4.1 * mm, 15 * mm, 4 * mm, 2, SURFACE2, None)
        self._text(c, x1 - 7.5 * mm, y - 3 * mm, "27 Sep 2026", 5, "UI", MUTED, "c")
        y -= 9 * mm

        bottom_limit = sy + (12 * mm if self.tab is not None else 3 * mm) + (11 * mm if self.sticky else 0)

        for el in self.elements:
            kind = el[0]
            if kind == "gap":
                y -= el[1] * mm
            elif kind == "title":
                self._text(c, x0, y - 4 * mm, el[1], 9, "UI-Bold")
                y -= 5.5 * mm
                if len(el) > 2:
                    self._text(c, x0, y - 2 * mm, el[2], 5.5, "UI", MUTED)
                    y -= 4 * mm
                y -= 1 * mm
            elif kind == "date":
                h = 6 * mm
                self._rrect(c, x0, y - h, 6 * mm, h, 1.6)
                self._text(c, x0 + 3 * mm, y - 4 * mm, "‹", 8, "UI", MUTED, "c")
                self._rrect(c, x0 + 7 * mm, y - h, cw - 14 * mm, h, 1.6)
                self._text(c, x0 + cw / 2, y - 4 * mm, el[1], 6.3, "UI-Semi", INK, "c")
                self._rrect(c, x1 - 6 * mm, y - h, 6 * mm, h, 1.6)
                self._text(c, x1 - 3 * mm, y - 4 * mm, "›", 8, "UI", MUTED, "c")
                y -= h + 2.5 * mm
            elif kind == "chips":
                cx = x0
                for i, label in enumerate(el[1]):
                    w = c.stringWidth(label, "UI-Semi", 5.4) + 4 * mm
                    sel = i == el[2]
                    self._rrect(c, cx, y - 4.4 * mm, w, 4.4 * mm, 2.2, BRAND if sel else colors.white, None if sel else LINE)
                    self._text(c, cx + w / 2, y - 3 * mm, label, 5.4, "UI-Semi", colors.white if sel else MUTED, "c")
                    cx += w + 1.5 * mm
                y -= 6.5 * mm
            elif kind == "input":
                self._rrect(c, x0, y - 6 * mm, cw, 6 * mm, 1.6)
                self._text(c, x0 + 2.5 * mm, y - 4 * mm, el[1], 6, "UI", MUTED)
                y -= 8 * mm
            elif kind == "text":
                self._text(c, x0, y - 3 * mm, el[1], el[2] if len(el) > 2 else 6, "UI", MUTED)
                y -= 4.5 * mm
            elif kind == "card":  # (card, title, sub, right, tone)
                _, title, sub, right = el[:4]
                tone = el[4] if len(el) > 4 else None
                h = 9.5 * mm if sub else 7 * mm
                self._rrect(c, x0, y - h, cw, h, 2, colors.white, DANGER if tone == "danger" else LINE)
                if tone in ("green", "amber", "red"):
                    c.setFillColor({"green": BRAND, "amber": WARN, "red": DANGER}[tone])
                    c.roundRect(x0, y - h, 1.3 * mm, h, 0.6, stroke=0, fill=1)
                self._text(c, x0 + 2.8 * mm, y - 3.9 * mm, title, 6.6, "UI-Semi")
                if sub:
                    self._text(c, x0 + 2.8 * mm, y - 7.3 * mm, sub, 5, "UI", DANGER if tone == "red" else MUTED)
                if right:
                    self._text(c, x1 - 2.5 * mm, y - (5.6 if sub else 4.4) * mm, right, 6.6, "UI-Semi", INK, "r")
                y -= h + 1.8 * mm
            elif kind == "price":  # (price, name, sub, value, unit, tone)
                _, name, sub, value, unit, tone = el
                h = 10 * mm
                self._rrect(c, x0, y - h, cw, h, 2)
                c.setFillColor({"green": BRAND, "amber": WARN, "red": DANGER}[tone])
                c.roundRect(x0, y - h, 1.3 * mm, h, 0.6, stroke=0, fill=1)
                self._text(c, x0 + 2.8 * mm, y - 4 * mm, name, 6.4, "UI-Semi")
                self._text(c, x0 + 2.8 * mm, y - 7.6 * mm, sub, 4.8, "UI", DANGER if tone == "red" else MUTED)
                bw = 11 * mm
                bx = x1 - bw - 9 * mm
                self._rrect(c, bx, y - 7.8 * mm, bw, 5.8 * mm, 1.4, colors.white, WARN if tone == "amber" else LINE, 0.7)
                self._text(c, bx + bw - 1.5 * mm, y - 5.6 * mm, value, 6.4, "UI", INK if value else MUTED, "r")
                self._text(c, x1 - 1 * mm, y - 5.6 * mm, "/" + unit, 5, "UI", MUTED, "r")
                y -= h + 1.8 * mm
            elif kind == "line":  # (line, item, qty, units, selected, rate, conv, amount, missing)
                _, item, qty, units, selected, rate, conv, amount, missing = el
                h = (22 if missing else 14.5) * mm
                self._rrect(c, x0, y - h, cw, h, 2, colors.white, DANGER if missing else LINE)
                self._text(c, x0 + 2.5 * mm, y - 4.2 * mm, item, 7.2, "UI-Semi")
                self._text(c, x1 - 6 * mm, y - 4.2 * mm, amount, 7, "UI-Semi", INK, "r")
                self._text(c, x1 - 2.2 * mm, y - 4.2 * mm, "×", 7, "UI", MUTED, "r")
                self._rrect(c, x0 + 2.5 * mm, y - 10.3 * mm, 12 * mm, 5 * mm, 1.3)
                self._text(c, x0 + 13.5 * mm, y - 8.4 * mm, qty, 6.4, "UI", INK if qty else MUTED, "r")
                ux = x0 + 16 * mm
                for u in units:
                    w = c.stringWidth(u, "UI-Semi", 5.4) + 3.4 * mm
                    sel = u == selected
                    self._rrect(c, ux, y - 10.3 * mm, w, 5 * mm, 1.3, BRAND if sel else colors.white, None if sel else LINE)
                    self._text(c, ux + w / 2, y - 8.4 * mm, u, 5.4, "UI-Semi", colors.white if sel else MUTED, "c")
                    ux += w + 1 * mm
                if rate:
                    self._text(c, x0 + 2.5 * mm, y - 13 * mm, rate, 5, "UI", MUTED)
                if conv:
                    self._text(c, x1 - 2.5 * mm, y - 13 * mm, conv, 5, "UI", MUTED, "r")
                if missing:
                    self._rrect(c, x0 + 2 * mm, y - h + 1.8 * mm, cw - 4 * mm, 8.5 * mm, 1.5, DANGER_SOFT, None)
                    self._text(c, x0 + 3.5 * mm, y - h + 7.6 * mm, "Price not available for " + item + " on 27 Sep 2026.", 4.8, "UI-Semi", DANGER)
                    self._rrect(c, x0 + 3.5 * mm, y - h + 2.8 * mm, 17 * mm, 3.6 * mm, 1, DANGER, None)
                    self._text(c, x0 + 12 * mm, y - h + 3.9 * mm, "Add today’s price", 4.5, "UI-Semi", colors.white, "c")
                    self._rrect(c, x0 + 22 * mm, y - h + 2.8 * mm, 21 * mm, 3.6 * mm, 1, colors.white, DANGER)
                    self._text(c, x0 + 32.5 * mm, y - h + 3.9 * mm, "Use previous: ₹28.00", 4.5, "UI-Semi", DANGER, "c")
                y -= h + 1.8 * mm
            elif kind == "button":
                primary = el[2] if len(el) > 2 else True
                self._rrect(c, x0, y - 6.5 * mm, cw, 6.5 * mm, 1.8, BRAND if primary else colors.white, None if primary else LINE)
                self._text(c, x0 + cw / 2, y - 4.3 * mm, el[1], 6.4, "UI-Semi", colors.white if primary else INK, "c")
                y -= 8.5 * mm
            elif kind == "hero":  # (hero, label, value)
                h = 22 * mm
                self._rrect(c, x0, y - h, cw, h, 2.4)
                self._text(c, x0 + 2.8 * mm, y - 4.5 * mm, el[1], 5.6, "UI", MUTED)
                self._text(c, x0 + 2.8 * mm, y - 11 * mm, el[2], 13, "UI-Bold")
                c.setStrokeColor(LINE)
                c.line(x0 + 2.8 * mm, y - 13.5 * mm, x1 - 2.8 * mm, y - 13.5 * mm)
                for i, (v, l) in enumerate(el[3]):
                    tx = x0 + 2.8 * mm + i * (cw - 5.6 * mm) / 3
                    self._text(c, tx, y - 17.5 * mm, v, 8, "UI-Semi")
                    self._text(c, tx, y - 20.3 * mm, l, 4.8, "UI", MUTED)
                y -= h + 2 * mm
            elif kind == "sheet":  # dim overlay + bottom sheet with title
                top = y - el[1] * mm
                c.setFillColor(colors.Color(0, 0, 0, alpha=0.35))
                c.rect(sx, top, sw, y - top + 10 * mm, stroke=0, fill=1)
                c.setFillColor(colors.white)
                c.roundRect(sx, sy, sw, top - sy, 4 * mm, stroke=0, fill=1)
                c.setFillColor(LINE)
                c.roundRect(sx + sw / 2 - 4 * mm, top - 2.2 * mm, 8 * mm, 1.1 * mm, 0.5, stroke=0, fill=1)
                self._text(c, x0, top - 7 * mm, el[2], 8, "UI-Bold")
                self._text(c, x1, top - 7 * mm, "×", 8, "UI", MUTED, "r")
                y = top - 10 * mm
            elif kind == "row":  # simple list row inside sheets
                self._text(c, x0 + 1 * mm, y - 4 * mm, el[1], 6.4, "UI-Semi")
                self._text(c, x1 - 1 * mm, y - 4 * mm, el[2], 5.6, "UI", DANGER if el[2] == "No price" else MUTED, "r")
                c.setStrokeColor(SURFACE2)
                c.line(x0, y - 6.3 * mm, x1, y - 6.3 * mm)
                y -= 6.8 * mm
            elif kind == "banner":
                tone = el[2] if len(el) > 2 else "info"
                bg, fg = {"info": (BRAND_SOFT, BRAND_DARK), "warn": (WARN_SOFT, WARN), "danger": (DANGER_SOFT, DANGER)}[tone]
                self._rrect(c, x0, y - 6 * mm, cw, 6 * mm, 1.6, bg, None)
                self._text(c, x0 + 2.5 * mm, y - 3.9 * mm, el[1], 5.3, "UI-Semi", fg)
                y -= 8 * mm
            if y < bottom_limit:
                break

        # sticky bar
        if self.sticky:
            top = sy + (12 * mm if self.tab is not None else 3 * mm) + 11 * mm
            c.setFillColor(colors.white)
            c.rect(sx, top - 11 * mm, sw, 11 * mm, stroke=0, fill=1)
            c.setStrokeColor(LINE)
            c.line(sx, top, sx + sw, top)
            small, big, buttons = self.sticky
            self._text(c, x0, top - 4 * mm, small, 5, "UI", MUTED)
            self._text(c, x0, top - 8.8 * mm, big, 10, "UI-Bold")
            bx = x1
            for label, primary in reversed(buttons):
                w = c.stringWidth(label, "UI-Semi", 5.6) + 4 * mm
                bx -= w
                self._rrect(c, bx, top - 8.6 * mm, w, 6 * mm, 1.6, BRAND if primary else colors.white, None if primary else LINE)
                self._text(c, bx + w / 2, top - 6.2 * mm, label, 5.6, "UI-Semi", colors.white if primary else INK, "c")
                bx -= 1.4 * mm

        # tab bar
        if self.tab is not None:
            c.setFillColor(colors.white)
            c.rect(sx, sy + 3 * mm, sw, 9 * mm, stroke=0, fill=1)
            c.roundRect(sx, sy, sw, 6 * mm, 5 * mm, stroke=0, fill=1)
            c.setStrokeColor(LINE)
            c.line(sx, sy + 12 * mm, sx + sw, sy + 12 * mm)
            labels = ["Home", "Calculate", "Prices", "History", "More"]
            for i, label in enumerate(labels):
                tx = sx + sw * (i + 0.5) / 5
                col = BRAND if i == self.tab else MUTED
                c.setFillColor(col)
                c.circle(tx, sy + 8.4 * mm, 1.2 * mm, stroke=0, fill=1)
                self._text(c, tx, sy + 4.6 * mm, label, 4.6, "UI-Semi" if i == self.tab else "UI", col, "c")


def phones(*pairs):
    """Side-by-side phone illustrations with captions."""
    cells, caps = [], []
    for phone, cap in pairs:
        cells.append(phone)
        caps.append(Paragraph(cap, S["caption"]))
    n = len(cells)
    t = Table([cells, caps], colWidths=[CONTENT_W / n] * n)
    t.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 1), (-1, 1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return [Spacer(1, 4), KeepTogether(t), Spacer(1, 10)]


# ---------------------------------------------------------------- document template
class ManualDoc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(
            filename, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=22 * mm, bottomMargin=20 * mm,
            title="Fresh Price — User Manual", author="Fresh Price", subject="End-user and administrator guide",
        )
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="f")
        self.addPageTemplates([
            PageTemplate(id="cover", frames=[frame], onPage=self._cover),
            PageTemplate(id="content", frames=[frame], onPage=self._content),
        ])

    def afterFlowable(self, flowable):
        if isinstance(flowable, Heading):
            key = f"h{id(flowable)}"
            self.canv.bookmarkPage(key)
            self.canv.addOutlineEntry(flowable.toc_text, key, level=flowable.toc_level)
            self.notify("TOCEntry", (flowable.toc_level, flowable.toc_text, self.page, key))

    @staticmethod
    def _leaf(c, x, y, s, color):
        c.saveState()
        c.setStrokeColor(color)
        c.setLineWidth(s * 0.075)
        c.setLineCap(1)
        c.setLineJoin(1)
        p = c.beginPath()
        # leaf outline (from the app icon, 24-unit box, y flipped)
        f = lambda px, py: (x + px * s / 24, y + (24 - py) * s / 24)
        p.moveTo(*f(11, 20))
        p.curveTo(*f(7.1, 20), *f(4, 16.9), *f(4, 13))
        p.curveTo(*f(4, 7), *f(11, 3), *f(20, 3))
        p.curveTo(*f(20, 12), *f(16, 19), *f(10, 19))
        c.drawPath(p, stroke=1, fill=0)
        q = c.beginPath()
        q.moveTo(*f(4, 21))
        q.curveTo(*f(7, 16), *f(10, 13), *f(14, 11))
        c.drawPath(q, stroke=1, fill=0)
        c.restoreState()

    def _cover(self, c, doc):
        W, H = A4
        c.saveState()
        c.setFillColor(BRAND)
        c.rect(0, H * 0.42, W, H * 0.58, stroke=0, fill=1)
        c.setFillColor(BRAND_DARK)
        c.circle(W * 0.92, H * 0.95, 60 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.roundRect(20 * mm, H - 62 * mm, 22 * mm, 22 * mm, 6 * mm, stroke=0, fill=1)
        self._leaf(c, 23 * mm, H - 59 * mm, 16 * mm, BRAND)
        c.setFont("UI-Semi", 11)
        c.drawString(20 * mm, H - 80 * mm, "FRESH PRICE")
        c.setFont("UI-Bold", 38)
        c.drawString(20 * mm, H - 100 * mm, "User Manual")
        c.setFont("UI", 14)
        c.drawString(20 * mm, H - 112 * mm, "Daily fruit & vegetable prices and cost calculation")
        c.setFont("UI", 11)
        c.setFillColor(colors.HexColor("#d9ecd6"))
        c.drawString(20 * mm, H - 128 * mm, "For everyday users and administrators · Phone, tablet and computer")
        # audience cards
        c.setFillColor(INK)
        c.setFont("UI-Bold", 13)
        c.drawString(20 * mm, H * 0.42 - 22 * mm, "Who this guide is for")
        cards = [
            ("Everyday users", "Sign in, create calculations, check prices, find past work.", "Parts A and B"),
            ("Administrators", "Enter daily prices, manage items and units, users, reports and audit.", "Parts A, B and C"),
        ]
        for i, (t, d, where) in enumerate(cards):
            x = 20 * mm + i * 87 * mm
            c.setFillColor(BG)
            c.roundRect(x, H * 0.42 - 70 * mm, 83 * mm, 40 * mm, 4 * mm, stroke=0, fill=1)
            c.setFillColor(BRAND)
            c.setFont("UI-Semi", 12)
            c.drawString(x + 6 * mm, H * 0.42 - 40 * mm, t)
            c.setFillColor(INK)
            c.setFont("UI", 9.5)
            words, line, ly = d.split(), "", H * 0.42 - 48 * mm
            for w in words:
                if c.stringWidth(line + " " + w, "UI", 9.5) > 71 * mm:
                    c.drawString(x + 6 * mm, ly, line.strip())
                    line, ly = "", ly - 5 * mm
                line += " " + w
            c.drawString(x + 6 * mm, ly, line.strip())
            c.setFillColor(MUTED)
            c.setFont("UI-Semi", 8.5)
            c.drawString(x + 6 * mm, H * 0.42 - 65 * mm, where)
        c.setFillColor(MUTED)
        c.setFont("UI", 8.5)
        c.drawString(20 * mm, 18 * mm, "Version 1.0 · September 2026 · Part D is a quick reference for everyone.")
        c.restoreState()

    def _content(self, c, doc):
        W, H = A4
        c.saveState()
        c.setStrokeColor(LINE)
        c.setLineWidth(0.5)
        c.line(20 * mm, H - 14 * mm, W - 20 * mm, H - 14 * mm)
        self._leaf(c, 20 * mm, H - 12.4 * mm, 4.2 * mm, BRAND)
        c.setFont("UI-Semi", 8)
        c.setFillColor(MUTED)
        c.drawString(25.5 * mm, H - 11.6 * mm, "Fresh Price · User Manual")
        c.drawRightString(W - 20 * mm, 11 * mm, str(doc.page))
        c.restoreState()


# ---------------------------------------------------------------- content
class Story(list):
    """Accepts a single flowable or a list with +=."""

    def __iadd__(self, other):
        if isinstance(other, Flowable):
            self.append(other)
        else:
            self.extend(other)
        return self


story = Story([NextPageTemplate("content"), PageBreak()])

toc = TableOfContents()
toc.levelStyles = [S["toc1"], S["toc2"]]
toc.dotsMinLevel = 0
story += [P("CONTENTS", "kicker"), P("What’s inside", "h1"), Spacer(1, 6), toc, PageBreak()]

# ======================= PART A — GETTING STARTED
story += part("Part A · Everyone", "Getting started",
              "What Fresh Price does, the two kinds of users, and how to sign in, install the app and find your way around.")

story += h2("What Fresh Price does")
story += [P("Fresh Price keeps a <b>daily price list</b> for fruits and vegetables and turns quantities into money. "
            "You pick items, type how much, and the app fills in today’s rate and adds everything up. "
            "Every saved calculation keeps the exact rate it used, so it never changes later, even when prices do.")]
story += table(["You enter", "The app does"], [
    ["Potato · 500 g", "Finds today’s rate (₹30/kg), converts 500 g to 0.5 kg, amount = <b>₹15.00</b>"],
    ["Chilli · 10 kg", "Rate ₹80/kg → <b>₹800.00</b>"],
    ["Cucumber · 10 kg", "Rate ₹40/kg → <b>₹400.00</b>"],
    ["", "Total <b>₹1,215.00</b>, saved with its rates and a reference number such as CAL-000123"],
], [1, 3])
story += callout("If Potato becomes ₹35/kg tomorrow, tomorrow’s calculations use ₹35, while today’s saved calculation "
                 "keeps showing ₹30. That is by design.", "note")

story += h2("Two kinds of users")
story += table(["", "Everyday user", "Administrator"], [
    ["Create calculations, save drafts, finalize", "Yes, their own", "Yes"],
    ["See calculations", "Only their own", "Everyone’s"],
    ["View daily prices and price history", "Yes", "Yes"],
    ["Enter and change daily prices", "No", "Yes"],
    ["Cancel a finalized calculation", "No", "Yes, with a reason"],
    ["Items, categories, units, custom fields, settings", "No", "Yes"],
    ["Users & roles, reports & exports, audit log", "No", "Yes"],
], [2.2, 1.2, 1.2])
story += bullets([
    "The <b>first person to create an account becomes the Administrator</b>. Everyone who signs up after that starts as an everyday user.",
    "An administrator can promote others to Administrator under <b>More → Users &amp; roles</b> (Part C).",
])

story += h2("Create your account and sign in")
story += h3("Create an account")
story += steps([
    "Open the Fresh Price address your administrator gave you.",
    "Tap <b>New here? Create an account</b>.",
    "Enter your name, email and a password of at least 8 characters, then tap <b>Create account</b>.",
    "Open the confirmation email. For the smoothest result, <b>copy the link and paste it into the same browser</b> "
    "where you created the account, rather than clicking it inside your email app.",
    "Sign in with your email and password.",
])
story += h3("Sign in")
story += steps(["Enter your email and password.", "Tap <b>Sign in</b>. You land on the Home screen."])
story += callout("“Your email is not confirmed yet” means the confirmation link has not been opened. "
                 "Tap <b>Resend confirmation email</b> on the sign-in page.", "tip")
story += h3("Forgot your password")
story += steps([
    "On the sign-in page, type your email and tap <b>Forgot password?</b>",
    "Open the reset email and paste the link into the <b>same browser</b> you used to request it.",
    "Choose a new password on the <b>Set a new password</b> screen and tap <b>Save password</b>.",
])
story += bullets([
    "Each reset link works <b>once</b>. If you see “That email link could not be used”, request a new one.",
    "To change your password while signed in: <b>More → Change password</b>.",
    "To sign out: <b>More → Sign out</b>.",
])

story += h2("Install the app on your phone")
story += P("Fresh Price runs in the browser, but you can install it so it opens full-screen from your home screen like a normal app.")
story += table(["Phone", "How to install"], [
    ["Android (Chrome)", "Open Fresh Price → tap the ⋮ menu → <b>Install app</b> or <b>Add to Home screen</b>."],
    ["iPhone (Safari)", "Open Fresh Price → tap the Share button → <b>Add to Home Screen</b>."],
    ["Computer (Chrome / Edge)", "Click the install icon at the right end of the address bar."],
], [1, 3])
story += callout("Fresh Price needs an internet connection to load prices and save calculations, so the figures you see "
                 "are always current. Without a connection you see a “You’re offline” page with a <b>Try again</b> button.", "note")

story += h2("Finding your way around")
story += P("On a phone, five tabs sit at the bottom of the screen. On a tablet or computer the same links appear in a "
           "left-hand menu. The date at the top right is the <b>business date</b> (India time), which the app uses for “today”.")
story += table(["Tab", "What it’s for"], [
    ["Home", "Today’s total, counts, price status, recent calculations and quick actions."],
    ["Calculate", "Create a new calculation (the main screen)."],
    ["Prices", "Today’s price list. Administrators enter prices here, everyone else can view them."],
    ["History", "All your calculations. Search by date, status or item."],
    ["More", "Your account (change password, sign out) and, for administrators, all admin screens."],
], [1, 4])
story += phones(
    (Phone([
        ("title", "Hello, Ranjeet", "27 Sep 2026 · All users"),
        ("hero", "Today’s total", "₹1,215.00", [("3", "Calculations"), ("9", "Item lines"), ("1", "Drafts")]),
        ("card", "Today’s prices", "18 of 20 set · 2 missing", "›", "red"),
        ("card", "CAL-000123", "27 Sep 2026 · finalized", "₹1,215.00"),
    ], tab=0), "Home: today at a glance"),
    (Phone([
        ("title", "More", "owner@example.com"),
        ("text", "ADMINISTRATION", 5.2),
        ("card", "Reports & exports", None, "›"),
        ("card", "Items", None, "›"),
        ("card", "Units", None, "›"),
        ("card", "Users & roles", None, "›"),
        ("button", "Change password", False),
        ("button", "Sign out", False),
    ], tab=4), "More: account and admin screens"),
)
story += [PageBreak()]

# ======================= PART B — EVERYDAY USE
story += part("Part B · Everyone", "Everyday use",
              "Create calculations quickly on your phone, save them as drafts or finalize them, and find past work.")

story += h2("The Home screen")
story += bullets([
    "<b>Today’s total</b>: the sum of today’s <i>finalized</i> calculations. Drafts are not counted until finalized.",
    "<b>Calculations · Item lines · Drafts</b>: today’s counts. Tap <b>Drafts</b> to open your history.",
    "<b>Today’s prices</b>: how many items have a price for today, and how many are missing.",
    "<b>Finalized totals</b>: yesterday, the last 7 days and this month.",
    "<b>Recent calculations</b>: your latest five. Tap one to open it.",
])
story += callout("Everyday users see figures for <b>their own</b> calculations. Administrators see figures for everyone.", "note")

story += h2("Create a calculation, step by step")
story += steps([
    "Tap the <b>Calculate</b> tab. The date is set to today. Use ‹ › or tap the date to change it; "
    "rates always come from the chosen date.",
    "Tap <b>Add your first item</b> (or <b>+ Add item</b>). A panel slides up with a search box, category chips "
    "and each item’s rate for that date.",
    "Type a few letters (for example <i>pot</i>) and tap the item, or press Enter to pick the first match.",
    "The keypad opens on the new line. Type the <b>quantity</b>, for example 500.",
    "Tap the <b>unit</b>, for example <b>g</b>. Only units that convert to the item’s price unit are offered, "
    "such as kg and g for potatoes.",
    "The line shows the rate (<i>@ ₹30.00/kg</i>), the conversion (<i>= 0.5 kg</i>) and the <b>amount</b>. "
    "The <b>total</b> at the bottom updates as you type.",
    "Press <b>Enter</b> to jump to the next line. On the last line, Enter opens <b>Add item</b> again.",
    "When you’re done, tap <b>Save draft</b> or <b>Finalize</b> (see below).",
])
story += phones(
    (Phone([
        ("sheet", 16, "Add item"),
        ("input", "pot"),
        ("chips", ["All", "Vegetable", "Fruit"], 0),
        ("row", "Potato", "₹30.00/kg"),
        ("row", "Pomegranate", "₹160.00/kg"),
        ("row", "Spinach", "No price"),
    ]), "Pick items from the slide-up panel"),
    (Phone([
        ("title", "New calculation"),
        ("date", "27 Sep 2026"),
        ("line", "Potato", "500", ["kg", "g"], "g", "@ ₹30.00/kg", "= 0.5 kg", "₹15.00", False),
        ("line", "Chilli", "10", ["kg", "g"], "kg", "@ ₹80.00/kg", "", "₹800.00", False),
        ("line", "Cucumber", "10", ["kg", "g"], "kg", "@ ₹40.00/kg", "", "₹400.00", False),
    ], tab=1, sticky=("3 items", "₹1,215.00", [("Save draft", False), ("Finalize", True)])),
     "Quantities, units and the running total"),
)

story += h2("Units and conversions")
story += P("Prices are set per a <b>price unit</b> (for example ₹/kg). You may enter any unit that converts to it, "
           "and the app converts before multiplying. Amounts are rounded once, to 2 decimals, at the end.")
story += table(["You enter", "Price", "Conversion", "Amount"], [
    ["500 g Potato", "₹30/kg", "500 g = 0.5 kg", "0.5 × 30 = <b>₹15.00</b>"],
    ["2 kg Onion", "₹35.50/kg", "none needed", "<b>₹71.00</b>"],
    ["3 pc Banana", "₹60/dozen", "3 pc = 0.25 dozen", "<b>₹15.00</b>"],
    ["2 box Mango", "₹100/kg", "1 box = 5 kg (item conversion)", "10 × 100 = <b>₹1,000.00</b>"],
], [1.3, 0.9, 1.6, 1.4])
story += callout("A unit that can’t be converted, such as millilitres for an item priced per kg, is never offered, and the "
                 "app will not calculate it. Ask your administrator to add an <b>item conversion</b> if an item is "
                 "legitimately sold another way (for example by the box).", "note")

story += h2("When a price is missing")
story += P("If an item has no price for the chosen date, its line turns red with "
           "<i>“Price not available for Potato on 27 Sep 2026.”</i> The app <b>never assumes zero</b> and never "
           "quietly uses an old price.")
story += bullets([
    "<b>Everyday users</b>: the line says <i>Ask an admin to add this price.</i> You can still save other work as a draft later.",
    "<b>Administrators</b>: tap <b>Add today’s price</b> to type it, or <b>Use previous: ₹28.00 (26 Sep)</b> "
    "to pre-fill the last known price, then tap <b>Save price</b>. The line fills in at once.",
])
story += phones(
    (Phone([
        ("title", "New calculation"),
        ("date", "27 Sep 2026"),
        ("line", "Spinach", "", ["bundle"], "bundle", "", "", "—", True),
        ("line", "Potato", "1", ["kg", "g"], "kg", "@ ₹30.00/kg", "", "₹30.00", False),
    ], tab=1, sticky=("2 items · 1 need attention", "₹30.00", [("Save draft", False), ("Finalize", True)])),
     "A missing price is flagged, never zero"),
)

story += h2("Duplicates, removing lines, adjustments and notes")
story += bullets([
    "<b>Adding an item that is already in the list</b> takes you to its existing line with the message "
    "<i>“Potato is already in the list — update its quantity.”</i> This prevents accidental double entries.",
    "<b>Remove a line</b> with the <b>×</b> at its top right.",
    "<b>+ Adjustment or notes</b>: an adjustment is added to the subtotal. Use a negative number for a discount "
    "(for example <b>-50</b>). Notes are free text (up to 500 characters) saved with the calculation.",
])

story += h2("Save draft or Finalize")
story += table(["", "Save draft", "Finalize"], [
    ["Use it when", "You’re not finished, or want to check later", "The calculation is correct and complete"],
    ["Can be edited", "Yes, by you", "<b>No, never</b>. It is frozen"],
    ["Counts in totals and reports", "No", "Yes"],
    ["Can be deleted", "Yes, by you", "No. An administrator can <b>cancel</b> it with a reason"],
], [1.2, 1.5, 1.5])
story += bullets([
    "After saving you land on the calculation’s page, which shows its reference number (for example <b>CAL-000124</b>).",
    "Tapping Save twice by accident still creates <b>only one</b> calculation.",
    "The server re-checks every rate when you save. If an administrator changed a price a moment ago you’ll see "
    "<i>“The price of Potato just changed. Review the new rate and save again.”</i> The new rates load "
    "automatically. Check them and save again.",
])

story += h2("Your calculation history")
story += steps([
    "Tap the <b>History</b> tab.",
    "Filter by status (<b>All · Drafts · Finalized · Cancelled</b>), a <b>From / To</b> date range, or "
    "<b>Contains item</b>.",
    "Tap a calculation to open it.",
])
story += h3("What you can do on a calculation’s page")
story += table(["Status", "What it means", "Actions"], [
    ["Draft", "Saved but not final. Not counted in totals.", "<b>Edit</b>, <b>Finalize</b>, <b>Delete draft</b> (your own drafts only)"],
    ["Finalized", "Final and frozen, with its rates kept exactly as used.", "<b>Print</b>. Administrators: <b>Cancel calculation</b>"],
    ["Cancelled", "Withdrawn by an administrator, with the reason shown. Kept for audit.", "View only"],
], [0.9, 2.2, 2])
story += callout("<b>Finalize can refuse a draft</b> if a rate changed after the draft was saved: "
                 "<i>“The price of Onion changed since this draft was saved. Open the draft and save it again.”</i> "
                 "Tap <b>Edit</b>, check the new rate and save. Then finalize.", "tip")
story += h3("Print")
story += P("Open a finalized calculation and tap <b>Print</b>. The printout shows only the calculation (items, quantities, "
           "rates, amounts and totals) without the app’s menus. Choose <b>Save as PDF</b> in the print dialog to keep a file.")

story += h2("Viewing prices")
story += P("Everyone can open the <b>Prices</b> tab to see each item’s rate for any date, the previous rate, and whether it went "
           "up (▲) or down (▼). Only administrators can change prices. Tap <b>History →</b> to browse past prices.")
story += [PageBreak()]

# ======================= PART C — ADMINISTRATION
story += part("Part C · Administrators", "Administration",
              "Daily prices, master data, settings, users, reports, the audit log and cancelling calculations. "
              "Admin screens are under the <b>More</b> tab.")

story += h2("Enter daily prices")
story += P("Every morning (or whenever rates change), set the day’s price for each item. Prices are stored <b>per date</b>: "
           "setting today’s price never changes yesterday’s, and past calculations keep the rates they used.")
story += steps([
    "Open the <b>Prices</b> tab. Check the date (‹ › to change it; <b>Today</b> jumps back).",
    "The summary shows e.g. <i>18 of 20 items priced · 2 missing</i>. Use <b>Missing</b> to see only unpriced items.",
    "Tap a price box and type the rate. Press <b>Enter</b> to move to the next item.",
    "Each row shows the previous price and date, and ▲/▼ with the difference once you type.",
    "Tap <b>Save prices</b> in the bar at the bottom. It shows how many changes you have.",
])
story += phones(
    (Phone([
        ("title", "Daily prices", "Prices for 27 Sep 2026"),
        ("date", "27 Sep 2026"),
        ("chips", ["All (20)", "Missing (2)", "Changed (1)"], 0),
        ("price", "Potato", "Prev ₹28.00 · 26 Sep  ▲ ₹2.00", "30.00", "kg", "green"),
        ("price", "Onion", "Prev ₹35.00 · 26 Sep  ▲ ₹0.50", "35.50", "kg", "amber"),
        ("price", "Spinach", "Price not set for this date", "", "bundle", "red"),
    ], tab=2, sticky=("1 change", "", [("Discard", False), ("Save prices", True)])), "Colour strip: green saved · amber unsaved · red missing"),
    (Phone([
        ("title", "Daily prices", "Prices for 28 Sep 2026"),
        ("date", "28 Sep 2026"),
        ("banner", "Filled 20 prices from earlier days. Review, then Save.", "info"),
        ("price", "Potato", "Prev ₹30.00 · 27 Sep  same", "30.00", "kg", "amber"),
        ("price", "Onion", "Prev ₹35.50 · 27 Sep  same", "35.50", "kg", "amber"),
    ], tab=2, sticky=("20 changes", "", [("Discard", False), ("Save prices", True)])), "Copy previous prices, review, save"),
)
story += h3("Copy previous prices")
story += P("Tap <b>Copy previous prices</b> to fill every <i>empty</i> price with that item’s most recent earlier price. "
           "Nothing is saved until you review the values and tap <b>Save prices</b>. Items that already have a price for the "
           "date are not touched, and the earlier day is never changed.")
story += h3("How saving works")
story += bullets([
    "<b>All or nothing</b>: if any price is invalid, nothing is saved and the problem rows are highlighted "
    "(<i>“Nothing saved — fix 1 highlighted price.”</i>). Fix them and save again.",
    "Valid formats are <b>30</b> or <b>30.50</b> (up to 2 decimals). Zero is allowed. Negative values are not.",
    "If another admin saved the same price after you opened the screen, you’ll see <i>“Changed by someone else… "
    "Reload and try again.”</i> Your version never silently overwrites theirs.",
    "Every edit of a saved price is kept as a revision. Prices can’t be deleted: clearing a saved box restores it, "
    "so enter the correct value instead.",
    "Leaving the page with unsaved changes asks for confirmation.",
])
story += h3("Price history")
story += P("<b>Prices → History →</b> lists every stored price, newest first. Filter by item, category and date range. "
           "The <b>Edits</b> column shows how many times a day’s price was corrected. Details of each correction are in the audit log.")

story += h2("Master data: items, categories and units")
story += P("Everything the app knows about (items, categories, units, conversions and custom fields) is <b>master data</b> "
           "that you manage yourself, with no programming. All master screens work the same way:")
story += bullets([
    "Open <b>More → Administration</b> and choose the list.",
    "Search, and filter by <b>All / Active / Inactive</b>. Phones show cards; computers show a table.",
    "Tap <b>+</b> (bottom right on phones) or <b>+ New</b> to add. Tap a row to edit.",
    "The form checks your input as you go and shows problems under each field.",
    "<b>Deactivate instead of delete</b> when something has history: untick <b>Active</b>. Inactive entries disappear from "
    "pick-lists but old records stay intact. Deleting something that is in use is refused with a message.",
    "If two admins edit the same record, the second save shows <i>“Someone else changed this record. Reload it and try again.”</i>",
])
story += h3("Categories")
story += P("Name, optional <b>parent</b> (e.g. <i>Leafy Vegetable</i> under <i>Vegetable</i>), sort order and Active. "
           "Filtering by a parent category also shows its sub-categories.")
story += h3("Unit types and units")
story += P("Units belong to a <b>type</b> (Weight, Volume, Count, Pack). Within a type, one <b>base unit</b> has factor 1 "
           "and other units state how many base units they are. Units only convert within the same type.")
story += table(["Unit", "Type", "Base unit", "Factor", "Meaning"], [
    ["kg", "Weight", "(base)", "1", "Base for weight"],
    ["g", "Weight", "kg", "0.001", "1 g = 0.001 kg"],
    ["L", "Volume", "(base)", "1", "Base for volume"],
    ["ml", "Volume", "L", "0.001", "1 ml = 0.001 L"],
    ["pc", "Count", "(base)", "1", "Base for pieces"],
    ["dozen", "Count", "pc", "12", "1 dozen = 12 pc"],
    ["box, pkt, bundle", "Pack", "(base each)", "1", "Converted only via item conversions"],
], [1, 0.9, 1, 0.7, 2])
story += bullets([
    "A base unit must have factor <b>1</b>, and a derived unit must share its base unit’s type. The form enforces both.",
    "<b>Quantity decimals</b> is how precisely quantities in that unit are usually entered.",
])
story += h3("Items")
story += table(["Field", "What to enter"], [
    ["Name", "Unique name, e.g. <i>Lady Finger</i>."],
    ["Category", "Where it appears in filters and reports."],
    ["Pricing unit", "The unit daily prices are entered in (₹ per <b>kg</b>, per <b>dozen</b>, per <b>bundle</b>…)."],
    ["Default entry unit", "The unit pre-selected when adding the item to a calculation. It must convert to the pricing unit "
                           "(e.g. <b>g</b> for Chilli priced per kg)."],
    ["Additional details", "Any custom fields you’ve defined (see below), e.g. <i>Origin</i>."],
], [1, 3])
story += callout("Deleting an item <b>hides</b> it rather than erasing it. Past prices and calculations still show it by name. "
                 "Renaming an item is safe too: saved calculations keep the name they were saved with.", "note")
story += h3("Item conversions")
story += P("Some items are sold in a pack whose weight is fixed for that item only, for example “1 box of Mango = 5 kg”. "
           "Add it under <b>More → Item conversions</b>: Item <i>Mango</i>, From <i>box</i>, To <i>kg</i>, Factor <i>5</i>. "
           "From then on, <b>box</b> appears as a unit choice for Mango in calculations (and g works too, via kg).")
story += h3("Custom fields")
story += P("Add your own fields to items without any programming, under <b>More → Custom fields</b>. "
           "An example field, <i>Origin</i>, is already included.")
story += table(["Setting", "Meaning"], [
    ["Applies to / Label / Key", "Which records get the field, the label users see, and a short key (lowercase, e.g. <i>grade</i>)."],
    ["Type", "text, number, decimal, yes/no, date, select (a list of choices) or lookup (pick a category, unit or item)."],
    ["Choices", "For <i>select</i>: one choice per line."],
    ["Required · Min · Max · Pattern", "Validation rules, checked on every save."],
    ["Show in form / list / mobile card", "Where the field is displayed. Order fields with <i>Form order</i> and <i>List order</i>."],
], [1.4, 3])

story += h2("Settings")
story += P("<b>More → Settings</b> holds business rules used everywhere. Change a value, then tap <b>Save</b> in the bar at "
           "the bottom. Each setting is checked and reported separately, so an invalid value doesn’t block the others.")
story += table(["Setting", "Default", "Effect"], [
    ["Business timezone", "Asia/Kolkata", "Defines “today” for prices and calculations."],
    ["Currency code / symbol / locale", "INR · ₹ · en-IN", "How money is shown, e.g. ₹1,23,000.00."],
    ["Amount decimals", "2", "Decimals kept for amounts (0–4)."],
    ["Rounding mode", "HALF_UP", "How each line amount is rounded (once). HALF_EVEN, DOWN and UP are also available."],
    ["Duplicate item lines", "merge", "<i>merge</i>: adding an item already in the list jumps to it. <i>allow</i>: separate lines."],
    ["Reference prefix / digits", "CAL- · 6", "Calculation numbers such as CAL-000123."],
    ["Allow copying previous price", "Yes", "Shows Copy previous / Use previous buttons."],
], [1.5, 1.1, 2.6])

story += h2("Users & roles")
story += steps([
    "Ask the new person to create an account on the sign-in page. They start as an everyday <b>User</b>.",
    "Open <b>More → Users &amp; roles</b> and tap their name.",
    "Tick <b>Admin</b> and/or <b>User</b>, or untick <b>Active</b> to block them, then tap <b>Save</b>.",
])
story += bullets([
    "A deactivated person can still sign in but can’t see or change anything.",
    "You can’t deactivate your own account, and the app always keeps <b>at least one active admin</b>.",
    "Removing your own Admin role takes effect immediately and removes your access to admin screens.",
])

story += h2("Reports & exports")
story += P("<b>More → Reports &amp; exports</b>. Choose a report and a period (<b>Today, Yesterday, Last 7 days, "
           "This month</b> or <b>Custom</b>, up to one year).")
story += table(["Report", "Shows", "Typical use"], [
    ["Items", "Per item: total quantity (in its price unit), average rate, amount, number of calculations; grand total.",
     "Pick <b>Today</b> for the <b>daily report</b>; a range for <b>item consumption</b>."],
    ["Daily totals", "One row per day: calculations, item lines, total. Days with nothing show zero.", "Trends, month-end totals."],
    ["Prices", "Every stored price in the range with edit counts (export only). Optionally one item.", "Price history report."],
], [0.8, 2.4, 1.6])
story += bullets([
    "<b>CSV</b> and <b>Excel</b> download files that open in Excel, Google Sheets or LibreOffice with numbers formatted properly. "
    "<b>Print</b> prints the on-screen report.",
    "Reports count <b>finalized</b> calculations only. Drafts and cancelled ones are excluded.",
    "Figures use the amounts <b>saved</b> in each calculation, so later price changes or renamed items never alter a past report.",
])

story += h2("Cancel a finalized calculation")
story += steps([
    "Open the calculation (History tab) and tap <b>Cancel calculation</b>.",
    "Type the reason (at least 3 characters), for example <i>Entered twice</i>, and confirm.",
])
story += P("The calculation stays in history marked <b>Cancelled</b> with the reason, and drops out of all totals and reports. "
           "Cancelling can’t be undone. Create a new calculation if needed.")

story += h2("Audit log")
story += P("<b>More → Audit log</b> records every change to prices, calculations, items, units, categories, custom fields and "
           "settings: <b>what</b> changed, <b>who</b> changed it and <b>when</b>. Filter by type and tap an entry to see the old "
           "value (struck through) and the new value. Green = created, amber = changed, red = deleted.")
story += [PageBreak()]

# ======================= PART D — REFERENCE
story += part("Part D · Everyone", "Quick reference",
              "Messages you may see and what to do, a daily routine for administrators, answers to common questions and key terms.")

story += h2("Messages and what to do")
story += table(["Message", "What it means / what to do"], [
    ["Email or password is incorrect.", "Check both, including capital letters. Use <b>Forgot password?</b> if needed."],
    ["Your email is not confirmed yet.", "Open the confirmation email, or tap <b>Resend confirmation email</b>."],
    ["That email link could not be used.", "Links work once and in the same browser. Request a new one and paste it into that browser."],
    ["Price not available for … on …", "No price for that date. Admins: Add today’s price / Use previous. Users: ask an admin."],
    ["… is already in the list — update its quantity.", "The item is already on a line. Change that line’s quantity."],
    ["The price of … just changed. Review the new rate and save again.", "An admin changed a rate while you worked. New rates are loaded; check and save."],
    ["The price of … changed since this draft was saved.", "Open the draft (<b>Edit</b>), save it again, then finalize."],
    ["Fix the highlighted lines first.", "A quantity is empty or invalid, or a price is missing. Red lines explain why."],
    ["Nothing saved — fix N highlighted prices.", "Price entry is all-or-nothing. Correct the red rows and save again."],
    ["Changed by someone else. Reload and try again.", "Another admin saved first. Reload to see their value, then re-apply your change."],
    ["This … is in use. Deactivate it instead of deleting.", "Untick <b>Active</b> instead. History stays intact."],
    ["At least one active admin is required.", "Promote someone else to Admin before removing the last one."],
    ["Too many requests. Try again in N s.", "A safety limit was reached. Wait the stated seconds."],
    ["Something went wrong. (Ref: req_…)", "Try again. If it repeats, send the <b>Ref</b> code to your administrator or support."],
    ["You’re offline", "Check your internet connection and tap <b>Try again</b>."],
], [2, 3])

story += h2("Daily routine for administrators")
story += table(["When", "Do this"], [
    ["Morning", "Prices → today → <b>Copy previous prices</b> → update what changed → <b>Save prices</b>."],
    ["Morning", "Home → <b>Today’s prices</b> should read “All prices set”. Tap it if any are missing."],
    ["During the day", "Staff create calculations. Watch <b>Drafts</b> on Home."],
    ["End of day", "History → <b>Drafts</b> → finalize or delete leftovers."],
    ["End of day / month", "Reports → <b>Items</b> (Today) or <b>Daily totals</b> (This month) → <b>Excel</b> or <b>Print</b>."],
    ["As needed", "Add new items or units under More; review the <b>Audit log</b> for unexpected changes."],
], [1, 4])

story += h2("Frequently asked questions")
faq = [
    ("I changed today’s price. Do earlier calculations change?",
     "No. Every calculation stores the rate it used. Only new calculations use the new price."),
    ("Why can’t I edit a finalized calculation?",
     "Finalized means final, which protects your records. An administrator can cancel it with a reason; then create a new one."),
    ("Why doesn’t my total on Home include my draft?",
     "Home and reports count finalized calculations only. Finalize the draft to include it."),
    ("Can I work offline?",
     "No. Prices and calculations always come live from the server so figures are never out of date. "
     "The installed app shows an offline page until the connection returns."),
    ("Why can’t I choose ml for Potato?",
     "Potato is priced per kg. Only units that convert to kg are offered, so the app never multiplies incompatible units."),
    ("Someone new needs access. What do I do?",
     "They create an account on the sign-in page; an administrator then sets their role under More → Users & roles."),
    ("How are amounts rounded?",
     "Quantity × rate is calculated exactly and rounded once, to 2 decimals (half-up by default; set in Settings)."),
]
for q, a in faq:
    story += [KeepTogether([P(f"<b>{q}</b>", "body"), P(a, "body"), Spacer(1, 2)])]

story += h2("Glossary")
story += table(["Term", "Meaning"], [
    ["Business date", "“Today” in the business timezone (India time by default), independent of the device clock."],
    ["Price unit", "The unit an item’s price is set in, e.g. ₹/kg. Entered quantities are converted to it."],
    ["Base unit / factor", "The reference unit of a unit type (kg, L, pc) and how many base units another unit equals."],
    ["Item conversion", "An item-specific rule such as 1 box of Mango = 5 kg."],
    ["Draft / Finalized / Cancelled", "Editable work in progress / frozen final record / withdrawn record kept for audit."],
    ["Reference number", "The calculation’s unique number, e.g. CAL-000123."],
    ["Snapshot", "The item name, unit and rate saved inside a calculation, so it never changes later."],
    ["Master data", "Items, categories, units, conversions, custom fields and settings that admins manage."],
    ["Audit log", "The record of who changed what, and when."],
], [1.3, 4])

doc = ManualDoc(OUT)
doc.multiBuild(story)
print("written", OUT)
