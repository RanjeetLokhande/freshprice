import { ImageResponse } from 'next/og';

// PNG app icons rendered at build time (no image files to maintain).
const ICONS = {
  'icon-192.png': { size: 192, maskable: false },
  'icon-512.png': { size: 512, maskable: false },
  'maskable-512.png': { size: 512, maskable: true },
  'apple-180.png': { size: 180, maskable: true },
} as const;

type IconFile = keyof typeof ICONS;

export const dynamic = 'force-static';

export function generateStaticParams() {
  return Object.keys(ICONS).map((file) => ({ file }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const spec = ICONS[file as IconFile];
  if (!spec) return new Response('Not found', { status: 404 });

  const { size, maskable } = spec;
  // Maskable icons keep the artwork inside the 80% safe zone and fill the square
  const art = Math.round(size * (maskable ? 0.52 : 0.62));

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#2f7d32',
          borderRadius: maskable ? 0 : Math.round(size * 0.22),
        }}
      >
        <svg width={art} height={art} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 20A7 7 0 0 1 4 13c0-6 7-10 16-10 0 9-4 16-10 16" />
          <path d="M4 21c3-5 6-8 10-10" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
