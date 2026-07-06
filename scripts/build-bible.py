#!/usr/bin/env python3
"""The SPAS 360 Bible — single source of truth for operators AND builders.

Produced on the NDAI warm-light ground (bone/ink/deep-sand — the trust-document
system from NDAI-DESIGN-SYSTEM.html v2.0): built for print, reads high-class.
Brand fonts are vendored in scripts/fonts/ so this builds on any machine.
"""
import os

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak,
    Table, TableStyle, NextPageTemplate, HRFlowable,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, 'scripts', 'fonts')
LOGO = os.path.join(ROOT, 'public', 'logo-mark.png')
OUT = os.path.join(ROOT, 'docs', 'SPAS360-Bible.pdf')

# ─── Fonts (NDAI: Space Grotesk speaks, Inter works, Mono proves) ───
for name, file in [
    ('Inter', 'Inter-Regular.ttf'), ('Inter-SemiBold', 'Inter-SemiBold.ttf'),
    ('Inter-Bold', 'Inter-Bold.ttf'), ('Inter-Italic', 'Inter-Italic.ttf'),
    ('SpaceGrotesk', 'SpaceGrotesk-Regular.ttf'),
    ('SpaceGrotesk-SemiBold', 'SpaceGrotesk-SemiBold.ttf'),
    ('SpaceGrotesk-Bold', 'SpaceGrotesk-Bold.ttf'),
    ('JetBrainsMono', 'JetBrainsMono-Regular.ttf'),
    ('JetBrainsMono-SemiBold', 'JetBrainsMono-SemiBold.ttf'),
]:
    pdfmetrics.registerFont(TTFont(name, os.path.join(FONTS, file)))
pdfmetrics.registerFontFamily('Inter', normal='Inter', bold='Inter-Bold',
                              italic='Inter-Italic', boldItalic='Inter-Bold')
pdfmetrics.registerFontFamily('SpaceGrotesk', normal='SpaceGrotesk',
                              bold='SpaceGrotesk-Bold', italic='SpaceGrotesk',
                              boldItalic='SpaceGrotesk-Bold')
pdfmetrics.registerFontFamily('JetBrainsMono', normal='JetBrainsMono',
                              bold='JetBrainsMono-SemiBold', italic='JetBrainsMono',
                              boldItalic='JetBrainsMono-SemiBold')

# ─── NDAI warm-light ground ──────────────────────────────
BONE = HexColor('#F4F1EC')          # page ground
WARM = HexColor('#EAE6DF')          # raised surface (table headers, cards)
WEATHERED = HexColor('#B8AA96')     # hairlines, dividers
DEEP_SAND = HexColor('#7A6448')     # eyebrows, structural text
INK = HexColor('#1A1A1A')           # headings, primary text
BODY = HexColor('#4A4438')          # body copy on bone
PAPER = HexColor('#FBF9F5')         # table row light
PAPER2 = HexColor('#EFEBE3')        # table row alternate
HAIR = HexColor('#D9D2C4')          # table grid hairline

# SPAS 360 product colors — used only where they MEAN the product
BRAND = HexColor('#1075b8')         # MCHL blue
BRAND_LIGHT = HexColor('#34a0ff')
EMERALD = HexColor('#059669')
AMBER = HexColor('#d97706')
RED = HexColor('#dc2626')
GRAY = HexColor('#5b6472')
BLACKC = HexColor('#111111')

PAGE_W, PAGE_H = letter

# ─── Styles ──────────────────────────────────────────────
S = {}
S['eyebrow'] = ParagraphStyle('eb', fontName='JetBrainsMono', fontSize=7.5,
                              textColor=DEEP_SAND, leading=11)
S['h1'] = ParagraphStyle('h1', fontName='SpaceGrotesk-Bold', fontSize=21,
                         textColor=INK, leading=25, spaceAfter=2)
S['h2'] = ParagraphStyle('h2', fontName='SpaceGrotesk-SemiBold', fontSize=12.5,
                         textColor=INK, spaceBefore=13, spaceAfter=4, leading=16)
S['body'] = ParagraphStyle('b', fontName='Inter', fontSize=9.5, textColor=BODY,
                           leading=14.5, spaceAfter=6)
S['bullet'] = ParagraphStyle('bl', parent=S['body'], leftIndent=16,
                             bulletIndent=6, spaceAfter=3)
S['tip'] = ParagraphStyle('tip', fontName='Inter-Italic', fontSize=9,
                          textColor=HexColor('#6B5D48'), leading=13, spaceAfter=6,
                          leftIndent=12)
S['toc'] = ParagraphStyle('toc', fontName='Inter', fontSize=10.5, textColor=INK,
                          leading=21)
S['tcell'] = ParagraphStyle('tc', fontName='Inter', fontSize=8.5, textColor=BODY,
                            leading=11.5)
S['thead'] = ParagraphStyle('th', fontName='SpaceGrotesk-SemiBold', fontSize=8,
                            textColor=DEEP_SAND, leading=10)

def P(text, style='body'): return Paragraph(text, S[style])
def B(text): return Paragraph(f'<font color="#7A6448">•</font>&nbsp; {text}', S['bullet'])
def TIP(text): return Paragraph(f'<font color="#7A6448">◆</font>&nbsp; {text}', S['tip'])
def TH(text): return Paragraph(text.upper(), S['thead'])
def RULE(w=0.75, color=WEATHERED, before=2, after=10):
    return HRFlowable(width='100%', thickness=w, color=color,
                      spaceBefore=before, spaceAfter=after, lineCap='butt')

def section(num, title, eyebrow_extra=''):
    label = f'SECTION {int(num):02d}' if num else 'INDEX'
    if eyebrow_extra:
        label += f' · {eyebrow_extra}'
    return [
        Spacer(1, 2),
        Paragraph(f'{label}', S['eyebrow']),
        Spacer(1, 5),
        Paragraph(title, S['h1']),
        RULE(),
    ]

