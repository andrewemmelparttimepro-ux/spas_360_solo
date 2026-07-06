#!/usr/bin/env python3
"""SPAS 360 Owner's Manual — comprehensive, branded PDF."""
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak,
    Table, TableStyle, KeepTogether,
)

# ─── Brand ───────────────────────────────────────────────
BRAND = HexColor('#1075b8')       # MCHL blue
BRAND_LIGHT = HexColor('#34a0ff')
NAVY = HexColor('#002e56')
INK = HexColor('#1a1a20')
GRAY = HexColor('#5b6472')
LIGHT = HexColor('#eef4f9')
BORDER = HexColor('#d5dde5')
EMERALD = HexColor('#059669')
AMBER = HexColor('#d97706')
RED = HexColor('#dc2626')
PURPLE = HexColor('#7c3aed')
BLACKC = HexColor('#111111')

OUT = "/Users/andrewemmel/Desktop/antigravity/spas_360_solo/docs/SPAS360-Owners-Manual.pdf"

# ─── Styles ──────────────────────────────────────────────
S = {}
S['cover_title'] = ParagraphStyle('ct', fontName='Helvetica-Bold', fontSize=42, textColor=white, leading=48)
S['cover_sub'] = ParagraphStyle('cs', fontName='Helvetica', fontSize=15, textColor=HexColor('#9fc9e8'), leading=20)
S['cover_meta'] = ParagraphStyle('cm', fontName='Helvetica', fontSize=10, textColor=HexColor('#7aa8cc'), leading=15)
S['h1'] = ParagraphStyle('h1', fontName='Helvetica-Bold', fontSize=21, textColor=NAVY, spaceBefore=10, spaceAfter=6, leading=25)
S['h2'] = ParagraphStyle('h2', fontName='Helvetica-Bold', fontSize=13.5, textColor=BRAND, spaceBefore=13, spaceAfter=4, leading=17)
S['body'] = ParagraphStyle('b', fontName='Helvetica', fontSize=10, textColor=INK, leading=14.5, spaceAfter=6)
S['bullet'] = ParagraphStyle('bl', parent=S['body'], leftIndent=16, bulletIndent=6, spaceAfter=3)
S['tip'] = ParagraphStyle('tip', fontName='Helvetica-Oblique', fontSize=9.5, textColor=GRAY, leading=13, spaceAfter=6,
                          leftIndent=10, borderPadding=6)
S['toc'] = ParagraphStyle('toc', fontName='Helvetica', fontSize=11, textColor=INK, leading=20)
S['tocsec'] = ParagraphStyle('tocsec', fontName='Helvetica-Bold', fontSize=11, textColor=NAVY, leading=22)
S['tcell'] = ParagraphStyle('tc', fontName='Helvetica', fontSize=9, textColor=INK, leading=12)
S['tcellb'] = ParagraphStyle('tcb', fontName='Helvetica-Bold', fontSize=9, textColor=INK, leading=12)
S['tcellw'] = ParagraphStyle('tcw', fontName='Helvetica-Bold', fontSize=9, textColor=white, leading=12)

def P(text, style='body'): return Paragraph(text, S[style])
def B(text): return Paragraph(f'• {text}', S['bullet'])
def TIP(text): return Paragraph(f'&#9432;&nbsp; {text}', S['tip'])

def section(num, title):
    t = Table([[Paragraph(f'<font color="#ffffff"><b>{num}</b></font>', S['tcellw']),
                Paragraph(f'<b>{title}</b>', ParagraphStyle('st', fontName='Helvetica-Bold', fontSize=17, textColor=NAVY))]],
              colWidths=[0.42*inch, 6.1*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,0), BRAND),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN', (0,0), (0,0), 'CENTER'),
        ('TOPPADDING', (0,0), (-1,-1), 6), ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (1,0), (1,0), 10),
        ('LINEBELOW', (0,0), (-1,0), 1.5, BRAND),
    ]))
    return [Spacer(1, 4), t, Spacer(1, 10)]

def styled_table(headers, rows, widths, header_bg=NAVY):
    data = [[Paragraph(f'<b>{h}</b>', S['tcellw']) for h in headers]]
    for r in rows:
        data.append([c if not isinstance(c, str) else Paragraph(c, S['tcell']) for c in r])
    t = Table(data, colWidths=widths, repeatRows=1)
    style = [
        ('BACKGROUND', (0,0), (-1,0), header_bg),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 5), ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 7), ('RIGHTPADDING', (0,0), (-1,-1), 7),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [white, LIGHT]),
    ]
    t.setStyle(TableStyle(style))
    return t

