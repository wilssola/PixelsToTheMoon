"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const puppeteer_1 = __importDefault(require("puppeteer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function runScrapper() {
    return __awaiter(this, void 0, void 0, function* () {
        const browser = yield puppeteer_1.default.launch({ headless: true });
        const [page] = yield browser.pages();
        let landsScrapped = [];
        for (let i = 1; i < 9; i++) {
            yield page.goto(`https://web3triads.com/lands/?land_page=${i}&trees=Dense`, { waitUntil: "domcontentloaded" });
            yield page.evaluate(`window.lands = [];`);
            const query = `document.querySelectorAll("span#landnumber").forEach((land) => {
        window.lands.push(land.innerText.split(" ")[1]);
      });`;
            yield page.evaluate(query);
            const jsonString = yield page.evaluate(`JSON.stringify(window.lands);`);
            const json = JSON.parse(jsonString);
            landsScrapped.push(json);
        }
        yield browser.close();
        const ids = landsScrapped.reduce((accumulator, currentArray) => accumulator.concat(currentArray), []);
        //console.log(ids);
        fs_1.default.writeFileSync(path_1.default.resolve(__dirname, "..", "data", "lands.json"), JSON.stringify(ids));
    });
}
exports.default = runScrapper;
