import { ArrowRight, Images, LockKeyhole, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Media() {
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-500">Photos and videos</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink-100">
          <Images className="h-6 w-6 text-violet-500" />
          Media
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-500">
          Find customer-property photos where the work happens, attached to the relevant service job.
        </p>
      </header>

      <section className="rounded-2xl border border-ink-700 bg-ink-900 p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-violet-500/15 p-3 text-violet-500">
            <Wrench className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-ink-100">Service job media</h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-500">
              Open Schedule and select a service job to view or add its delivery, damage, serial-number, and general photos.
            </p>
            <Link
              to="/service"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
            >
              Open Schedule <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900/60 px-4 py-3 text-xs text-ink-500">
        <LockKeyhole className="h-4 w-4 shrink-0 text-emerald-500" />
        Service-job media remains private; there is no separate shared media library connected here.
      </div>
    </div>
  );
}
