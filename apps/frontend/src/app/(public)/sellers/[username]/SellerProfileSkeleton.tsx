export function SellerProfileSkeleton() {
  return (
    <main className="mx-auto max-w-7xl animate-pulse px-4 py-8 text-white sm:px-6 lg:py-12" aria-label="Loading seller profile">
      <section className="overflow-hidden rounded-[30px] border border-white/10 bg-[#12131a]">
        <div className="h-32 bg-white/[0.06] sm:h-44" />
        <div className="px-5 pb-6 sm:px-8">
          <div className="-mt-12 flex flex-col gap-5 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <div className="h-24 w-24 rounded-3xl border-4 border-[#12131a] bg-white/10 sm:h-28 sm:w-28" />
              <div className="space-y-3 pb-2">
                <div className="h-7 w-48 rounded-lg bg-white/10" />
                <div className="h-4 w-32 rounded bg-white/[0.06]" />
              </div>
            </div>
            <div className="h-10 w-40 rounded-xl bg-white/10" />
          </div>
          <div className="mt-6 h-4 max-w-2xl rounded bg-white/[0.06]" />
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[1, 2, 3].map((item) => <div key={item} className="h-24 rounded-2xl border border-white/10 bg-white/[0.035]" />)}
          </div>
        </div>
      </section>
      <div className="mt-8 flex gap-2 border-b border-white/10">
        <div className="h-11 w-36 rounded-t bg-white/[0.06]" />
        <div className="h-11 w-40 rounded-t bg-white/[0.04]" />
      </div>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
          <div key={item} className="overflow-hidden rounded-2xl border border-white/10 bg-[#10141c]">
            <div className="aspect-[4/3] bg-white/[0.06]" />
            <div className="space-y-3 p-4">
              <div className="h-5 rounded bg-white/10" />
              <div className="h-5 w-2/3 rounded bg-white/[0.06]" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
