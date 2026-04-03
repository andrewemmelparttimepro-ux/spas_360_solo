import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowUpRight, ArrowDownRight, DollarSign, Users, Wrench, AlertCircle } from 'lucide-react';

const data = [
  { name: 'Mon', revenue: 4000 },
  { name: 'Tue', revenue: 3000 },
  { name: 'Wed', revenue: 2000 },
  { name: 'Thu', revenue: 2780 },
  { name: 'Fri', revenue: 1890 },
  { name: 'Sat', revenue: 2390 },
  { name: 'Sun', revenue: 3490 },
];

export default function Dashboard() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Manager Dashboard</h1>
        <div className="flex space-x-2">
          <select className="bg-white border border-slate-200 text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500">
            <option>This Week</option>
            <option>This Month</option>
            <option>Last Month</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Revenue" 
          value="$45,231" 
          trend="+12.5%" 
          isPositive={true} 
          icon={DollarSign} 
          color="text-emerald-600"
          bg="bg-emerald-100"
        />
        <StatCard 
          title="Active Deals" 
          value="24" 
          trend="+4" 
          isPositive={true} 
          icon={Users} 
          color="text-blue-600"
          bg="bg-blue-100"
        />
        <StatCard 
          title="Unscheduled Jobs" 
          value="12" 
          trend="-2" 
          isPositive={true} 
          icon={Wrench} 
          color="text-amber-600"
          bg="bg-amber-100"
        />
        <StatCard 
          title="Parts Overdue" 
          value="3" 
          trend="+1" 
          isPositive={false} 
          icon={AlertCircle} 
          color="text-red-600"
          bg="bg-red-100"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-6">Revenue Overview</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dx={-10} tickFormatter={(val) => `$${val}`} />
                <Tooltip 
                  cursor={{ fill: '#f1f5f9' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="revenue" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Action Items */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Requires Attention</h2>
          <div className="space-y-4">
            <ActionItem 
              title="Follow up with Wyant" 
              desc="Sundance Optima 880 quote" 
              time="Overdue by 2h" 
              type="task" 
            />
            <ActionItem 
              title="Part Arrival: Heater Assembly" 
              desc="For Johnson Repair Job" 
              time="Just now" 
              type="part" 
            />
            <ActionItem 
              title="Invoice Paid: Smith" 
              desc="Ready for warranty registration" 
              time="2 hrs ago" 
              type="invoice" 
            />
            <ActionItem 
              title="New Web Lead" 
              desc="Interested in Swim Spas" 
              time="4 hrs ago" 
              type="lead" 
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, trend, isPositive, icon: Icon, color, bg }: any) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
        <div className={`flex items-center mt-2 text-sm font-medium ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
          {isPositive ? <ArrowUpRight className="w-4 h-4 mr-1" /> : <ArrowDownRight className="w-4 h-4 mr-1" />}
          {trend}
        </div>
      </div>
      <div className={`p-3 rounded-lg ${bg}`}>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
    </div>
  );
}

function ActionItem({ title, desc, time, type }: any) {
  const colors = {
    task: 'bg-amber-100 text-amber-700',
    part: 'bg-blue-100 text-blue-700',
    invoice: 'bg-emerald-100 text-emerald-700',
    lead: 'bg-purple-100 text-purple-700',
  };
  
  return (
    <div className="flex items-start p-3 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-100">
      <div className={`w-2 h-2 mt-2 rounded-full flex-shrink-0 ${colors[type as keyof typeof colors].split(' ')[0].replace('100', '500')}`} />
      <div className="ml-3 flex-1">
        <p className="text-sm font-medium text-slate-900">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
      </div>
      <span className="text-xs font-medium text-slate-400">{time}</span>
    </div>
  );
}