def styled_table(headers, rows, widths):
    data = [[TH(h) for h in headers]]
    for r in rows:
        data.append([c if not isinstance(c, str) else Paragraph(c, S['tcell']) for c in r])
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), WARM),
        ('LINEBELOW', (0,0), (-1,0), 0.9, WEATHERED),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, HAIR),
        ('TOPPADDING', (0,0), (-1,-1), 5), ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 7), ('RIGHTPADDING', (0,0), (-1,-1), 7),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [PAPER, PAPER2]),
    ]))
    return t

def swatch_table(rows, widths):
    """rows: (hexcolor, label, meaning)"""
    data = [[TH('Color'), TH('Status'), TH('What it means')]]
    styles = [
        ('BACKGROUND', (0,0), (-1,0), WARM),
        ('LINEBELOW', (0,0), (-1,0), 0.9, WEATHERED),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, HAIR),
        ('TOPPADDING', (0,0), (-1,-1), 5), ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 7),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [PAPER, PAPER2]),
    ]
    for i, (color, label, meaning) in enumerate(rows, start=1):
        data.append(['', Paragraph(f'<b>{label}</b>', S['tcell']),
                     Paragraph(meaning, S['tcell'])])
        styles.append(('BACKGROUND', (0,i), (0,i), color))
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle(styles))
    return t

def token_table(rows, widths):
    """rows: (hexcolor, token, hex_label, usage)"""
    data = [[TH(''), TH('Token'), TH('Hex'), TH('Used for')]]
    styles = [
        ('BACKGROUND', (0,0), (-1,0), WARM),
        ('LINEBELOW', (0,0), (-1,0), 0.9, WEATHERED),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, HAIR),
        ('TOPPADDING', (0,0), (-1,-1), 4), ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 7),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [PAPER, PAPER2]),
    ]
    for i, (color, token, hexl, usage) in enumerate(rows, start=1):
        data.append(['', Paragraph(f'<font face="JetBrainsMono"><b>{token}</b></font>', S['tcell']),
                     Paragraph(f'<font face="JetBrainsMono">{hexl}</font>', S['tcell']),
                     Paragraph(usage, S['tcell'])])
        styles.append(('BACKGROUND', (0,i), (0,i), color))
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle(styles))
    return t

# ─── Page furniture ──────────────────────────────────────
def tracked_width(text, font, size, tracking):
    return pdfmetrics.stringWidth(text, font, size) + tracking * max(len(text) - 1, 0)

def tracked(canvas, x, y, text, font, size, tracking, right=False):
    """Letterspaced text (this reportlab lacks canvas.setCharSpace)."""
    if right:
        x -= tracked_width(text, font, size, tracking)
    t = canvas.beginText(x, y)
    t.setFont(font, size)
    t.setCharSpace(tracking)
    t.textOut(text)
    t.setCharSpace(0)  # Tc persists past ET — reset or it leaks into drawString
    canvas.drawText(t)

def paint_bone(canvas):
    canvas.setFillColor(BONE)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)

def on_page(canvas, doc):
    canvas.saveState()
    paint_bone(canvas)
    # running header
    canvas.setStrokeColor(WEATHERED); canvas.setLineWidth(0.6)
    canvas.line(0.8*inch, 10.42*inch, 7.7*inch, 10.42*inch)
    canvas.setFillColor(DEEP_SAND)
    tracked(canvas, 0.8*inch, 10.52*inch, 'SPAS 360 · THE BIBLE', 'JetBrainsMono', 6.5, 0.8)
    tracked(canvas, 7.7*inch, 10.52*inch, 'MAGIC CITY HOME LEISURE', 'JetBrainsMono', 6.5, 0.8, right=True)
    # footer
    canvas.line(0.8*inch, 0.66*inch, 7.7*inch, 0.66*inch)
    tracked(canvas, 0.8*inch, 0.46*inch, 'PREPARED BY NDAI · CONFIDENTIAL', 'JetBrainsMono', 6.5, 0.8)
    tracked(canvas, 7.7*inch, 0.46*inch, f'PAGE {doc.page:02d}', 'JetBrainsMono', 6.5, 0.8, right=True)
    canvas.restoreState()

def draw_pill(canvas, x, y, text, color=DEEP_SAND, border=WEATHERED):
    w = tracked_width(text, 'JetBrainsMono', 7, 0.7) + 20
    canvas.setStrokeColor(border); canvas.setLineWidth(0.8)
    canvas.roundRect(x, y, w, 17, 8.5, stroke=1, fill=0)
    canvas.setFillColor(color)
    tracked(canvas, x + 10, y + 5.4, text, 'JetBrainsMono', 7, 0.7)
    return w

