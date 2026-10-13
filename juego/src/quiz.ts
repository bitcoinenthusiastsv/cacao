export type PreguntaQuiz = {
  id: string;
  texto: string;
  opciones: readonly [string, string, string, string];
  /** Índice 0..3 de la opción correcta (solo servidor). */
  correcta: number;
};

export const PREGUNTAS: readonly PreguntaQuiz[] = [
  {
    id: "cacao-zona",
    texto: "¿En qué departamento queda Izalco, famoso por su historial de cacao?",
    opciones: ["La Libertad", "Sonsonate", "San Miguel", "La Unión"],
    correcta: 1,
  },
  {
    id: "pupusa",
    texto: "¿Cómo le decís vos a la pupusa que lleva queso y chicharrón en la misma tortilla?",
    opciones: ["Pupusa de loroco", "Pupusa revuelta", "Pupusa de ayote", "Pupusa de frijol"],
    correcta: 1,
  },
  {
    id: "capital",
    texto: "¿Cuál es la capital de El Salvador?",
    opciones: ["Santa Ana", "San Miguel", "San Salvador", "Sonsonate"],
    correcta: 2,
  },
  {
    id: "atol",
    texto: "¿Qué bebida caliente tradicional se prepara con cacao molido y a veces canela?",
    opciones: ["Horchata", "Atol de cacao", "Chilate", "Cebada"],
    correcta: 1,
  },
  {
    id: "lago",
    texto: "¿Qué lago volcánico del occidente es uno de los más visitados del país?",
    opciones: ["Lago de Ilopango", "Lago de Güija", "Lago de Coatepeque", "Lago de Olomega"],
    correcta: 2,
  },
  {
    id: "flor",
    texto: "¿Cuál es la flor nacional de El Salvador?",
    opciones: ["La rosa", "El izote", "La ceiba", "La malinche"],
    correcta: 1,
  },
  {
    id: "moneda",
    texto: "¿Qué moneda circula legalmente en El Salvador desde el año 2001?",
    opciones: ["Colón", "Quetzal", "Dólar estadounidense", "Lempira"],
    correcta: 2,
  },
  {
    id: "ruta",
    texto: "¿Cómo se conoce la carretera panorámica que une Apaneca con Ataco en la ruta de las flores?",
    opciones: ["Ruta del Balsamo", "Ruta de las Flores", "Ruta del Paz", "Ruta del Sol"],
    correcta: 1,
  },
] as const;

export const TOTAL_PREGUNTAS = PREGUNTAS.length;

export function preguntaPublica(p: PreguntaQuiz, indice: number) {
  return {
    indice,
    id: p.id,
    texto: p.texto,
    opciones: p.opciones,
  };
}

export function esRespuestaCorrecta(indicePregunta: number, opcion: number): boolean {
  const p = PREGUNTAS[indicePregunta];
  if (!p) return false;
  if (opcion < 0 || opcion > 3) return false;
  return p.correcta === opcion;
}
