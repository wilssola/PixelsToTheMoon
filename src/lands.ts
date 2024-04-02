import fs from "fs";
import path from "path";
import puppeteer, { Browser, Page } from "puppeteer";

import { landsCollection, landDoc } from "./services/firebase";

import Land from "./models/land";
import Tree from "./models/tree";
import TreeState from "./models/treeState";

const pako = require("pako");

let lands: Land[] = [];

async function runLands() {
  const browser = await puppeteer.launch({ headless: true });
  console.log("Browser opened.");

  await openLands(browser);

  setInterval(async () => await openLands(browser), 1 * 60 * 1000);
}

async function runLandsSequentially() {
  const browser = await puppeteer.launch({ headless: true });
  console.log("Browser opened.");

  await openLandsSequentially(browser);

  setInterval(async () => await openLandsSequentially(browser), 1 * 60 * 1000);
}

export { runLands, runLandsSequentially };

async function openLands(browser: Browser) {
  const batchSize = 5; // Change this to the number of lands you want to open at once in parallel.

  const ids = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "data", "lands.json"), "utf8")) as string[];
  //console.log(ids);

  for (let i = 0; i < ids.length; i += batchSize) {
    const promises = ids
      .slice(i, i + batchSize)
      .filter((id) => id !== undefined)
      .map(async (id) => {
        await openLand(id, browser);
      });

    await Promise.all(promises);
    await syncLands();

    await sleep(10 * 1000);
  }
}

async function openLandsSequentially(browser: Browser) {
  const ids = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "data", "lands.json"), "utf8")) as string[];
  //console.log(ids);

  for (const id of ids) {
    if (id !== undefined) {
      await openLand(id, browser);
      await syncLands();
    }
  }
}

async function openLand(id: string, browser: Browser) {
  console.log(`Opening land ${id}.`);

  let pages = await browser.pages();
  if (pages.length > 0) {
    await pages[0].evaluate(`document.title = "PixelsToTheMoon";`);
  }

  for (const page of pages) {
    const splitUrl = page.url().split("/");

    if (splitUrl[splitUrl.length - 1] == id) {
      return;
    }
  }

  let page = await browser.newPage();

  await page.setBypassCSP(true);
  await page.setRequestInterception(true);

  page.on("request", async (request) => {
    if (
      request.url().includes("play.pixels.xyz") &&
      request.url().includes("chunks") &&
      request.url().includes("_app") &&
      request.url().includes(".js")
    ) {
      //console.log(request.url());

      var response = await (await fetch(request.url())).text();

      if (response.includes("initGame()")) {
        response = await fs.readFileSync("./injections/app.js", "utf8");
      }

      request.respond({
        status: 200,
        contentType: "application/javascript; charset=utf-8;",
        body: response,
      });
    } else {
      request.continue();
    }
  });

  const client = await page.createCDPSession();

  await client.send('Network.enable');

  client.on('Network.webSocketCreated', ({requestId, url}) => {
    console.log('Network.webSocketCreated', requestId, url);
  });

  client.on('Network.webSocketClosed', ({requestId, timestamp}) => {
    console.log('Network.webSocketClosed', requestId, timestamp);
  });

  client.on('Network.webSocketFrameSent', ({requestId, timestamp, response}) => {
    const decodedData = Buffer.from(response.payloadData, 'base64').toString('utf8');
    console.log('Network.webSocketFrameSent', requestId, timestamp, response.payloadData);
  });

  client.on('Network.webSocketFrameReceived', ({requestId, timestamp, response}) => {
    const decodedData = Buffer.from(response.payloadData, 'base64').toString('utf8');
    console.log('Network.webSocketFrameReceived', requestId, timestamp, response.payloadData);
  });

  try {
    await page.goto(`https://play.pixels.xyz/pixels/share/${id}`, {
      waitUntil: ["load", "domcontentloaded", "networkidle0", "networkidle2"],
    });
  } catch (error) {
    console.error(`Error opening land ${id}.`, error);
    return;
  }

  await page.evaluate(`document.title = ${id};`);

  await sleep(15 * 1000);

  let land = lands.find((land) => land.id === id);

  // If not in lands array, add it.
  if (land) {
    land.trees = await updateTrees(id, page, land.trees);
  } else {
    land = { id: id, trees: await getTrees(id, page) };
    lands.push(land);
  }

  if ((await browser.pages()).length > 1) {
    //await page.close();
  }
}