def on_cover(canvas, doc):
    canvas.saveState()
    paint_bone(canvas)

    # eyebrow
    canvas.setFillColor(DEEP_SAND)
    tracked(canvas, 0.82*inch, 10.28*inch,
            'PREPARED BY NDAI · FOR MAGIC CITY HOME LEISURE · MINOT & BISMARCK, ND',
            'SpaceGrotesk-SemiBold', 8.5, 1.6)
    canvas.setStrokeColor(WEATHERED); canvas.setLineWidth(0.8)
    canvas.line(0.8*inch, 10.1*inch, 7.7*inch, 10.1*inch)

    # ink panel holding the product mark (the mark was born on dark — give it dark)
    px, py, pw, ph = 0.8*inch, 6.62*inch, 6.9*inch, 3.14*inch
    canvas.setFillColor(INK)
    canvas.roundRect(px, py, pw, ph, 14, stroke=0, fill=1)

    logo = ImageReader(LOGO)
    lw = 3.15*inch; lh = lw * (227/520)
    canvas.drawImage(logo, px + (pw-lw)/2, py + ph - lh - 0.42*inch, lw, lh,
                     mask='auto')

    canvas.setFillColor(white)
    canvas.setFont('SpaceGrotesk-Bold', 27)
    word = 'SPAS '
    w1 = canvas.stringWidth(word, 'SpaceGrotesk-Bold', 27)
    w2 = canvas.stringWidth('360', 'SpaceGrotesk-Bold', 27)
    wx = px + (pw - w1 - w2)/2
    wy = py + 0.78*inch
    canvas.drawString(wx, wy, word)
    canvas.setFillColor(BRAND_LIGHT)
    canvas.drawString(wx + w1, wy, '360')
    # product-blue baseline under the wordmark — the one accent that means the product
    canvas.setFillColor(BRAND)
    canvas.rect(px + pw/2 - 0.62*inch, wy - 0.17*inch, 1.24*inch, 0.035*inch,
                stroke=0, fill=1)
    canvas.setFillColor(HexColor('#9CA3AF'))
    tag = 'DEALERSHIP COMMAND CENTER'
    tw = tracked_width(tag, 'SpaceGrotesk-SemiBold', 8, 2.2)
    tracked(canvas, px + (pw - tw)/2, py + 0.38*inch, tag, 'SpaceGrotesk-SemiBold', 8, 2.2)

    # the title
    canvas.setFillColor(INK)
    canvas.setFont('SpaceGrotesk-Bold', 56)
    canvas.drawString(0.8*inch, 5.52*inch, 'The Bible.')

    # lede
    canvas.setFillColor(BODY)
    canvas.setFont('Inter', 11.5)
    for i, line in enumerate([
        'The single source of truth — how to run Magic City Home Leisure',
        'on one system, and how to build on it. Sales, service, inventory,',
        'customers, Ari, and the design law.',
    ]):
        canvas.drawString(0.82*inch, 5.05*inch - i*0.26*inch, line)

    # pills
    x = 0.82*inch; y = 3.88*inch
    for text in ['V2.0 · JULY 2026', "OWNER'S GUIDE + DESIGN LAW", 'CONFIDENTIAL']:
        x += draw_pill(canvas, x, y, text) + 10

    # in this book — three columns of six
    canvas.setFillColor(DEEP_SAND)
    tracked(canvas, 0.82*inch, 3.3*inch, 'IN THIS BOOK', 'SpaceGrotesk-SemiBold', 8, 1.8)
    short_toc = [
        'Welcome to SPAS 360', 'Getting Started & Roles', 'Finding Your Way Around',
        'The Dashboard', 'The Deals Board', 'Adding a Customer',
        'Commission Integrity', 'Inventory', 'The Service Schedule',
        'Working a Job', 'Ari — AI Sales Assistant', 'Messages',
        'Customer Texting', 'Reports', 'Settings & Team',
        "Owner's Operations", 'The Design Law', 'Quick Reference',
    ]
    for idx, title in enumerate(short_toc):
        col, row = divmod(idx, 6)
        x = 0.82*inch + col*2.32*inch
        y = 2.96*inch - row*0.26*inch
        canvas.setFont('JetBrainsMono', 7); canvas.setFillColor(DEEP_SAND)
        canvas.drawString(x, y, f'{idx+1:02d}')
        canvas.setFont('Inter', 8.5); canvas.setFillColor(INK)
        canvas.drawString(x + 0.26*inch, y, title)

    # foot
    canvas.setStrokeColor(WEATHERED); canvas.setLineWidth(0.8)
    canvas.line(0.8*inch, 1.28*inch, 7.7*inch, 1.28*inch)
    canvas.setFillColor(DEEP_SAND)
    tracked(canvas, 0.82*inch, 1.02*inch,
            'NDAI · AI SOFTWARE. BUILT FOR YOUR BUSINESS.', 'JetBrainsMono', 7, 0.7)
    tracked(canvas, 7.7*inch, 1.02*inch, 'BUILT HERE. STAYS HERE.', 'JetBrainsMono', 7, 0.7, right=True)
    canvas.restoreState()

# ─── Document ────────────────────────────────────────────
os.makedirs(os.path.dirname(OUT), exist_ok=True)
doc = BaseDocTemplate(OUT, pagesize=letter,
                      leftMargin=0.8*inch, rightMargin=0.8*inch,
                      topMargin=0.78*inch, bottomMargin=0.9*inch,
                      title="The SPAS 360 Bible", author='NDAI')
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='f')
doc.addPageTemplates([
    PageTemplate(id='cover', frames=[Frame(0.8*inch, 1*inch, 6.9*inch, 7.4*inch)], onPage=on_cover),
    PageTemplate(id='page', frames=[frame], onPage=on_page),
])

E = []  # story

# ═══ COVER (drawn entirely on canvas) ═══
E.append(NextPageTemplate('page'))
E.append(PageBreak())

# ═══ TOC ═══
E += section(0, 'Contents')
toc_items = [
    ('1', 'Welcome to SPAS 360'), ('2', 'Getting Started &amp; Roles'), ('3', 'Finding Your Way Around'),
    ('4', 'The Dashboard'), ('5', 'Sales — The Deals Board'), ('6', 'Sales — Adding a Customer'),
    ('7', 'Customer Records &amp; Commission Integrity'), ('8', 'Inventory'),
    ('9', 'Service — The Schedule'), ('10', 'Service — Working a Job'),
    ('11', 'Ari — Your AI Sales Assistant'), ('12', 'Messages'),
    ('13', 'Customer Texting'), ('14', 'Reports'), ('15', 'Settings &amp; Team Management'),
    ('16', 'Owner’s Operations Guide'), ('17', 'The Style Guide — Design Law for Builders'),
    ('18', 'Quick Reference'),
]
for num, t in toc_items:
    E.append(Paragraph(
        f'<font face="JetBrainsMono" color="#7A6448" size="8">{int(num):02d}</font>'
        f'&nbsp;&nbsp;&nbsp;{t}', S['toc']))
E.append(PageBreak())

# ═══ 1. WELCOME ═══
E += section(1, 'Welcome to SPAS 360')
E.append(P("SPAS 360 is the operating system for Magic City Home Leisure. It replaces four separate tools with one "
           "system where every part of the business shares the same data — enter a customer once and they exist "
           "everywhere: on the sales board, the service schedule, the inventory ledger, and in Ari’s memory."))
