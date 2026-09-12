import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts/jobber'))
from cutover import disposition, schedule_fields, job_type, sql_literal


class CutoverTests(unittest.TestCase):
    def visit(self, **values):
        return dict(id='one', allDay=True, isComplete=False, completedAt=None,
                    startAt='2026-09-14T05:00:00Z', endAt='2026-09-15T04:59:59Z',
                    job={'jobStatus': 'upcoming'}, **values)

    def test_completed_or_archived_future_work_stays_history(self):
        for field, value in [('isComplete', True), ('completedAt', '2026-09-12T20:00:00Z'), ('job', {'jobStatus': 'archived'})]:
            v=self.visit(); v[field]=value
            self.assertEqual(disposition(v, '2026-09-12'), 'history')

    def test_all_day_does_not_create_a_midnight_appointment_or_extra_day(self):
        self.assertEqual(schedule_fields(self.visit()), dict(scheduled_at='2026-09-14T18:00:00Z', scheduled_end_date=None, scheduled_all_day=True, estimated_duration=None))

    def test_timed_visit_and_multi_day_range_are_preserved(self):
        v=self.visit();v.update(allDay=False,startAt='2026-09-14T14:30:00Z',endAt='2026-09-14T16:00:00Z')
        self.assertEqual(schedule_fields(v)['estimated_duration'],90)
        self.assertEqual(schedule_fields(v)['scheduled_at'],v['startAt'])
        v.update(allDay=True,endAt='2026-09-17T04:59:59Z')
        self.assertEqual(schedule_fields(v)['scheduled_end_date'],'2026-09-16')

    def test_cutoff_uses_central_time_and_includes_spanning_visits(self):
        v=self.visit();v.update(startAt='2026-09-12T03:00:00Z',endAt='2026-09-12T04:00:00Z')
        self.assertEqual(disposition(v,'2026-09-12'),'review')
        v['endAt']='2026-09-12T07:00:00Z'
        self.assertEqual(disposition(v,'2026-09-12'),'scheduled')

    def test_no_date_is_review_and_recurring_future_visits_are_not_dropped(self):
        v=self.visit();v['startAt']=None
        self.assertEqual(disposition(v,'2026-09-12'),'review')
        v=self.visit();v['job']['jobStatus']='late'
        self.assertEqual(disposition(v,'2026-09-12'),'scheduled')

    def test_calendar_and_work_types(self):
        self.assertEqual(job_type('Lilly Off'),('To Do','Pending Confirm'))
        self.assertEqual(job_type('Parts on order - Hekla'),('On Order','Parts on Order'))
        self.assertEqual(job_type('Mandan - warranty'),('Warranty','Warranty'))

    def test_sql_values_are_literals(self):
        self.assertEqual(sql_literal("O'Brien $() `text`"),"'O''Brien $() `text`'")


if __name__ == '__main__': unittest.main()