function websocketDecode(base64: string) {
  if (base64.length === 0) {
    return "";
  }

  // Decode base64 (convert ascii to binary)
  var strData = atob(base64);

  // Convert binary string to character-number array
  var charData = strData.split("").map(function(x) {
    return x.charCodeAt(0);
  });

  // Turn number array into byte-array
  var binData = new Uint8Array(charData);

  // Pako magic
  var data = pako.inflate(binData);

  // Convert gunzipped byteArray back to ascii string:
  // var strData = String.fromCharCode.apply(null, new Uint16Array(data));
  const uint8Array = new Uint16Array(data);
  strData = uint8Array.reduce(
    (acc, i) => (acc += String.fromCharCode.apply(null, [i])),
    ""
  );

  // var strData = _arrayBufferToBase64(new Uint16Array(data));
  return strData;
};

function websocketEncode(string: string) {
  return btoa(pako.deflate(string, { to: "string" }));
};


async function syncLands() {
  try {
    for (let i = 0; i < lands.length; i++) {
      const land = lands[i];

      let wantedState = false;
      for (let j = 0; j < land.trees.length; j++) {
        console.log(`Tree ${land.trees[j].id} of land ${land.id} is in state ${land.trees[j].currentState}.`);

        if (land.trees[j].currentState == "3" || land.trees[j].currentState == "4" || land.trees[j].currentState == "5") {
          wantedState = true;
          break;
        }
      }

      if (!wantedState) {
        console.log(`Land ${land.id} is not on wanted state 3, 4 or 5.`);
        continue;
      }

      console.log(`Land ${land.id} is on wanted state 3, 4 or 5.`);

      const dbLand = await getLand(land.id);

      const landsFirestorePath = path.resolve(__dirname, "..", "data", "landsFirestore.json");
      const landsFirestore = (await fs.existsSync(landsFirestorePath)) ? fs.readFileSync(landsFirestorePath, "utf8").includes(land.id) : false;

      if (dbLand) {
        if (JSON.stringify(land.trees) !== JSON.stringify(dbLand.trees)) {
          await updateLand(land);
        }
      } else if (landsFirestore) {
        await setLand(land);

        await fs.appendFileSync(landsFirestorePath, `${land.id}\n`);
      }
    }
  } catch (error) {
    console.error("Error syncing lands.", error);
  }
}