E.append(styled_table(
    ['It replaces', 'With'],
    [['HubSpot (CRM, pipeline, lead tracking)', 'The Deals board — live kanban with the whiteboard-style sales board on top'],
     ['Jobber (service scheduling, techs)', 'The Service Schedule — same colors, same drag-to-schedule, plus time clock and photos'],
     ['Podium (business texting)', 'Customer texting from the store number, visible to managers (see §13)'],
     ['The Excel inventory workbook', 'Live two-store inventory with real statuses, margins, and search'],
    ], [3.1*inch, 3.4*inch]))
E.append(Spacer(1, 6))
E.append(P("<b>The big idea: two sides, one dataset.</b> The business runs as a Sales side and a Service side — "
           "different people, different workflows — but the data flows between them automatically. When a deal is "
           "won on the sales board, a delivery job appears in the service queue by itself. QuickBooks stays your "
           "accounting system (sync is on the roadmap)."))
E.append(TIP("This book is the single source of truth for how the app works. When something in here looks different "
             "from the app, the app is newer — ask for the Bible to be regenerated."))

# ═══ 2. GETTING STARTED ═══
E.append(PageBreak())
E += section(2, 'Getting Started &amp; Roles')
E.append(P("Go to <b>spas360solo.vercel.app</b> and sign in. The app works in any modern browser on desktop, tablet, "
           "or phone — technicians are expected to live in it on their phones."))
E.append(P('<b>Every person gets a role</b>, and the role decides what they see and where the app opens:', 'body'))
E.append(styled_table(
    ['Role', 'Opens to', 'Can do'],
    [['Owner / Manager', 'Dashboard', 'Everything: all deals and jobs across both stores, inventory editing and deletion, team and role management, customer reassignment, all conversations'],
     ['Service Manager', 'Dashboard', 'Full service side (jobs, scheduling, parts), inventory editing and deletion, sees all customer records'],
     ['Salesperson', 'Deals board', 'Create customers and deals, work their pipeline, edit inventory, use Ari, text customers. Cannot reassign customers or manage the team'],
     ['Technician', 'Service Schedule', 'See jobs, clock in/out, take photos, write notes. No sales or admin surfaces — their app is deliberately simple'],
    ], [1.25*inch, 1.05*inch, 4.2*inch]))
E.append(Spacer(1, 6))
E.append(P("<b>New employees:</b> they create an account at the sign-in screen, and they start as a Salesperson. An "
           "Owner/Manager then sets their real role in <b>Settings → Team &amp; Permissions</b> (one dropdown). "
           "See §15."))

# ═══ 3. NAVIGATION ═══
E.append(PageBreak())
E += section(3, 'Finding Your Way Around')
E.append(P("The top bar is organized around the two sides of the business, and each side wears its color:"))
E.append(B("<b>Dashboard</b> — the manager’s home (neutral)"))
E.append(B("<font color='#1075b8'><b>SALES</b></font> group (blue): <b>Deals</b> and <b>Inventory</b>"))
E.append(B("<font color='#059669'><b>SERVICE</b></font> group (green): <b>Schedule</b>"))
E.append(B("<b>Comms</b> and <b>Reports</b> (neutral)"))
E.append(P("The active page glows in its side’s color — blue means you’re selling, green means you’re serving. "
           "On phones, the same menu lives behind the menu button, top left."))
E.append(Paragraph('The rest of the top bar', S['h2']))
E.append(B("<b>Search (⌘K or Ctrl+K)</b> — search everything at once: customers, deals, jobs, and inventory. "
           "Press Enter to open the top result."))
E.append(B("<b>Location pill</b> — switch between All Locations, Minot, and Bismarck. This filters the whole app: "
           "deals, schedule, and inventory all follow."))
E.append(B("<b>Bell</b> — notifications: team messages, deals won on your customers, inbound texts. Click one to "
           "jump to it; “Mark all read” clears the count."))
E.append(B("<b>Your name</b> — profile, Settings, and Sign Out."))
E.append(Paragraph('The Contacts rail (admin panel)', S['h2']))
E.append(P("On desktop, a slim strip on the right edge expands into the Contacts panel: search any customer, jump to "
           "their card, or start the New Customer flow. It stays collapsed until you need it and remembers your "
           "preference. Technicians don’t see it."))

# ═══ 4. DASHBOARD ═══
E.append(PageBreak())
E += section(4, 'The Dashboard')
E.append(P("The manager’s at-a-glance view. The period selector (This Week / This Month / Last Month) drives the "
           "numbers — nothing on this screen is decorative."))
E.append(B("<b>Total Revenue</b> — real closed-won deal value in the selected period"))
E.append(B("<b>Active Deals</b> — everything open on the board right now"))
E.append(B("<b>Unscheduled Jobs</b> — what’s sitting in the service queue"))
E.append(B("<b>Parts Overdue</b> — parts past their expected arrival"))
E.append(P("<b>Revenue Overview</b> charts closed-won revenue by day (week view) or by week (month views). "
           "<b>Requires Attention</b> lists your overdue tasks and — critically — <b>stagnant parts</b>: any part "
           "past its ETA or ordered 14+ days ago with no ETA shows here with a link straight to its job, so nothing "
           "sits unnoticed for weeks."))
E.append(P("<b>The + New button</b> creates from anywhere: choose <b>New Customer</b> (runs the guided sales intake, "
           "§6) or <b>New Job</b> (jumps to the Schedule with the job form already open and your store pre-selected)."))

# ═══ 5. DEALS BOARD ═══
E.append(PageBreak())
E += section(5, 'Sales — The Deals Board')
E.append(Paragraph('The Live Sales Board', S['h2']))
E.append(P("The scoreboard above the pipeline — the modern version of the whiteboard in the sales meeting. It "
           "updates in real time on every screen the moment a card moves:"))
E.append(B("<b>Open Pipeline</b> — total value on the board; flags money “sitting idle 7d+”"))
E.append(B("<b>Won This Month</b> — closed revenue and deal count"))
E.append(B("<b>Closing This Week</b> — deals with expected close dates in the next 7 days"))
E.append(B("<b>Hot Leads</b> — High-priority deals (could close within a week)"))
E.append(Paragraph('The pipeline (kanban)', S['h2']))
E.append(P("Eleven stages, left to right: No Contact Made → Contact Attempted → Contact Made → Showroom Visit "
           "Scheduled → Showroom Visit Complete → Estimate Sent → In Discussion → Verbal Commitment → "
           "Deposit Received → <b>Closed – Won</b> / <b>Closed – Lost</b>. Drag a card to move it."))
