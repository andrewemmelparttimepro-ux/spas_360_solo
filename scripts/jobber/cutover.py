"""Prepare dated appointments separately from the inherited review backlog.

Identity decisions are supplied in a private, evidence-backed mapping file.
This module never infers a balance or resurrects an archived parent's visits.
"""
import datetime
import re
from zoneinfo import ZoneInfo

ZONE = ZoneInfo('America/Chicago')


def local(value):
    return datetime.datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(ZONE)


def disposition(visit, cutoff):
    if visit.get('isComplete') or visit.get('completedAt') or visit['job']['jobStatus'] == 'archived':
        return 'history'
    if visit.get('startAt') and local(visit.get('endAt') or visit['startAt']).date().isoformat() >= cutoff:
        return 'scheduled'
    return 'review'


def schedule_fields(visit):
    start = local(visit['startAt'])
    end = local(visit.get('endAt') or visit['startAt'])
    if end < start:
        raise ValueError('Visit ends before it starts')
    all_day = bool(visit['allDay'])
    return dict(
        scheduled_at=f'{start.date()}T18:00:00Z' if all_day else visit['startAt'],
        scheduled_end_date=end.date().isoformat() if end.date() > start.date() else None,
        scheduled_all_day=all_day,
        estimated_duration=None if all_day else round((end - start).total_seconds() / 60),
    )


def job_type(title):
    title = title.lower()
    if re.search(r'\b(parts on order|parts not received)\b', title):
        return 'On Order', 'Parts on Order'
    if re.search(r'\b(to do|todo|off|gone|wedding|show)\b', title):
        return 'To Do', 'Pending Confirm'
    if re.search(r'\bwarranty\b', title):
        return 'Warranty', 'Warranty'
    if re.search(r'\b(customer pick\s?up|ready for pick\s?up)\b', title):
        return 'Customer Pick Up', 'Ready for Pickup'
    if re.search(r'\bdelivery\b', title):
        return 'Delivery', 'Delivery'
    return 'Service', 'In Progress'


def sql_literal(value):
    if value is None:
        return 'null'
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def insert_sql(table, rows):
    if not rows:
        return ''
    keys = list(rows[0])
    if any(set(row) != set(keys) for row in rows):
        raise ValueError('Inconsistent insert fields')
    return f'insert into public.{table} (' + ','.join(keys) + ') values\n' + ',\n'.join(
        '(' + ','.join(sql_literal(row[key]) for key in keys) + ')' for row in rows
    ) + ';\n'
