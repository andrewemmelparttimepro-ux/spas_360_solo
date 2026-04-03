import { useState } from 'react';
import { Calendar as CalendarIcon, Clock, MapPin, User, Plus, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

const unscheduledJobs = [
  { id: 'j1', title: 'Wyant – Sundance Hot Tub – Delivery', status: 'Delivery', location: 'Minot', priority: 'High' },
  { id: 'j2', title: 'Johnson – Caldera Repair – Parts on Order', status: 'Parts on Order', location: 'Bismarck', priority: 'Medium' },
  { id: 'j3', title: 'Smith – Jacuzzi Installation – Warranty', status: 'Warranty', location: 'Minot', priority: 'Low' },
  { id: 'j4', title: 'Davis – Swim Spa – Ready for Pickup', status: 'Ready for Pickup', location: 'Bismarck', priority: 'Medium' },
];

const scheduledJobs = [
  { id: 's1', title: 'Miller – Maintenance – In Progress', status: 'In Progress', time: '09:00 AM - 11:00 AM', tech: 'Bryson', location: 'Minot' },
  { id: 's2', title: 'Wilson – Repair – Completed', status: 'Completed', time: '11:30 AM - 01:00 PM', tech: 'Bryson', location: 'Minot' },
  { id: 's3', title: 'Taylor – Delivery – Delivery', status: 'Delivery', time: '02:00 PM - 04:00 PM', tech: 'Ben', location: 'Bismarck' },
];

const statusColors = {
  'Delivery': 'border-l-red-500 bg-red-50 text-red-900',
  'Parts on Order': 'border-l-slate-800 bg-slate-100 text-slate-900',
  'Warranty': 'border-l-purple-500 bg-purple-50 text-purple-900',
  'Ready for Pickup': 'border-l-emerald-500 bg-emerald-50 text-emerald-900',
  'In Progress': 'border-l-blue-500 bg-blue-50 text-blue-900',
  'Completed': 'border-l-slate-400 bg-slate-50 text-slate-600',
  'Cancelled': 'border-l-slate-300 bg-slate-50 text-slate-400 opacity-60',
};

export default function Service() {
  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Service & Jobs</h1>
          <p className="text-sm text-slate-500 mt-1">Schedule and dispatch technicians</p>
        </div>
        <div className="flex space-x-3">
          <button className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm">
            <Filter className="w-4 h-4 mr-2" />
            Filter
          </button>
          <button className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm">
            <Plus className="w-4 h-4 mr-2" />
            New Job
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden gap-6">
        {/* Unscheduled Queue (Sidebar) */}
        <div className="w-80 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden shrink-0">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h2 className="font-semibold text-slate-800">Unscheduled Queue</h2>
            <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2 py-1 rounded-full">
              {unscheduledJobs.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {unscheduledJobs.map(job => (
              <div key={job.id} className={cn("p-3 rounded-r-lg border border-l-4 shadow-sm cursor-grab hover:shadow-md transition-all", statusColors[job.status as keyof typeof statusColors])}>
                <div className="text-xs font-bold uppercase tracking-wider mb-1 opacity-80">{job.status}</div>
                <h3 className="font-medium text-sm mb-2 leading-tight">{job.title}</h3>
                <div className="flex items-center text-xs opacity-70">
                  <MapPin className="w-3 h-3 mr-1" />
                  {job.location}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Schedule Board */}
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <div className="flex items-center space-x-4">
              <h2 className="font-semibold text-slate-800 flex items-center">
                <CalendarIcon className="w-5 h-5 mr-2 text-slate-500" />
                Today's Schedule
              </h2>
              <div className="text-sm text-slate-500">April 3, 2026</div>
            </div>
            <div className="flex bg-slate-200 p-1 rounded-lg">
              <button className="px-3 py-1 text-sm font-medium bg-white shadow-sm rounded-md text-slate-800">Day</button>
              <button className="px-3 py-1 text-sm font-medium text-slate-600 hover:text-slate-800">Week</button>
              <button className="px-3 py-1 text-sm font-medium text-slate-600 hover:text-slate-800">Month</button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
            <div className="space-y-4">
              {scheduledJobs.map(job => (
                <div key={job.id} className={cn("p-4 rounded-r-lg border border-l-4 shadow-sm flex items-center justify-between bg-white", statusColors[job.status as keyof typeof statusColors])}>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider mb-1 opacity-80">{job.status}</div>
                    <h3 className="font-medium text-slate-900">{job.title}</h3>
                    <div className="flex items-center space-x-4 mt-2 text-sm opacity-80">
                      <span className="flex items-center"><Clock className="w-4 h-4 mr-1" /> {job.time}</span>
                      <span className="flex items-center"><MapPin className="w-4 h-4 mr-1" /> {job.location}</span>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div className="bg-white/50 px-3 py-1.5 rounded-lg border border-black/5 flex items-center text-sm font-medium">
                      <User className="w-4 h-4 mr-2 opacity-70" />
                      {job.tech}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
