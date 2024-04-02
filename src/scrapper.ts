import puppeteer, { Browser, Page } from "puppeteer";
import fs from "fs";
import path from "path";

async function runScrapper() {
    const browser = await puppeteer.launch({ headless: true });

    const [page] = await browser.pages();

    let landsScrapped = [];
    for (let i = 1; i < 9; i++){
      await page.goto(`https://web3triads.com/lands/?land_page=${i}&trees=Dense`, {waitUntil: "domcontentloaded"});

      await page.evaluate(`window.lands = [];`);

      const query = `document.querySelectorAll("span#landnumber").forEach((land) => {
        window.lands.push(land.innerText.split(" ")[1]);
      });`

      await page.evaluate(query);

      const jsonString = await page.evaluate(`JSON.stringify(window.lands);`) as string;
      const json = JSON.parse(jsonString) as string[];
      landsScrapped.push(json);
    }

    await browser.close();

    const ids = landsScrapped.reduce((accumulator, currentArray) => accumulator.concat(currentArray), []);
    //console.log(ids);

    fs.writeFileSync(path.resolve(__dirname, "..", "data", "lands.json"), JSON.stringify(ids));
  }

  export default runScrapper;