# Get My Kids' Photos

If you have a school or daycare that uses gethomeroom.com this may or may not be useful. It's a bit of a hack and may stop working at any time. Enjoy!

## Setup

- Install [NodeJS](https://nodejs.org/en/) and [pnpm](http://pnpm.js.org).
- Install dependencies with `pnpm install`.
- Copy `config.json.example` to `config.json` and edit it so as to find your kids' photos.
- Add an entry to your system keychain for your loging to gethomeroom.com so `keytar` can find it.

## Get Photos

Run `node index.js`. This will probably prompt you to unlock your system keychain. It'll then log in and find and download photos using [puppeteer](https://github.com/puppeteer/puppeteer), a headless Chrome browser.

You'll get photos wherever you said you wanted them in `config.json`. You'll get a folder named `all` with everything it's ever seen and a `batch` folder with just the stuff it found _this time_. It's barely smart enough to update `config.json` with some information about the most recent photo for each kid it's seen, so it should take less time the next time(s) you run it.

## License

MIT
