import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CacaoPay',
    short_name: 'CacaoPay',
    description: 'Mandá dinero a El Salvador y mirá cada centavo. Una simulación.',
    start_url: '/',
    display: 'standalone',
    lang: 'es-SV',
    background_color: '#E6D8C6',
    theme_color: '#2A1912',
    icons: [
      { src: '/icono.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icono-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
