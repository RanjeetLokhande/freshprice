import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Fresh Price',
    short_name: 'Fresh Price',
    description: 'Daily fruit & vegetable prices and cost calculation',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f6f7f4',
    theme_color: '#2f7d32',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      { name: 'New calculation', url: '/calculate', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Today’s prices', url: '/prices', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