def swatch_table(rows, widths):
    """rows: (hexcolor, label_paragraph_text, meaning)"""
    data = [[Paragraph('<b>Color</b>', S['tcellw']), Paragraph('<b>Status</b>', S['tcellw']), Paragraph('<b>What it means</b>', S['tcellw'])]]
    styles = [
        ('BACKGROUND', (0,0), (-1,0), NAVY),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 5), ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 7),
    ]
    for i, (color, label, meaning) in enumerate(rows, start=1):
        data.append(['', Paragraph(f'<b>{label}</b>', S['tcell']), Paragraph(meaning, S['tcell'])])
        styles.append(('BACKGROUND', (0,i), (0,i), color))
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle(styles))
    return t

# ─── Page furniture ──────────────────────────────────────
def on_page(canvas, doc):
    canvas.saveState()
    if doc.page > 1:
        canvas.setStrokeColor(BORDER); canvas.setLineWidth(0.5)
        canvas.line(0.8*inch, 0.62*inch, 7.7*inch, 0.62*inch)
        canvas.setFont('Helvetica', 8); canvas.setFillColor(GRAY)
        canvas.drawString(0.8*inch, 0.45*inch, 'SPAS 360 Owner’s Manual  ·  Magic City Home Leisure')
        canvas.drawRightString(7.7*inch, 0.45*inch, f'Page {doc.page}')
        canvas.setFillColor(BRAND)
        canvas.rect(0, 10.85*inch, 8.5*inch, 0.06*inch, stroke=0, fill=1)
    canvas.restoreState()

def on_cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(NAVY); canvas.rect(0, 0, 8.5*inch, 11*inch, stroke=0, fill=1)
    canvas.setFillColor(HexColor('#03294a')); canvas.rect(0, 0, 8.5*inch, 3.4*inch, stroke=0, fill=1)
    canvas.setFillColor(BRAND); canvas.rect(0.8*inch, 7.55*inch, 1.15*inch, 0.075*inch, stroke=0, fill=1)
    # water-drop-ish mark: three circles
    canvas.setStrokeColor(HexColor('#3d8ec4')); canvas.setLineWidth(2.2)
    for dx in (-0.42, 0, 0.42):
        canvas.circle(4.25*inch + dx*inch, 9.35*inch, 0.42*inch, stroke=1, fill=0)
    canvas.setFillColor(BRAND_LIGHT)
    canvas.circle(4.25*inch, 9.35*inch, 0.13*inch, stroke=0, fill=1)
    canvas.restoreState()

# ─── Document ────────────────────────────────────────────
import os
os.makedirs(os.path.dirname(OUT), exist_ok=True)
doc = BaseDocTemplate(OUT, pagesize=letter,
                      leftMargin=0.8*inch, rightMargin=0.8*inch,
                      topMargin=0.75*inch, bottomMargin=0.85*inch,
                      title="SPAS 360 Owner's Manual", author='NDAI')
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='f')
doc.addPageTemplates([
    PageTemplate(id='cover', frames=[Frame(0.8*inch, 1*inch, 6.9*inch, 7.4*inch)], onPage=on_cover),
    PageTemplate(id='page', frames=[frame], onPage=on_page),
])

E = []  # story

# ═══ COVER ═══
E.append(Spacer(1, 1.2*inch))
E.append(Paragraph("SPAS <font color='#34a0ff'>360</font>", S['cover_title']))
E.append(Spacer(1, 10))
E.append(Paragraph("Owner’s Manual", ParagraphStyle('ct2', fontName='Helvetica-Bold', fontSize=26, textColor=white, leading=32)))
E.append(Spacer(1, 22))
E.append(Paragraph("The complete guide to running Magic City Home Leisure on one system — sales, service, inventory, customers, and Ari.", S['cover_sub']))
E.append(Spacer(1, 2.1*inch))
E.append(Paragraph("Version 1.0 · July 2026", S['cover_meta']))
E.append(Paragraph("Minot &amp; Bismarck, North Dakota", S['cover_meta']))
E.append(Paragraph("Powered by NDAI", S['cover_meta']))
E.append(PageBreak())

# switch template
from reportlab.platypus import NextPageTemplate
E.insert(len(E)-1, NextPageTemplate('page'))

