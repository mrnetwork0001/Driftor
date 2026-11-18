/**
 * Scheduled-maintenance toast, pinned bottom-right over the dashboard.
 *
 * The layer spans the whole viewport so the toast can be positioned freely.
 * It must not take pointer events itself; only the toast does.
 */
export default function MaintenanceNotice() {
  return (
    <div data-testid="maintenance-layer" className="pointer-events-none fixed inset-0 z-50">
      <div
        role="status"
        className="pointer-events-auto absolute bottom-4 right-4 sm:bottom-6 sm:right-6 w-[calc(100%-2rem)] sm:w-96 rounded-lg border border-cs-line bg-white shadow-lg p-4 text-sm"
      >
        <div className="flex items-start gap-3">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
          <div>
            <p className="font-medium text-cs-text">Scheduled maintenance</p>
            <p className="mt-1 text-cs-sub leading-relaxed">
              us-east-1 edge nodes will be patched Nov 18, 02:00–03:00 UTC. Requests may see brief added latency.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
