"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const lands_1 = require("./lands");
const scrapper_1 = __importDefault(require("./scrapper"));
const bot_1 = __importDefault(require("./bot"));
(0, scrapper_1.default)();
(0, lands_1.runLands)();
(0, bot_1.default)();
