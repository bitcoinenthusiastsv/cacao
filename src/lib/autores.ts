export interface Autor {
  id: string;
  nombre: string;
  rol: string;
  bio: string;
}

export const AUTORES: Autor[] = [
  {
    id: 'josh-pineda',
    nombre: 'Josh Pineda',
    rol: 'Fundador y editor',
    bio: 'Escribe y edita Cacao Media desde El Salvador. Le interesan los lugares que no salen en la postal, el café de altura y la idea de que una historia se pueda pagar con unos cuantos satoshis.',
  },
];

export const autorPorNombre = (nombre: string): Autor | undefined =>
  AUTORES.find((a) => a.nombre === nombre);

export const urlAutor = (a: Autor): string => `/autores/${a.id}/`;