# ═══ TOC ═══
E += section('', 'Contents')
toc_items = [
    ('1', 'Welcome to SPAS 360'), ('2', 'Getting Started &amp; Roles'), ('3', 'Finding Your Way Around'),
    ('4', 'The Dashboard'), ('5', 'Sales — The Deals Board'), ('6', 'Sales — Adding a Customer'),
    ('7', 'Customer Records &amp; Commission Integrity'), ('8', 'Inventory'),
    ('9', 'Service — The Schedule'), ('10', 'Service — Working a Job'),
    ('11', 'Ari — Your AI Sales Assistant'), ('12', 'Messages'),
    ('13', 'Customer Texting'), ('14', 'Reports'), ('15', 'Settings &amp; Team Management'),
    ('16', 'Owner’s Operations Guide'), ('17', 'Quick Reference'),
]
for num, t in toc_items:
    E.append(Paragraph(f'<font color="#1075b8"><b>{num}.</b></font>&nbsp;&nbsp;{t}', S['toc']))
E.append(PageBreak())

# ═══ 1. WELCOME ═══
E += section('1', 'Welcome to SPAS 360')
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
E.append(TIP("This manual is the single source of truth for how the app works. When something in here looks different "
             "from the app, the app is newer — ask for the manual to be regenerated."))

# ═══ 2. GETTING STARTED ═══
E.append(PageBreak())
E += section('2', 'Getting Started & Roles')
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
E += section('3', 'Finding Your Way Around')
E.append(P("The top bar is organized around the two sides of the business, and each side wears its color:"))
E.append(B("<b>Dashboard</b> — the manager’s home (neutral)"))
E.append(B("<font color='#1075b8'><b>SALES</b></font> group (blue): <b>Deals</b> and <b>Inventory</b>"))
E.append(B("<font color='#059669'><b>SERVICE</b></font> group (green): <b>Schedule</b>"))
E.append(B("<b>Comms</b> and <b>Reports</b> (neutral)"))
E.append(P("The active page glows in its side’s color — blue means you’re selling, green means you’re serving. "
           "On phones, the same menu lives behind the ☰ button."))
E.append(Paragraph('<b>The rest of the top bar</b>', S['h2']))
E.append(B("<b>Search (⌘K or Ctrl+K)</b> — search everything at once: customers, deals, jobs, and inventory. "
           "Press Enter to open the top result."))
E.append(B("<b>Location pill</b> — switch between All Locations, Minot, and Bismarck. This filters the whole app: "
           "deals, schedule, and inventory all follow."))
E.append(B("<b>Bell</b> — notifications: team messages, deals won on your customers, inbound texts. Click one to "
           "jump to it; “Mark all read” clears the count."))
E.append(B("<b>Your name</b> — profile, Settings, and Sign Out."))
E.append(Paragraph('<b>The Contacts rail (admin panel)</b>', S['h2']))
E.append(P("On desktop, a slim strip on the right edge expands into the Contacts panel: search any customer, jump to "
           "their card, or start the New Customer flow. It stays collapsed until you need it and remembers your "
           "preference. Technicians don’t see it."))

# ═══ 4. DASHBOARD ═══
E.append(PageBreak())
E += section('4', 'The Dashboard')
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
E += section('5', 'Sales — The Deals Board')
E.append(Paragraph('<b>The Live Sales Board</b>', S['h2']))
E.append(P("The scoreboard above the pipeline — the modern version of the whiteboard in the sales meeting. It "
           "updates in real time on every screen the moment a card moves:"))
E.append(B("<b>Open Pipeline</b> — total value on the board; flags money “sitting idle 7d+”"))
E.append(B("<b>Won This Month</b> — closed revenue and deal count"))
E.append(B("<b>Closing This Week</b> — deals with expected close dates in the next 7 days"))
E.append(B("<b>Hot Leads</b> — High-priority deals (could close within a week)"))
E.append(Paragraph('<b>The pipeline (kanban)</b>', S['h2']))
E.append(P("Eleven stages, left to right: No Contact Made → Contact Attempted → Contact Made → Showroom Visit "
           "Scheduled → Showroom Visit Complete → Estimate Sent → In Discussion → Verbal Commitment → "
           "Deposit Received → <b>Closed – Won</b> / <b>Closed – Lost</b>. Drag a card to move it."))
