// Izmišljeni (dummy) podaci za demo. Sve na jednom mjestu kako bi se imena,
// brojke i datumi mogli promijeniti bez diranja scena.

export const ORG = "Sveučilište u Zagrebu";
export const ADMIN = { name: "Ivana Kovač", initials: "IK" };

export const ELECTION = {
  title: "Izbori za Studentski zbor Sveučilišta u Zagrebu 2026.",
  description:
    "Redovni izbori za članove Studentskog zbora u akademskoj godini 2026./2027. Svaki student s pravom glasa bira jednog kandidata.",
  id: "cmh8q2zx40007unizgsz26",
  // Kako ih prikazuje formatWizardDateTime (hr-HR, kratki mjesec).
  opensDisplay: "10. stu 2026. 08:00",
  closesDisplay: "12. stu 2026. 20:00",
  // Kako ih prikazuje <input type="date"> / <input type="time"> u hr pregledniku.
  opensDate: "10. 11. 2026.",
  opensTime: "08:00",
  closesDate: "12. 11. 2026.",
  closesTime: "20:00",
  quorumPct: 20,
};

export const CANDIDATES = [
  { name: "Luka Horvat", role: "3. godina, FER" },
  { name: "Ana Marić", role: "4. godina, Pravni fakultet" },
  { name: "Marko Babić", role: "2. godina, Ekonomski fakultet" },
  { name: "Petra Jurić", role: "5. godina, Medicinski fakultet" },
];

export const CSV_FILE = "studenti_unizg_2026.csv";
export const VOTER_COUNT = 348;
export const VOTERS = [
  { name: "Ema Kovačević", email: "ema.kovacevic@student.unizg.hr" },
  { name: "Ivan Perić", email: "ivan.peric@student.unizg.hr" },
  { name: "Lucija Tomić", email: "lucija.tomic@student.unizg.hr" },
  { name: "Filip Novak", email: "filip.novak@student.unizg.hr" },
  { name: "Sara Pavlović", email: "sara.pavlovic@student.unizg.hr" },
  { name: "Dino Knežević", email: "dino.knezevic@student.unizg.hr" },
  { name: "Mia Šimić", email: "mia.simic@student.unizg.hr" },
  { name: "Josip Vuković", email: "josip.vukovic@student.unizg.hr" },
  { name: "Lana Božić", email: "lana.bozic@student.unizg.hr" },
  { name: "Karlo Grgić", email: "karlo.grgic@student.unizg.hr" },
];

// Nadzorna ploča prije izrade novih izbora.
export const DASHBOARD = {
  stats: [
    { label: "Aktivni izbori", value: "1", hint: "Trenutno otvoreni za glasovanje", tone: "success" },
    { label: "Ukupno glasača", value: "2.416", hint: "S pravom glasa u svim izborima", tone: "muted" },
    { label: "Prosj. izlaznost", value: "61%", hint: "Prosječna stopa sudjelovanja", tone: "muted" },
    { label: "Arhivirano", value: "7", hint: "Završeno i pohranjeno", tone: "muted" },
  ],
  live: {
    name: "Izbor studentskog pravobranitelja 2026.",
    meta: "Jedan izbor · Zatvara se 31. lis",
    voted: "412",
    total: "876",
    pct: 47,
  },
  recent: [
    { name: "Izbor studentskog pravobranitelja 2026.", type: "Jedan izbor", status: "ACTIVE", pct: 47, window: "27. lis – 31. lis" },
    { name: "Anketa o zadovoljstvu studentskim domovima", type: "Više izbora", status: "SCHEDULED", pct: 0, window: "3. stu – 7. stu" },
    { name: "Izbor predstavnika studenata u Senatu", type: "Jedan izbor", status: "CLOSED", pct: 64, window: "6. lis – 10. lis" },
  ],
} as const;
