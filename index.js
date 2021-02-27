// @ts-check

const puppeteer = require("puppeteer");
const keytar = require("keytar");
const { dirname, join, extname } = require("path");
const { promises: fs, createWriteStream, constants } = require("fs");
const got = require("got");
const stream = require("stream");
const { promisify, inspect } = require("util");

const pipeline = promisify(stream.pipeline);

(async (configPath) => {
  const config = JSON.parse(await fs.readFile(configPath, "utf-8"));
  const domain = "gethomeroom.com";
  const [creds] = await keytar.findCredentials(domain);

  if (!creds) {
    console.error(`No username/password found for ${domain}.`);
    return;
  }

  console.log("Launching browser.");
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  console.log("Logging in…");
  await page.goto(`https://${domain}/login`);
  await page.type('input[name="email_or_phone"]', creds.account);
  await page.type('input[name="password"]', creds.password);
  await page.click('#register-login-form button[type="submit"]');
  await page.waitForNavigation();

  console.log("Getting a list of classrooms.");
  await page.click("#hamburger-button");
  await page.waitForSelector("#cluster-list .cluster .name");
  /** @type {Array<{ name: string; url: string }>} */
  const clusters = [];

  for (const $cluster of await page.$$("#cluster-list .cluster")) {
    const name = await $cluster.$eval(".name", (el) => el.textContent);
    const url = await $cluster.$eval("a", (el) => el.getAttribute("href"));
    clusters.push({ name, url: new URL(url, page.url()).toString() });
  }
  console.log(
    `Found classrooms: ${clusters.map(({ name }) => name).join(", ")}.`
  );

  for (const target of config.targets) {
    console.log(
      `Looking for photos matching ${inspect(target.commentKeywords)} in ${
        target.clusterName
      }.`
    );

    const output = join(dirname(configPath), target.output);
    await fs.mkdir(output, { recursive: true });

    const cluster = clusters.find(({ name }) => name === target.clusterName);

    if (!cluster) {
      console.error(`Unable to find a cluster named "${target.clusterName}".`);
      break;
    }

    await page.goto(cluster.url);

    console.log(
      `Scrolling back to find the last known photo id: ${target.lastKnownPhotoId}.`
    );
    let $photos = await page.$$(".photo-feed-item");
    while ($photos.length > 0) {
      if (
        await page.$(
          `.photo-feed-item[data-photo-id="${target.lastKnownPhotoId}"]`
        )
      ) {
        console.log("Found the last known photo, saving photos from here.");
        break;
      } else {
        console.log("Scrolling back…");
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await page.waitForFunction(
          (count) =>
            document.querySelectorAll(".photo-feed-item").length > count,
          {},
          $photos.length
        );
        $photos = await page.$$(".photo-feed-item");
      }
    }

    const kidNamePattern = new RegExp(
      `\\b(${target.commentKeywords.join("|")})\\b`,
      "i"
    );
    let latestPhotoId;

    for (const $photo of $photos) {
      const comment = await $photo.$$eval(
        ".comment p",
        (comments) => comments[0] && comments[0].textContent
      );

      if (kidNamePattern.test(comment)) {
        console.log(`Found keyword in comment: ${comment}`);

        const photoId = await $photo.evaluate((node) =>
          node.getAttribute("data-photo-id")
        );
        if (!latestPhotoId) {
          latestPhotoId = photoId;
        }
        const isVideo = !!(await $photo.$('[data-action="play-video"]'));
        const $actionsButton = await $photo.$(
          '.controls .cluster-action[data-action="photo-options"]'
        );
        await $actionsButton.click();
        const url = await page.$$eval("a[href]", (links) =>
          links.find((el) => el.textContent === "Download").getAttribute("href")
        );
        console.log(`Checking photo/video: ${url}`);
        const ext = extname(url) || (isVideo ? ".mp4" : ".jpg");
        const downloadPath =
          join(
            output,
            `${photoId}-${comment}`
              .replace(/[:\/]+/g, "-")
              .replace(/-+/g, "-")
              .replace(/(^-+|-+$)/g, "")
              .replace(/\.+$/, "")
              .trim()
          ) + ext;
        if (await download(url, downloadPath)) {
          console.log(`Downloaded to ${downloadPath}`);
        }
        await page.keyboard.press("Escape");
        await page.waitForFunction(() =>
          [...document.querySelectorAll("a[href]")].every(
            (el) => el.textContent !== "Download"
          )
        );
      }
    }

    if (latestPhotoId) {
      target.lastKnownPhotoId = latestPhotoId;
    }
  }

  await fs.writeFile(configPath, JSON.stringify(config, undefined, 2));

  await browser.close();
})(join(__dirname, "config.json"));

/**
 * @param {string} url
 * @param {string} path
 * @returns {Promise<boolean>}
 */
async function download(url, path) {
  try {
    await fs.access(path, constants.R_OK);
    return false;
  } catch {
    await pipeline(got.default.stream(url), createWriteStream(path));
    return true;
  }
}
