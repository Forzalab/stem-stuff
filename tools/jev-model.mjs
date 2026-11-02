// The one source of truth for Jev's model slug. Read from env JEV_MODEL; the default is MSD-1.
export function jevModel() {
  return process.env.JEV_MODEL || "microsoft/microsoft-decision-1";
}
