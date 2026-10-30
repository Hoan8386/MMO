// Planet data (J2000 elements, NASA fact sheets) and Kepler's equation, shared by space components.
export interface PlanetData {
  name: string; // Vietnamese
  a: number; // semi-major axis, AU
  e: number; // eccentricity
  period: number; // sidereal orbit, days
  L0: number; // mean longitude at J2000, degrees
  peri: number; // longitude of perihelion, degrees
  radius: number; // km
  day: number; // sidereal rotation, hours (negative = retrograde)
  tilt: number; // axial tilt, degrees
  color: string;
  rings?: boolean;
}

export const PLANETS: Record<string, PlanetData> = {
  mercury: { name: "Sao Thủy", a: 0.387, e: 0.2056, period: 87.97, L0: 252.25, peri: 77.46, radius: 2440, day: 1407.6, tilt: 0.03, color: "#B5B5B5" },
  venus: { name: "Sao Kim", a: 0.723, e: 0.0068, period: 224.7, L0: 181.98, peri: 131.53, radius: 6052, day: -5832.5, tilt: 177.4, color: "#E8C27A" },
  earth: { name: "Trái Đất", a: 1.0, e: 0.0167, period: 365.26, L0: 100.46, peri: 102.94, radius: 6371, day: 23.934, tilt: 23.44, color: "#4F9BFF" },
  mars: { name: "Sao Hỏa", a: 1.524, e: 0.0934, period: 686.98, L0: 355.45, peri: 336.04, radius: 3390, day: 24.623, tilt: 25.19, color: "#E06A3B" },
  jupiter: { name: "Sao Mộc", a: 5.203, e: 0.0484, period: 4332.6, L0: 34.4, peri: 14.75, radius: 69911, day: 9.925, tilt: 3.13, color: "#D9A066" },
  saturn: { name: "Sao Thổ", a: 9.537, e: 0.0539, period: 10759.2, L0: 49.94, peri: 92.43, radius: 58232, day: 10.656, tilt: 26.73, color: "#E3CB8F", rings: true },
  uranus: { name: "Sao Thiên Vương", a: 19.19, e: 0.0473, period: 30685, L0: 313.23, peri: 170.96, radius: 25362, day: -17.24, tilt: 97.77, color: "#8FD3E8" },
  neptune: { name: "Sao Hải Vương", a: 30.07, e: 0.0086, period: 60190, L0: 304.88, peri: 44.97, radius: 24622, day: 16.11, tilt: 28.32, color: "#4B70DD" },
};
export const PLANET_IDS = Object.keys(PLANETS);

// Position on the orbit after `days` from J2000, in AU, in the orbit plane (x to the vernal point).
// Mean anomaly → eccentric anomaly (Newton on Kepler's equation M = E − e·sinE) → position.
export function orbitPos(p: PlanetData, days: number): [number, number] {
  const rad = Math.PI / 180;
  const M = ((p.L0 - p.peri) * rad + (2 * Math.PI * days) / p.period) % (2 * Math.PI);
  let E = M;
  for (let i = 0; i < 8; i++) E -= (E - p.e * Math.sin(E) - M) / (1 - p.e * Math.cos(E));
  const x = p.a * (Math.cos(E) - p.e);
  const y = p.a * Math.sqrt(1 - p.e * p.e) * Math.sin(E);
  const w = p.peri * rad;
  return [x * Math.cos(w) - y * Math.sin(w), x * Math.sin(w) + y * Math.cos(w)];
}