function injectGlobalVariable(
  response: string,
  variableType: string,
  variableName: string,
  variableEnd: string,
  indexOffset: number
) {
  // Get the index of the variable and the next semicolon.
  var start = response.indexOf(variableType + " " + variableName);
  var end = response.indexOf(variableEnd, start) + indexOffset;

  // Create the global variable string.
  var variable = "window." + variableName + " = " + variableName + ";";

  // Create a global variable with the value of the target variable.
  response =
    response.slice(0, start) +
    response.slice(start, end) +
    variable +
    response.slice(end, response.length);

  return response;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTreeKeys() {
  let treeKeys = [];

  // First number (i) is the tree type (1-4), second number (j) is the tree color (1-3), and the third number (const) is the tree if is equals to 1.
  for (let i = 1; i < 5; i++) {
    for (let j = 1; j < 4; j++) {
      treeKeys.push("ent_treeLand" + i + "v" + j + "-" + 1);
      treeKeys.push("ent_treeWater" + i + "v" + j + "-" + 1);
      treeKeys.push("ent_treeSpace" + i + "v" + j + "-" + 1);
    }
  }

  //console.log(treeKeys);

  return treeKeys;
}

async function getTreeStates(id: string, page: Page, attempts = 0) {
  try {
    const treeKeys = getTreeKeys();

    const treeStatesVariable = `window.treeStates`;
    await page.evaluate(`${treeStatesVariable} = [];`);

    console.log(`Getting tree states of land ${id}.`);

    await runQueryTreeStates(treeStatesVariable, treeKeys, page);

    const json = (await page.evaluate(
      `JSON.stringify(${treeStatesVariable});`
    )) as string;
    //console.log(json);

    const treeStates = JSON.parse(json) as TreeState[];
    //console.log(treeStates);

    console.log(`Got ${treeStates.length} tree states of land ${id}.`);

    while (treeStates.length === 0 && attempts < 11) {
      console.log(
        `Retrying attempt ${attempts} to get tree states of land ${id}.`
      );
      await sleep(10 * 1000);
      return getTreeStates(id, page, attempts + 1);
    }

    return treeStates;
  } catch (error) {
    console.error(`Error getting tree states of land ${id}.`, error);
    return [];
  }
}

async function runQueryTreeStates(
  treeStatesVariable: string,
  treeKeys: string[],
  page: Page
) {
  for (const key of treeKeys) {
    const query = `window.phaserGame.scene.scenes[1].children.list.filter((trees) =>
        trees instanceof Phaser.GameObjects.Container &&
        trees.list[1] instanceof Phaser.GameObjects.Sprite &&
        trees.list[1].texture.key === "${key}"
      ).forEach((tree) => {
        ${treeStatesVariable}.push({x: tree.x, y: tree.y, state: tree.list[1].frame.name});
      });`;

    await page.evaluate(query);
    //console.log(query);
  }
}

async function getTrees(id: string, page: Page) {
  const treeStates = await getTreeStates(id, page);

  const trees: Tree[] = [];

  console.log(`Adding trees of land ${id}.`);

  for (let i = 0; i < treeStates.length; i++) {
    const treeState = treeStates[i];

    const tree = {
      id: treeState.x + "-" + treeState.y,
      previousState: treeState.state,
      previousTimestamp: Date.now(),
      currentState: treeState.state,
      currentTimestamp: Date.now(),
    } as Tree;

    trees.push(tree);

    console.log(
      `Added tree of number ${i} with id ${tree.id} of land ${id} with state ${tree.currentState} and timestamp ${tree.currentTimestamp}.`
    );
  }

  //console.log(trees);
  console.log(`Added ${trees.length} trees of land ${id}.`);

  return trees;
}

async function updateTrees(id: string, page: Page, trees: Tree[]) {
  const treeStates = await getTreeStates(id, page);

  console.log(`Updating trees of land ${id}.`);

  for (let i = 0; i < treeStates.length; i++) {
    const treeState = treeStates[i];

    const tree = trees.find(
      (tree) => tree.id === treeState.x + "-" + treeState.y
    );

    if (tree) {
      if (tree.previousState !== treeState.state || treeState.state === "5") {
        let difference = Date.now() - tree.currentTimestamp;

        if (treeState.state === "5") {
          tree.growTimestamp = Math.abs(
            difference - Date.now() + 7.25 * 60 * 60 * 1000
          );
        }

        console.log(
          `Updated tree of number ${i} with id ${tree.id} of land ${id} with a state change from ${tree.previousState} to ${treeState.state} and grow timestamp ${tree.growTimestamp}.`
        );

        tree.previousState = treeState.state;
        tree.previousTimestamp = Date.now();
      }

      tree.currentState = treeState.state;
      tree.currentTimestamp = Date.now();

      if (tree.growTimestamp) {
        tree.timeRemaining = Date.now() - tree.growTimestamp;
      }

      console.log(
        `Updated tree ${tree.id} of land ${id} with current state ${tree.currentState} and timestamp ${tree.currentTimestamp}.`
      );
    }
  }

  //console.log(trees);
  console.log(`Updated ${trees.length} trees of land ${id}.`);

  return trees;
}

async function getLand(id: string) {
  try {
    const landRef = landDoc(id);

    const doc = await landRef.get();

    if (doc.exists) {
      console.log(`Got land ${id}`);

      return doc.data() as Land;
    } else {
      console.log(`Land ${id} does not exist on firestore.`);

      return undefined;
    }
  } catch (error) {
    console.error("Error getting land on firestore.", error);

    return undefined;
  }
}

async function getLands() {
  try {
    const landsRef = landsCollection;

    const snapshot = await landsRef.get();

    const lands: Land[] = [];

    snapshot.forEach((doc) => {
      lands.push(doc.data() as Land);
    });

    console.log(`Got ${lands.length} lands on firestore.`);

    return lands;
  } catch (error) {
    console.error("Error getting lands on firestore.", error);

    return undefined;
  }
}

async function setLand(land: Land) {
  try {
    const landRef = landDoc(land.id);

    await landRef.set(land);
    console.log(`Set land ${land.id} on firestore.`);
  } catch (error) {
    console.error("Error setting land on firestore.", error);
  }
}

async function setLands(lands: Land[]) {
  for (let i = 0; i < lands.length; i++) {
    await setLand(lands[i]);
  }
}

async function updateLand(land: Land) {
  try {
    const landRef = landDoc(land.id);

    await landRef.update({ ...land });
    console.log(`Updated land ${land.id} on firestore.`);
  } catch (error) {
    console.error("Error updating land on firestore.", error);
  }
}

async function updateLands(lands: Land[]) {
  for (let i = 0; i < lands.length; i++) {
    await updateLand(lands[i]);
  }
}

//window.phaserGame.scene.scenes[1].children.list.filter(trees => trees instanceof Phaser.GameObjects.Sprite)[0].texture.manager.list["ent_treeLand1v1-1"].source[0].image.currentSrc;
//window.phaserGame.scene.scenes[1].children.list.filter(trees => trees instanceof Phaser.GameObjects.Container && trees.list[1] instanceof Phaser.GameObjects.Sprite);
//window.phaserGame.scene.scenes[1].children.list.filter(trees => trees instanceof Phaser.GameObjects.Container && trees.list[1] instanceof Phaser.GameObjects.Sprite && trees.list[1].texture.key === "ent_treeLand1v1-1");
//window.phaserGame.scene.scenes[1].children.list.filter((trees) => trees instanceof Phaser.GameObjects.Container && trees.list[1] instanceof Phaser.GameObjects.Sprite && trees.list[1].texture.key === "ent_treeLand1v1-1");
