import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.turi.app",
  appName: "Turi",
  // Wird von Capacitor beim Erstellen des Projekts benoetigt, aber NICHT
  // fuer das eigentliche Laden der App genutzt -- siehe server.url unten.
  webDir: ".output/public",
  server: {
    // Die App-Huelle laedt eure echte, gehostete Web-App -- so wie ein
    // spezialisierter Browser-Rahmen. Das ist noetig, weil Server-
    // Funktionen (z. B. der Google-Places-Zugriff mit dem geheimen
    // Service-Role-Key) einen echten Server brauchen und niemals in die
    // App selbst eingebaut werden duerfen.
    //
    // WICHTIG: Vor dem finalen App-Store-Launch muss das hier auf eure
    // endgueltige, stabile Produktions-Domain zeigen (nicht mehr auf die
    // Lovable-Vorschau-URL, die sich aendern kann). Fuers erste Testen
    // auf dem Mac/Simulator ist die aktuelle URL aber voellig in Ordnung.
    url: "https://your-friends-travel-guide.lovable.app",
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
