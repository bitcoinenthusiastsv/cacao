import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, JetBrains_Mono } from 'next/font/google';

import { BarraInferior } from '@/componentes/BarraInferior';
import { Cabecera } from '@/componentes/Cabecera';
import { GrupoCacao } from '@/componentes/GrupoCacao';

import './globals.css';

// Variable fonts: no weight list needed. Bricolage carries the text, JetBrains Mono the prices and data.
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'CacaoMarket',
    template: '%s · CacaoMarket',
  },
  description:
    'Productores de El Salvador venden directo a sus vecinos. Pagás en sats y el dinero llega a la billetera del productor.',
  applicationName: 'CacaoMarket',
  // Demo build: keep it out of search results.
  robots: { index: false },
  icons: {
    icon: [{ url: '/icono.svg', type: 'image/svg+xml' }],
  },
};

// viewportFit cover lets the bottom bar use the phone's safe area (env(safe-area-inset-bottom)).
export const viewport: Viewport = {
  themeColor: '#2A1912',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es-SV" className={`${bricolage.variable} ${mono.variable}`}>
      <body>
        <a className="saltar" href="#contenido">
          Saltar al contenido
        </a>
        <div className="cinta">Modo demo: pagos simulados</div>
        <Cabecera />
        <main id="contenido" tabIndex={-1} className="principal">
          <div className="contenedor">{children}</div>
        </main>
        <GrupoCacao actual="market" />
        <BarraInferior />
      </body>
    </html>
  );
}
