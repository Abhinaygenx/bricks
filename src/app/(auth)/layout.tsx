import { BrickMark } from "@/components/layout/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-charcoal lg:block">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 2px, transparent 2px), linear-gradient(90deg, #fff 2px, transparent 2px), linear-gradient(90deg, #fff 2px, transparent 2px)",
            backgroundSize: "96px 40px, 96px 40px, 96px 40px",
            backgroundPosition: "0 0, 0 0, 48px 20px",
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <BrickMark className="h-10 w-10" />
            <div className="leading-none">
              <div className="text-lg font-extrabold tracking-[0.14em] text-white">VABANI</div>
              <div className="mt-1 text-xs font-semibold tracking-[0.42em] text-brick-100">BRICKS</div>
            </div>
          </div>
          <div>
            <h1 className="max-w-md text-4xl font-bold leading-tight text-white">Every brick, every rupee, accounted for.</h1>
            <p className="mt-4 max-w-md text-white/60">
              Production, stock, billing, customer credit and collections in one secure system with a permanent audit trail.
            </p>
          </div>
          <p className="text-xs text-white/40">Brick Manufacturing & Supply</p>
        </div>
      </div>
      <div className="flex items-center justify-center bg-offwhite px-4 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
