import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, JetBrains_Mono } from 'next/font/google';

import { BarraInferior } from '@/componentes/BarraInferior';
import { Cabecera } from '@/componentes/Cabecera';
import { GrupoCacao } from '@/componentes/GrupoCacao';

import './globals.css';

// Variable fonts: no weight list needed. Bricolage carries the text, JetBrains Mono the amounts and codes.
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
    default: 'CacaoPay',
    template: '%s · CacaoPay',
  },
  description:
    'Mandá dinero a El Salvador y mirá cada centavo. Una simulación: no mueve dinero real.',
  applicationName: 'CacaoPay',
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
        <div className="hoja">
          <div className="cinta">Modo demo: envíos simulados</div>
          <Cabecera />
          <main id="contenido" tabIndex={-1} className="principal">
            <div className="contenedor">{children}</div>
          </main>
        </div>
        <div className="zona-grupo">
          <div className="contenedor">
            <p className="marca-gigante" aria-hidden="true">
              <b>cacao</b>pay
            </p>
          </div>
          <GrupoCacao actual="pay" />
        </div>
        <BarraInferior />
      </body>
    </html>
  );
}
