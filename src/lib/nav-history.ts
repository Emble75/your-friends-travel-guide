/**
 * Einfacher In-Memory-Merker: wurde seit dem Laden der App bereits
 * innerhalb der App navigiert? Wird vom Zurueck-Pfeil im Header
 * gebraucht -- bei einem frisch geoeffneten Link (z. B. ein per
 * "Send link" geteilter Ordner-Link aus WhatsApp) ist die Browser-
 * Historie leer, ein einfaches "zurueck" wuerde dann ins Leere laufen
 * oder die App verlassen.
 */
export const navHistory = { hasNavigatedInApp: false };