E.append(P("<b>Anatomy of a deal card:</b>"))
E.append(B("Colored left edge = priority (red High, amber Medium, blue Low)"))
E.append(B("Customer name, dollar value, and what they’re interested in"))
E.append(B("<font color='#dc2626'><b>⚠ No follow-up</b></font> — this deal has no open task. House rule: a lead "
           "without a follow-up is an immediate no-no. Fix it on sight."))
E.append(B("<font color='#d97706'><b>“Going cold”</b></font> (amber) — no activity in over 7 days. That’s "
           "money walking out the door."))
E.append(Paragraph('Winning a deal (the handoff)', S['h2']))
E.append(P("Drag a card into <b>Closed – Won</b> and the system does the paperwork: a <b>Delivery job</b> is created "
           "in the service unscheduled queue (titled like “Wyant – Hot Tub – Delivery” with the amount to "
           "collect), the customer is promoted from Lead to Customer, and the service managers get a notification. "
           "Sales never has to remember to tell Service."))

# ═══ 6. WIZARD ═══
E.append(PageBreak())
E += section(6, 'Sales — Adding a Customer')
E.append(P("Every new customer enters through the guided flow (<b>+ New Customer</b> on the Deals board, the "
           "Dashboard, Contacts, or the rail). Five quick steps, chips instead of typing wherever possible, and a "
           "progress bar that starts at 20% because the follow-up step is already pre-filled for you:"))
E.append(B("<b>1. Who is this?</b> Name and phone. As you type, matching existing customers appear — "
           "<b>click a name</b> to open their card instead, or <b>Use for this deal</b> to attach them."))
E.append(B("<b>2. How did they find us?</b> Walk-in, Website, Referral, Ad, Phone, Event, Other. Pick honestly — "
           "this drives marketing decisions."))
E.append(B("<b>3. What are they interested in?</b> Hot Tub, Swim Spa, Sauna, Cold Plunge, Game Room, Parts &amp; "
           "Chemicals — plus an optional estimated value."))
E.append(B("<b>4. How hot?</b> High = could close within a week. Medium = 2–4 weeks. Low = long-term nurture."))
E.append(B("<b>5. First follow-up (required).</b> Defaults to two days out. This is the no-lead-left-behind rule, "
           "enforced by the form itself."))
E.append(P("One tap creates the contact, the deal (in stage one), and the follow-up task together — then lands you "
           "on the board with the new card glowing."))
E.append(TIP("Duplicate protection: if the phone number matches someone already in the system, the wizard shows them "
             "before you can create a twin. No more merging duplicate customers."))

# ═══ 7. OWNERSHIP ═══
E += section(7, 'Customer Records &amp; Commission Integrity')
E.append(P("Every customer belongs to a salesperson, and the system protects that everywhere:"))
E.append(B("The customer card shows an ownership chip — <b>“Andrew’s customer”</b> — at all times."))
E.append(B("Anyone can still edit the record (fix a phone number, add a note), but <b>edits by non-owners are "
           "logged automatically</b> as a visible note: who changed what, with the owner restated."))
E.append(B("If you start a deal on someone else’s customer, the deal and its follow-up task are <b>credited to the "
           "owner</b> — you’re logged as the person who entered it, and the owner gets a notification."))
E.append(B("Only managers can reassign a customer, and reassignment writes a from → to note on the record."))
E.append(P("<b>The principle: nothing is locked, everything is witnessed.</b> Work never stalls waiting for the right "
           "person, and commission disputes are settled by the record, not by memory."))

# ═══ 8. INVENTORY ═══
E.append(PageBreak())
E += section(8, 'Inventory')
E.append(P("The live floor for both stores — the Excel workbook, retired. The store switcher at the top "
           "(<b>All / Minot / Bismarck</b>, with live counts) is the main move; it re-scopes the whole app, not just "
           "this page."))
E.append(P("<b>Stat cards:</b> Total Units in Stock, Sold (Awaiting Delivery), On Order, and Low Stock Alerts "
           "(chemicals running thin). All follow the selected store."))
E.append(Paragraph('Editing', S['h2']))
E.append(B("<b>Quick edits:</b> click any cell in the table (product, category, status, price) and type."))
E.append(B("<b>The full editor (pencil icon or Add Item):</b> a side panel with chips for brand, category, store, "
           "and status; pricing with a <b>live margin readout</b> (sale minus cost, in dollars and percent); dates; "
           "warranty; notes."))
E.append(B("<b>Mark Sold:</b> one tap sets the status, stamps the date, and asks which customer bought it — "
           "linking the unit to their record."))
E.append(B("<b>Delete</b> (managers only): two-step confirm. Gone means gone."))
E.append(Spacer(1, 4))
E.append(styled_table(
    ['Inventory status', 'Meaning'],
    [['In Stock', 'On the floor or in the warehouse, sellable (includes floor models — noted on the unit)'],
     ['Sold', 'Sold, still on our hands — awaiting delivery'],
     ['On Order', 'Ordered from the manufacturer, not yet arrived (order refs in the notes)'],
     ['In Transit', 'Shipping to us'],
     ['Delivered', 'In the customer’s backyard — out of inventory'],
     ['Returned', 'Came back; needs disposition'],
    ], [1.5*inch, 5*inch]))
E.append(Spacer(1, 4))
E.append(TIP("When a discounted unit has an MSRP, the price column shows the MSRP struck through next to the sale "
             "price — the shelf-tag talking point, built in."))

# ═══ 9. SCHEDULE ═══
E.append(PageBreak())
E += section(9, 'Service — The Schedule')
E.append(P("Built to feel like the Jobber board the crew knows — same color language, same drag-to-schedule — "
           "with the queue on the right and the calendar front and center. Day, Week, and Month views; phones open "
           "to Day."))
