import { Sender } from "../models/Sender.js";
import { Settings } from "../models/Settings.js";
import { encryptSecret, isEncrypted } from "./security.js";

/** One-off upgrade: encrypts SMTP passwords and the Places API key saved before encryption existed. */
export async function encryptStoredSecrets() {
  const senders = await Sender.find({ password: { $nin: ["", null], $not: /^enc:/ } });
  for (const s of senders) await Sender.updateOne({ _id: s._id }, { password: encryptSecret(s.password) });

  const settings = await Settings.findById("workspace");
  if (settings?.googlePlacesApiKey && !isEncrypted(settings.googlePlacesApiKey)) {
    await Settings.updateOne({ _id: "workspace" }, { googlePlacesApiKey: encryptSecret(settings.googlePlacesApiKey) });
  }
  if (senders.length) console.log(`Encrypted ${senders.length} saved SMTP password(s).`);
}
