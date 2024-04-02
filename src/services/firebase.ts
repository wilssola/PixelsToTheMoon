import admin from "firebase-admin";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccount = require("../../keys/theprojecttothemoon-firebase-adminsdk.json");

const app = initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = getFirestore(app);

const landsCollection = db
  .collection("pixels")
  .doc("lands")
  .collection("lands");

const landDoc = (id: string) => landsCollection.doc(id);

export { app, db, landsCollection, landDoc };