E.append(swatch_table([
    (RED, 'Delivery', 'A delivery to get on the truck'),
    (AMBER, 'Warranty', 'Warranty work'),
    (BLACKC, 'Parts on Order', 'THE part hasn’t arrived — black means we’re waiting. Check these daily.'),
    (BRAND, 'In Progress', 'Standard service work'),
    (EMERALD, 'Ready for Pickup', 'Done and waiting on the customer'),
    (GRAY, 'Completed (struck through)', 'Finished — struck through, just like the old board'),
], [0.8*inch, 1.9*inch, 3.8*inch]))
E.append(Spacer(1, 6))
E.append(Paragraph('Drag to schedule — the core move', S['h2']))
E.append(B("Drag a job from the <b>Unscheduled queue</b> onto any day — it lands at 9:00 AM (set the exact time on "
           "the job page)"))
E.append(B("Drag a scheduled job to a different day to reschedule — its time comes with it"))
E.append(B("Drag a job back into the queue to unschedule it"))
E.append(P("<b>The color legend is a filter:</b> click any status chip above the calendar to show only those jobs; "
           "counts update live. Click again to clear. Every day shows its visit count, just like the old board."))
E.append(P("<b>New Job</b> pre-selects the store you’re working in, and the title writes itself in the house format "
           "— pick the customer and type and it becomes “Wyant – Delivery” (edit it and it stays yours)."))

# ═══ 10. JOB ═══
E += section(10, 'Service — Working a Job')
E.append(P("Tap any job to open it. Built for a phone in one hand:"))
E.append(B("<b>Time clock, top of the page:</b> big green <b>Start Job</b> on arrival, live timer while working, red "
           "<b>Stop Job</b> when done. Total time and session count show on the job."))
E.append(B("<b>Photos:</b> the Add Photo button opens the camera directly. Tag each shot — Proof of Delivery, "
           "Damage, Serial Number, Before, After — and it lands in the job’s gallery. Photos are compressed "
           "on the phone so they don’t eat your data plan."))
E.append(B("<b>Notes:</b> the running log — “delivery went well, customer paid by check” or the part number "
           "that’s needed. Every note is signed and timestamped."))
E.append(B("<b>Click-to-edit everything:</b> status, type, schedule time, amount to collect — click the value, "
           "change it, done."))

# ═══ 11. ARI ═══
E.append(PageBreak())
E += section(11, 'Ari — Your AI Sales Assistant')
E.append(P("Ari is the sales brain in the chat bubble (bottom-right, everywhere). He’s named for the most "
           "tenacious closer in the business, and he acts like it — a lead going cold offends him. He is a work "
           "tool: ask him anything about customers, deals, products, or selling, and he answers from the store’s "
           "live data. Ask him anything else and he’ll politely steer you back to work."))
E.append(Paragraph('What Ari does', S['h2']))
E.append(B("<b>Knows your pipeline:</b> “What deals do I have going?” — “Pull up the Wyant deal” — he reads "
           "the live board, the customer’s history, notes, and open tasks before answering."))
E.append(B("<b>Drafts documents, ready to copy:</b> one-page proposals (with the MSRP anchor built in), special "
           "offers with real expiry dates, trade-in offers, follow-up texts, and five kinds of email — "
           "post-visit follow-up, proposal cover, 30-day re-engagement, delivery confirmation, review request."))
E.append(B("<b>Coaches objections:</b> “they said it’s too expensive” gets you the reframe and the exact words "
           "— price-per-day math, total cost of ownership vs. buying online, the spouse play, the "
           "think-about-it isolation. Ask for an Objection Response Card to keep."))
E.append(B("<b>Works the records:</b> he can create contacts, deals, notes, and tasks, move deal stages, and "
           "schedule jobs — always confirming before he writes anything."))
E.append(Paragraph('Conversations', S['h2']))
E.append(P("Every chat with Ari is saved as a conversation. The clock icon opens your history (titled by your first "
           "message); the pencil-square starts a fresh one; hover a conversation to delete it. Opening the bubble "
           "resumes where you left off."))
E.append(Paragraph('What Ari won’t do', S['h2']))
E.append(B("Invent numbers — anything he can’t verify comes back as [CONFIRM: …] for you to fill"))
E.append(B("Discounts over 15% — he flags those for a manager"))
E.append(B("Suggest reassigning someone’s customer — that’s a manager action"))
E.append(B("Chit-chat, homework, or roleplay — he’s on the clock"))

# ═══ 12. MESSAGES ═══
E += section(12, 'Messages')
E.append(P("The chat bubble is one communication surface for the whole team. The back arrow from any chat opens the "
           "<b>Messages directory</b>: Ari at the top (he’s a teammate who happens to be an agent — always on), "
           "the <b>Main</b> channel that reaches everyone, your recent one-on-ones, and the team roster. Team "
           "messages update live on everyone’s screen and ring the bell for people who aren’t looking."))

# ═══ 13. TEXTING ═══
E.append(PageBreak())
E += section(13, 'Customer Texting')
E.append(P("The house rule stands: <b>no customer contact from personal phones.</b> SPAS 360 texts from the business "
           "number <b>(701) 929-9194</b>, and every conversation is visible to management in <b>Comms → Customer "
           "Messages</b> — accountability and coaching, built in."))
E.append(B("Send from any customer’s SMS thread; delivery failures show up honestly instead of pretending"))
E.append(B("Inbound texts file themselves to the right customer by phone number; unknown numbers automatically "
           "become new Leads so nothing is ever lost"))
E.append(B("The assigned salesperson and managers get notified on every inbound text"))
E.append(TIP("Activation status: the pipeline is built and deployed. To switch it on: add the Twilio credentials in "
             "Vercel (see §16), point the Twilio webhook at /api/sms-inbound, and complete A2P 10DLC business "
             "registration (register Magic City Home Leisure as the brand) to text real customers. Until then, "
             "texting works only to verified test numbers."))

