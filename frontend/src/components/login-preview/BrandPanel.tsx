export default function BrandPanel() {
  return (
    <div className="relative flex w-full min-h-[240px] flex-col justify-between overflow-hidden bg-gradient-to-br from-[#1a2634] via-[#1e2d3d] to-[#141c28] p-10 md:w-1/2 md:min-h-[620px] md:p-12">
      {/* Subtle atmospheric glow from bottom center */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_100%,rgba(59,130,246,0.14),transparent_68%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_15%,rgba(255,255,255,0.035),transparent_45%)]"
        aria-hidden
      />

      <div className="relative z-10 space-y-5 pt-2">
        <h2 className="text-[2rem] font-bold leading-[1.12] tracking-tight text-white md:text-[2.35rem]">
          Intelligence,
          <br />
          Amplified.
        </h2>
        <p className="max-w-[18rem] text-[0.875rem] leading-[1.65] text-white/65">
          Voice sessions tailored for students and early-career roles—save progress and review
          results anytime.
        </p>
      </div>

      <div className="relative z-10 mt-10 md:mt-auto">
        <span className="inline-flex items-center rounded-md border border-white/25 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-white/85">
          PLATFORM READY
        </span>
      </div>
    </div>
  );
}
