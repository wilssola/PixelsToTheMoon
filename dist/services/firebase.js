"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.landDoc = exports.landsCollection = exports.db = exports.app = void 0;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const serviceAccount = require("../../keys/theprojecttothemoon-firebase-adminsdk.json");
const app = (0, app_1.initializeApp)({
    credential: firebase_admin_1.default.credential.cert(serviceAccount),
});
exports.app = app;
const db = (0, firestore_1.getFirestore)(app);
exports.db = db;
const landsCollection = db
    .collection("pixels")
    .doc("lands")
    .collection("lands");
exports.landsCollection = landsCollection;
const landDoc = (id) => landsCollection.doc(id);
exports.landDoc = landDoc;