# ═══ 14. REPORTS ═══
E += section(14, 'Reports')
E.append(P("The numbers, period-selectable like the dashboard: <b>Closed Revenue</b>, <b>Open Pipeline</b>, <b>Open "
           "Jobs</b>, and <b>In-Stock Value</b> up top; then revenue by location (Minot vs. Bismarck), pipeline value "
           "by stage, service jobs by status, and inventory by status with an aging view of how long in-stock units "
           "have been sitting (0–30, 31–90, 90+ days). Everything reconciles with the pages it summarizes — "
           "same data, same math."))

# ═══ 15. SETTINGS/TEAM ═══
E += section(15, 'Settings &amp; Team Management')
E.append(P("<b>Team &amp; Permissions</b> (Owner/Manager only) is where people management happens: every teammate "
           "with a role dropdown and a home-store dropdown. New signups appear here as Salesperson — set their "
           "real role once and they’re fully equipped. You can’t demote yourself, so you can’t lock yourself "
           "out. Settings also shows your profile, both store locations, and Sign Out."))
E.append(P("<b>Adding an employee, start to finish:</b> (1) they sign up at the login page → (2) you set their role "
           "in Team &amp; Permissions → (3) set their home store so their forms default correctly. Done."))

# ═══ 16. OWNER OPS ═══
E.append(PageBreak())
E += section(16, 'Owner’s Operations Guide')
E.append(Paragraph('The accounts behind the app', S['h2']))
E.append(styled_table(
    ['Service', 'What it runs', 'Cost'],
    [['Vercel (project: spas_360_solo)', 'The app itself — updates deploy automatically', 'Plan-dependent'],
     ['Supabase (project: spas-360)', 'Database, sign-ins, file storage, realtime', '$10/month'],
     ['Twilio (+1 701 929 9194)', 'Business texting', 'Number ~$1.15/mo + per-message + A2P fees'],
     ['GitHub (spas_360_solo)', 'The code', 'Free'],
     ['AI provider (Gemini / GLM / Claude)', 'Ari’s brain — switchable without changing the app', 'Usage-based'],
    ], [2.1*inch, 2.9*inch, 1.5*inch]))
E.append(Spacer(1, 8))
E.append(Paragraph('Open items (do these before wide rollout)', S['h2']))
E.append(B("<b>1. Lock down open sign-up.</b> Anyone with the URL can currently create an account that joins the "
           "company. Disable public signups in Supabase Auth settings once the team is aboard — this is the "
           "most important security item."))
E.append(B("<b>2. Activate texting.</b> Vercel → Settings → Environment Variables: add TWILIO_ACCOUNT_SID, "
           "TWILIO_AUTH_TOKEN, TWILIO_FROM, SUPABASE_SERVICE_ROLE_KEY; redeploy; set the Twilio webhook to "
           "https://spas360solo.vercel.app/api/sms-inbound; complete A2P 10DLC registration."))
E.append(B("<b>3. Import the Bismarck inventory tab</b> (Minot and Used are already loaded — 110 units)."))
E.append(Paragraph('Security model, in one paragraph', S['h2']))
E.append(P("Every piece of data is protected at the database level (row-level security): people only see their "
           "company’s data, tasks are visible to their owner and managers, notifications are private, deletion "
           "rights are manager-only where it matters, and job photos live in storage with unguessable addresses. "
           "The AI guardrails are enforced on the server — they can’t be stripped from a browser."))
E.append(Paragraph('Roadmap', S['h2']))
E.append(P("QuickBooks sync (customers/estimates first) · install-to-home-screen app for techs · automatic "
           "reminders for stagnant parts and overdue follow-ups · @Ari in team channels · role-based page "
           "restrictions beyond landing pages."))

# ═══ 17. STYLE GUIDE ═══
E.append(PageBreak())
E += section(17, 'The Style Guide — Design Law for Builders')
E.append(P("This chapter is for anyone — human or AI agent — who builds on SPAS 360. These aren’t suggestions; "
           "they are the design law that keeps the product feeling like one hand made it. The deep engineering "
           "companion (architecture, gotchas, infrastructure IDs) is <b>HANDOFF.md</b> in the repo root; this "
           "chapter is the visual and experiential contract. (The app itself is dark-mode ink; this document is "
           "printed on NDAI’s warm-light trust ground — don’t confuse the two systems.)"))

E.append(Paragraph('Design tokens — use these names, never raw palette colors', S['h2']))
E.append(P("All colors are Tailwind v4 tokens defined in <font face='JetBrainsMono'>src/index.css</font>. If you type a "
           "raw Tailwind color (slate-, sky-, gray-) for a surface or accent, you’re doing it wrong."))
E.append(token_table([
    (HexColor('#0a0a0f'), 'ink-950', '#0a0a0f', 'Page background'),
    (HexColor('#111116'), 'ink-900', '#111116', 'Cards, panels, the header'),
    (HexColor('#16161B'), 'ink-850', '#16161B', 'Raised surfaces, dropdowns'),
    (HexColor('#1E1E24'), 'ink-800', '#1E1E24', 'Hover states'),
    (HexColor('#2A2A32'), 'ink-700', '#2A2A32', 'Borders (the default)'),
    (HexColor('#6B7280'), 'ink-500', '#6B7280', 'Muted text, labels'),
    (HexColor('#9CA3AF'), 'ink-400', '#9CA3AF', 'Secondary text'),
    (HexColor('#F0F0F0'), 'ink-100', '#F0F0F0', 'Primary text'),
], [0.55*inch, 1.1*inch, 0.95*inch, 3.9*inch]))
E.append(Spacer(1, 6))
E.append(token_table([
    (HexColor('#34a0ff'), 'brand-400', '#34a0ff', 'Accent text, active icons, links'),
    (HexColor('#1075b8'), 'brand-500', '#1075b8', 'THE brand blue (from magiccityhomeleisure.com) — primary buttons, active states'),
    (HexColor('#0d629b'), 'brand-600', '#0d629b', 'Button hover (hover always darkens)'),
    (HexColor('#002e56'), 'brand-900', '#002e56', 'Deep navy — gradients, cover art'),
], [0.55*inch, 1.1*inch, 0.95*inch, 3.9*inch]))
E.append(Spacer(1, 6))
E.append(P("<b>Functional colors:</b> emerald = go/success/Service side · amber = warning/idle/sold-awaiting · "
           "red = urgent/delivery/destructive · purple = on-order · black chip = parts-not-arrived (Brandon’s rule). "
           "Status tints on dark are always <font face='JetBrainsMono'>color-500/15</font> backgrounds with "
           "<font face='JetBrainsMono'>color-300</font> text — never light pastel fills."))

