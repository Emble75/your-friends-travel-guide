import { supabase } from "@/integrations/supabase/app-client";
import { isNative } from "./native";

/*
 * Push-Nachrichten -- die Geraete-Seite.
 *
 * Zweigeteilt, und diese Datei ist die eine Haelfte: Erlaubnis einholen,
 * die Geraete-Adresse von Apple entgegennehmen, sie beim eigenen Konto
 * hinterlegen und auf Antippen reagieren. Das VERSENDEN passiert auf dem
 * Server und braucht Apples Signaturschluessel -- es gehoert bewusst
 * nicht hierher, denn dieser Schluessel darf die App nie erreichen.
 *
 * Im Browser tut hier alles nichts: iOS kennt Push nur fuer echte Apps.
 * Aufrufer muessen das nicht wissen -- sie bekommen schlicht "nicht
 * verfuegbar" zurueck.
 */

export type PushState = "unsupported" | "granted" | "denied" | "prompt";

/** Ob dieses Geraet ueberhaupt Push kann. */
export const pushSupported = () => isNative();

/**
 * Aktueller Stand der Erlaubnis, OHNE zu fragen.
 *
 * Wichtig fuer die Oberflaeche: Ein Schalter darf nicht behaupten, er sei
 * aus, wenn die Erlaubnis in den iOS-Einstellungen entzogen wurde.
 */
export async function pushState(): Promise<PushState> {
  if (!isNative()) return "unsupported";
  const { PushNotifications } = await import("@capacitor/push-notifications");
  try {
    const { receive } = await PushNotifications.checkPermissions();
    if (receive === "granted") return "granted";
    if (receive === "denied") return "denied";
    return "prompt";
  } catch {
    return "unsupported";
  }
}

/**
 * Erlaubnis anfragen und das Geraet anmelden.
 *
 * Gibt zurueck, woran man ist. "denied" ist endgueltig: iOS fragt kein
 * zweites Mal, danach hilft nur der Weg ueber die Systemeinstellungen --
 * die Oberflaeche muss das dann auch so sagen, statt es weiter zu
 * versuchen.
 */
export async function enablePush(): Promise<PushState> {
  if (!isNative()) return "unsupported";
  const { PushNotifications } = await import("@capacitor/push-notifications");

  const { receive } = await PushNotifications.requestPermissions();
  if (receive !== "granted") return receive === "denied" ? "denied" : "prompt";

  // Die Adresse kommt nicht sofort, sondern ueber ein Ereignis -- erst
  // zuhoeren, dann anmelden, sonst verpasst man sie.
  await listenForToken();
  await PushNotifications.register();
  return "granted";
}

/** Meldet dieses Geraet ab und entfernt seine Adresse. */
export async function disablePush(): Promise<void> {
  if (!isNative()) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  try {
    const token = lastToken;
    if (token) await supabase.from("device_tokens").delete().eq("token", token);
    await PushNotifications.removeAllListeners();
    lastToken = null;
    listening = false;
  } catch {
    // Abmelden darf nie hart scheitern.
  }
}

let listening = false;
let lastToken: string | null = null;

/**
 * Die Adresse entgegennehmen und speichern.
 *
 * Erst loeschen, dann einfuegen: Apple vergibt dieselbe Adresse nach
 * einer Neuinstallation erneut, und sie koennte noch beim vorigen Konto
 * dieses Geraets liegen. Ohne das Loeschen scheitert das Einfuegen am
 * eindeutigen Schluessel und das Geraet bliebe stumm.
 */
async function listenForToken() {
  if (listening) return;
  listening = true;
  const { PushNotifications } = await import("@capacitor/push-notifications");

  await PushNotifications.addListener("registration", (token) => {
    lastToken = token.value;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      if (!me) return;
      await supabase.from("device_tokens").delete().eq("token", token.value);
      await supabase
        .from("device_tokens")
        .insert({ token: token.value, user_id: me, platform: "ios" });
    })();
  });

  await PushNotifications.addListener("registrationError", (err) => {
    // Kein Grund, den Nutzer zu behelligen -- ohne Adresse gibt es
    // schlicht keine Nachrichten.
    console.error("[push] Registrierung fehlgeschlagen:", err);
  });
}

/**
 * Reagiert auf das Antippen einer Nachricht.
 *
 * Der Server legt in die Nachricht ein Feld "path" -- den Ort in der App,
 * der gemeint ist (etwa "/u/sebastian"). Ohne das landet man immer nur
 * auf dem Startbildschirm, und eine Nachricht ueber einen neuen Follower
 * waere ein Hinweis ohne Ziel.
 */
export async function onPushOpened(go: (path: string) => void) {
  if (!isNative()) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const path = action.notification.data?.["path"];
    if (typeof path === "string" && path.startsWith("/")) go(path);
  });
}