E.append(P("<b>Anatomy of a deal card:</b>"))
E.append(B("Colored left edge = priority (red High, amber Medium, blue Low)"))
E.append(B("Customer name, dollar value, and what they’re interested in"))
E.append(B("<font color='#dc2626'><b>⚠ No follow-up</b></font> — this deal has no open task. House rule: a lead "
           "without a follow-up is an immediate no-no. Fix it on sight."))
E.append(B("<font color='#d97706'><b>❄ Nd idle — going cold</b></font> — no activity in over 7 days. That’s "
           "money walking out the door."))
E.append(Paragraph('<b>Winning a deal (the handoff)</b>', S['h2']))
E.append(P("Drag a card into <b>Closed – Won</b> and the system does the paperwork: a <b>Delivery job</b> is created "
           "in the service unscheduled queue (titled like “Wyant – Hot Tub – Delivery” with the amount to "
           "collect), the customer is promoted from Lead to Customer, and the service managers get a notification. "
           "Sales never has to remember to tell Service."))

# ═══ 6. WIZARD ═══
E.append(PageBreak())
E += section('6', 'Sales — Adding a Customer')
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
E += section('7', 'Customer Records &amp; Commission Integrity')
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
E += section('8', 'Inventory')
E.append(P("The live floor for both stores — the Excel workbook, retired. The store switcher at the top "
           "(<b>All / Minot / Bismarck</b>, with live counts) is the main move; it re-scopes the whole app, not just "
           "this page."))
E.append(P("<b>Stat cards:</b> Total Units in Stock, Sold (Awaiting Delivery), On Order, and Low Stock Alerts "
           "(chemicals running thin). All follow the selected store."))
E.append(Paragraph('<b>Editing</b>', S['h2']))
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
E += section('9', 'Service — The Schedule')
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
E.append(Paragraph('<b>Drag to schedule — the core move</b>', S['h2']))
E.append(B("Drag a job from the <b>Unscheduled queue</b> onto any day — it lands at 9:00 AM (set the exact time on "
           "the job page)"))
E.append(B("Drag a scheduled job to a different day to reschedule — its time comes with it"))
E.append(B("Drag a job back into the queue to unschedule it"))
E.append(P("<b>The color legend is a filter:</b> click any status chip above the calendar to show only those jobs; "
           "counts update live. Click again to clear. Every day shows its visit count, just like the old board."))
E.append(P("<b>New Job</b> pre-selects the store you’re working in, and the title writes itself in the house format "
           "— pick the customer and type and it becomes “Wyant – Delivery” (edit it and it stays yours)."))

# ═══ 10. JOB ═══
E += section('10', 'Service — Working a Job')
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
E += section('11', 'Ari — Your AI Sales Assistant')
E.append(P("Ari is the sales brain in the chat bubble (bottom-right, everywhere). He’s named for the most "
           "tenacious closer in the business, and he acts like it — a lead going cold offends him. He is a work "
           "tool: ask him anything about customers, deals, products, or selling, and he answers from the store’s "
           "live data. Ask him anything else and he’ll politely steer you back to work."))
E.append(Paragraph('<b>What Ari does</b>', S['h2']))
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
E.append(Paragraph('<b>Conversations</b>', S['h2']))
E.append(P("Every chat with Ari is saved as a conversation. The clock icon opens your history (titled by your first "
           "message); the pencil-square starts a fresh one; hover a conversation to delete it. Opening the bubble "
           "resumes where you left off."))
E.append(Paragraph('<b>What Ari won’t do</b>', S['h2']))
E.append(B("Invent numbers — anything he can’t verify comes back as [CONFIRM: …] for you to fill"))
E.append(B("Discounts over 15% — he flags those for a manager"))
E.append(B("Suggest reassigning someone’s customer — that’s a manager action"))
E.append(B("Chit-chat, homework, or roleplay — he’s on the clock"))

# ═══ 12. MESSAGES ═══
E += section('12', 'Messages')
E.append(P("The chat bubble is one communication surface for the whole team. The back arrow from any chat opens the "
           "<b>Messages directory</b>: Ari at the top (he’s a teammate who happens to be an agent — always on), "
           "the <b>Main</b> channel that reaches everyone, your recent one-on-ones, and the team roster. Team "
           "messages update live on everyone’s screen and ring the bell for people who aren’t looking."))