E.append(Paragraph('Typography', S['h2']))
E.append(B("<b>Inter</b> for everything. Weights do the talking: bold for values and names, semibold for actions, regular for body."))
E.append(B("<b>JetBrains Mono</b> for money and scoreboard numerals only (deal amounts, the live board) — never for prose."))
E.append(B("Labels above data: 10–11px, bold, uppercase, tracked wide, <font face='JetBrainsMono'>ink-500</font>."))

E.append(Paragraph('Component language', S['h2']))
E.append(B("<b>Cards:</b> <font face='JetBrainsMono'>bg-ink-900 · border-ink-700 · rounded-xl</font>. Hover: border tints brand. No drop-shadow theatrics on dark."))
E.append(B("<b>Chips for choices:</b> anything with ≤ 8 options is chips, not a dropdown (the wizard, the editor, the legend). Active chip = <font face='JetBrainsMono'>brand-500/15 bg + brand-500 border + brand-300 text</font>."))
E.append(B("<b>Primary buttons:</b> <font face='JetBrainsMono'>bg-brand-500 hover:bg-brand-600</font>, white text, rounded-lg, with a leading icon. One primary action per view."))
E.append(B("<b>Nav tones:</b> Sales cluster wears brand blue, Service wears emerald, everything else stays neutral ink — defined once in <font face='JetBrainsMono'>NAV_TONE</font> (Header.tsx)."))
E.append(B("<b>Destructive actions:</b> always two-step inline confirm (Keep / Delete) — never a browser alert, never one-tap."))
E.append(B("<b>Empty states:</b> icon + one honest sentence + what to do next. NEVER fake data, random numbers, or decorative dead controls."))

E.append(Paragraph('The UX doctrine', S['h2']))
E.append(B("<b>Reliability first.</b> Real data or an honest empty state. Errors fail loudly in plain English — no raw JSON, no silent failure. If a write can be denied, verify it happened."))
E.append(B("<b>Jobber familiarity is a feature.</b> The crew’s muscle memory (colors, drag-to-schedule, queue-on-the-right, strikethrough-done) is load-bearing. Don’t modernize it away."))
E.append(B("<b>Psychology, honestly applied:</b> smart defaults everywhere a value is predictable · endowed progress only when genuinely pre-completed · show people the thing they just built (highlight pulse) · loss-frame idle money (“going cold”) · anchor prices with struck-through MSRP. Never fake urgency or progress."))
E.append(B("<b>Every screen works at 375px.</b> Techs live on phones. Test mobile before shipping."))
E.append(B("<b>Nothing locked, everything witnessed:</b> prefer attribution (logged notes) over permission walls, except where money or data loss demands a manager gate."))

E.append(Paragraph('Voice &amp; writing', S['h2']))
E.append(B("North Dakota friendly, big-league competent. Short sentences. Verbs first on buttons (“Add Item”, “Mark Sold”)."))
E.append(B("Speak the trade’s language: visits, the queue, the board, going cold, parts on order."))
E.append(B("Ari stays professional-tenacious; his guardrails live server-side (api/_lib/rails.ts) and are the template for every future NDAI agent."))

# ═══ 18. QUICK REFERENCE ═══
E.append(PageBreak())
E += section(18, 'Quick Reference')
E.append(styled_table(
    ['Do this', 'How'],
    [['Search anything', '⌘K (Mac) / Ctrl+K (Windows), or the Search pill'],
     ['Switch stores', 'Location pill (top right) or the store switcher on Inventory'],
     ['Add a customer', '+ New Customer (Deals, Dashboard, Contacts, or the rail)'],
     ['Add a job', '+ New Job on the Schedule, or Dashboard → + New → New Job'],
     ['Schedule a job', 'Drag it from the Unscheduled queue onto a day'],
     ['Win a deal', 'Drag the card to Closed – Won — the delivery job creates itself'],
     ['Clock in on a job', 'Open the job → green Start Job button'],
     ['Job photos', 'Open the job → Add Photo (opens the camera, tag the shot)'],
     ['Ask Ari', 'Chat bubble, bottom right — he opens to your last conversation'],
     ['Draft a proposal', 'Ask Ari: “draft a 1-page proposal for [customer]”'],
     ['Text a customer', 'Comms → Customer Messages → their thread'],
     ['Promote an employee', 'Settings → Team &amp; Permissions → role dropdown'],
     ['Mark inventory sold', 'Inventory → pencil → Mark Sold → pick the customer'],
    ], [2.3*inch, 4.2*inch]))
E.append(Spacer(1, 10))
E.append(P("<b>Priorities:</b> High = could close within a week · Medium = 2–4 weeks · Low = long-term nurture"))
E.append(P("<b>House rules the app enforces:</b> every lead gets a follow-up task · no discounts over 15% without a "
           "manager · no customer contact from personal phones · the customer stays with their salesperson"))
E.append(Spacer(1, 18))
E.append(Paragraph('SPAS 360 · BUILT FOR MAGIC CITY HOME LEISURE · PREPARED BY NDAI · THE BIBLE V2.0 · JULY 2026',
                   ParagraphStyle('end', fontName='JetBrainsMono', fontSize=7,
                                  textColor=DEEP_SAND, alignment=TA_CENTER)))

doc.build(E)
import subprocess
print("PDF built:", OUT)
print(subprocess.run(['du', '-h', OUT], capture_output=True, text=True).stdout.strip())
from pypdf import PdfReader
print("pages:", len(PdfReader(OUT).pages))
