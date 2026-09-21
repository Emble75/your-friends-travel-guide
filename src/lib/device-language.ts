/**
 * Die Sprache des Geraets, wie Google sie erwartet.
 *
 * Wird an die Ortssuche und die Tippvorschlaege mitgegeben. Ohne sie
 * sucht Google auf Englisch -- und "Roma" findet dann Roma in Texas
 * statt Rom, weil die italienische Hauptstadt auf Englisch "Rome"
 * heisst.
 *
 * Serverseitig und in alten Browsern gibt es kein navigator.language;
 * dann entscheidet der Server (er faellt auf Englisch zurueck).
 */
export function deviceLanguage(): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  const value = navigator.language?.trim();
  if (!value || !/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/.test(value)) return undefined;
  return value;
}