# ═══ 13. TEXTING ═══
E.append(PageBreak())
E += section('13', 'Customer Texting')
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
E += section('14', 'Reports')
E.append(P("The numbers, period-selectable like the dashboard: <b>Closed Revenue</b>, <b>Open Pipeline</b>, <b>Open "
           "Jobs</b>, and <b>In-Stock Value</b> up top; then revenue by location (Minot vs. Bismarck), pipeline value "
           "by stage, service jobs by status, and inventory by status with an aging view of how long in-stock units "
           "have been sitting (0–30, 31–90, 90+ days). Everything reconciles with the pages it summarizes — "
           "same data, same math."))

# ═══ 15. SETTINGS/TEAM ═══
E += section('15', 'Settings &amp; Team Management')
E.append(P("<b>Team &amp; Permissions</b> (Owner/Manager only) is where people management happens: every teammate "
           "with a role dropdown and a home-store dropdown. New signups appear here as Salesperson — set their "
           "real role once and they’re fully equipped. You can’t demote yourself, so you can’t lock yourself "
           "out. Settings also shows your profile, both store locations, and Sign Out."))
E.append(P("<b>Adding an employee, start to finish:</b> (1) they sign up at the login page → (2) you set their role "
           "in Team &amp; Permissions → (3) set their home store so their forms default correctly. Done."))

# ═══ 16. OWNER OPS ═══
E.append(PageBreak())
E += section('16', 'Owner’s Operations Guide')
E.append(Paragraph('<b>The accounts behind the app</b>', S['h2']))
E.append(styled_table(
    ['Service', 'What it runs', 'Cost'],
    [['Vercel (project: spas_360_solo)', 'The app itself — updates deploy automatically', 'Plan-dependent'],
     ['Supabase (project: spas-360)', 'Database, sign-ins, file storage, realtime', '$10/month'],
     ['Twilio (+1 701 929 9194)', 'Business texting', 'Number ~$1.15/mo + per-message + A2P fees'],
     ['GitHub (spas_360_solo)', 'The code', 'Free'],
     ['AI provider (Gemini / GLM / Claude)', 'Ari’s brain — switchable without changing the app', 'Usage-based'],
    ], [2.1*inch, 2.9*inch, 1.5*inch]))
E.append(Spacer(1, 8))
E.append(Paragraph('<b>Open items (do these before wide rollout)</b>', S['h2']))
E.append(B("<b>1. Lock down open sign-up.</b> Anyone with the URL can currently create an account that joins the "
           "company. Disable public signups in Supabase Auth settings once the team is aboard — this is the "
           "most important security item."))
E.append(B("<b>2. Activate texting.</b> Vercel → Settings → Environment Variables: add TWILIO_ACCOUNT_SID, "
           "TWILIO_AUTH_TOKEN, TWILIO_FROM, SUPABASE_SERVICE_ROLE_KEY; redeploy; set the Twilio webhook to "
           "https://spas360solo.vercel.app/api/sms-inbound; complete A2P 10DLC registration."))
E.append(B("<b>3. Import the Bismarck inventory tab</b> (Minot and Used are already loaded — 110 units)."))
E.append(Paragraph('<b>Security model, in one paragraph</b>', S['h2']))
E.append(P("Every piece of data is protected at the database level (row-level security): people only see their "
           "company’s data, tasks are visible to their owner and managers, notifications are private, deletion "
           "rights are manager-only where it matters, and job photos live in storage with unguessable addresses. "
           "The AI guardrails are enforced on the server — they can’t be stripped from a browser."))
E.append(Paragraph('<b>Roadmap</b>', S['h2']))
E.append(P("QuickBooks sync (customers/estimates first) · install-to-home-screen app for techs · automatic "
           "reminders for stagnant parts and overdue follow-ups · @Ari in team channels · role-based page "
           "restrictions beyond landing pages."))

# ═══ 17. QUICK REFERENCE ═══
E.append(PageBreak())
E += section('17', 'Quick Reference')
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
E.append(Paragraph('<font color="#5b6472">SPAS 360 · Built for Magic City Home Leisure · Powered by NDAI · '
                   'Manual v1.0, July 2026</font>', ParagraphStyle('end', fontName='Helvetica-Oblique', fontSize=9,
                   textColor=GRAY, alignment=TA_CENTER)))

doc.build(E)
import subprocess
print("PDF built:", OUT)
print(subprocess.run(['du', '-h', OUT], capture_output=True, text=True).stdout.strip())
from pypdf import PdfReader
print("pages:", len(PdfReader(OUT).pages))
