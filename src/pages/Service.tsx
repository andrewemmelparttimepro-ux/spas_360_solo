import { Calendar as CalendarIcon, Clock, MapPin, User, Plus, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useServiceJobs, statusColors } from '@/hooks/useServiceJobs';
import type { JobStatus } from '@/types/database';

export default function Service() {
  const { unscheduledJobs, scheduledJobs, isLoading } = useServiceJobs();
  const todayDisplay = format(new Date(), 'MMMM d, yyyy');

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-500 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Service & Jobs</h1>
          <p className="text-sm text-slate-500 mt-1">Schedule and dispatch technicians</p>
        </div>
        <div className="flex space-x-3">
          <button className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"><Filter className="w-4 h-4 mr-2" />Filter</button>
          <button className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"><Plus className="w-4 h-4 mr-2" />New Job</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden gap-6">
        {/* Unscheduled Queue */}
        <div className="w-80 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden shrink-0">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h2 className="font-semibold text-slate-800">Unscheduled Queue</h2>
            <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2 py-1 rounded-full">{unscheduledJobs.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {unscheduledJobs.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No unscheduled jobs</p>
            ) : unscheduledJobs.map(job => (
              <Link key={job.id} to={`/service/${job.id}`} className={cn("block p-3 rounded-r-lg border border-l-4 shadow-sm hover:shadow-md transition-all", statusColors[job.status as JobStatus] ?? 'bg-slate-50')}>
                <div className="text-xs font-bold uppercase tracking-wider mb-1 opacity-80">{job.status}</div>
                <h3 className="font-medium text-sm mb-2 leading-tight">{job.title}</h3>
              </Link>
            ))}
          </div>
        </div>

        {/* Schedule Board */}
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <div className="flex items-center space-x-4">
              <h2 className="font-semibold text-slate-800 flex items-center"><CalendarIcon className="w-5 h-5 mr-2 text-slate-500" />Today's Schedule</h2>
              <div className="text-sm text-slate-500">{todayDisplay}</div>
            </div>
            <div className="flex bg-slate-200 p-1 rounded-lg">
              <button className="px-3 py-1 text-sm font-medium bg-white shadow-sm rounded-md text-slate-800">Day</button>
              <button className="px-3 py-1 text-sm font-medium text-slate-600 hover:text-slate-800">Week</button>
              <button className="px-3 py-1 text-sm font-medium text-slate-600 hover:text-slate-800">Month</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
            <div className="space-y-4">
              {scheduledJobs.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No jobs scheduled today</p>
              ) : scheduledJobs.map(job => (
                <Link key={job.id} to={`/service/${job.id}`} className={cn("block p-4 rounded-r-lg border border-l-4 shadow-sm bg-white hover:shadow-md transition-all", statusColors[job.status as JobStatus] ?? 'bg-slate-50')}>
                  <div className="text-xs font-bold uppercase tracking-wider mb-1 opacity-80">{job.status}</div>
                  <h3 className="font-medium text-slate-900">{job.title}</h3>
                  <div className="flex items-center space-x-4 mt-2 text-sm opacity-80">
                    {job.scheduled_at && <span className="flex items-center"><Clock className="w-4 h-4 mr-1" />{new Date(job.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
