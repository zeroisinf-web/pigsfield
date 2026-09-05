import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const playerSource = fs.readFileSync(path.join(ROOT, "js", "player.js"), "utf8").replace(/\r\n/g, "\n");
const context = vm.createContext({
  URL,
  window: { PF: {} },
  document: {},
  location: {
    protocol: "https:",
    origin: "https://pigsfield.com",
    href: "https://pigsfield.com/watch/?q=history"
  },
  setTimeout
});
new vm.Script(playerSource, { filename: "js/player.js" }).runInContext(context);

const { parse, parseTime, embedUrl, isYouTube } = context.window.PF.YouTube;
const plain = (value) => JSON.parse(JSON.stringify(value));

test("parses standard, short, Shorts, live and privacy-enhanced video URLs", () => {
  const cases = [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://youtube.com/shorts/dQw4w9WgXcQ",
    "https://m.youtube.com/live/dQw4w9WgXcQ",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
  ];

  for (const url of cases) {
    const media = plain(parse(url));
    assert.equal(media.kind, "video", url);
    assert.equal(media.videoId, "dQw4w9WgXcQ", url);
    assert.equal(media.original, new URL(url).href, url);
  }
});

test("parses video start time, playlist context and index", () => {
  const media = plain(parse("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890ABC&t=1m2s&index=7"));
  assert.equal(media.kind, "video");
  assert.equal(media.videoId, "dQw4w9WgXcQ");
  assert.equal(media.playlistId, "PL1234567890ABC");
  assert.equal(media.start, 62);
  assert.equal(media.index, 7);
});

test("parses playlist and embedded videoseries URLs", () => {
  const urls = [
    "https://www.youtube.com/playlist?list=PL1234567890ABC",
    "https://www.youtube-nocookie.com/embed/videoseries?list=PL1234567890ABC",
    "https://www.youtube-nocookie.com/embed/?listType=playlist&list=PL1234567890ABC"
  ];

  for (const url of urls) {
    const media = plain(parse(url));
    assert.equal(media.kind, "playlist", url);
    assert.equal(media.playlistId, "PL1234567890ABC", url);
  }
});

test("rejects insecure, spoofed, non-media and malformed YouTube URLs", () => {
  const urls = [
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com.example.org/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/@ncertofficial/playlists",
    "https://www.youtube.com/watch?v=too-short",
    "https://www.youtube.com/playlist?list=short",
    "not a URL"
  ];
  for (const url of urls) assert.equal(parse(url), null, url);
});

test("recognizes only supported HTTPS YouTube hosts", () => {
  assert.equal(isYouTube("https://youtube.com/watch?v=dQw4w9WgXcQ"), true);
  assert.equal(isYouTube("https://youtu.be/dQw4w9WgXcQ"), true);
  assert.equal(isYouTube("http://youtube.com/watch?v=dQw4w9WgXcQ"), false);
  assert.equal(isYouTube("https://youtube.com.example.org/watch?v=dQw4w9WgXcQ"), false);
});

test("converts YouTube time fragments safely", () => {
  assert.equal(parseTime("90"), 90);
  assert.equal(parseTime("90s"), 90);
  assert.equal(parseTime("1h2m3s"), 3723);
  assert.equal(parseTime("2m"), 120);
  assert.equal(parseTime("nonsense"), 0);
  assert.equal(parseTime(""), 0);
});

test("builds privacy-enhanced embeds with origin and widget referrer", () => {
  const media = parse("https://youtu.be/dQw4w9WgXcQ?t=45");
  const url = new URL(embedUrl(media));
  assert.equal(url.origin, "https://www.youtube-nocookie.com");
  assert.equal(url.pathname, "/embed/dQw4w9WgXcQ");
  assert.equal(url.searchParams.get("autoplay"), "1");
  assert.equal(url.searchParams.get("controls"), "1");
  assert.equal(url.searchParams.get("playsinline"), "1");
  assert.equal(url.searchParams.get("enablejsapi"), "1");
  assert.equal(url.searchParams.get("start"), "45");
  assert.equal(url.searchParams.get("origin"), "https://pigsfield.com");
  assert.equal(url.searchParams.get("widget_referrer"), "https://pigsfield.com/watch/?q=history");
});

test("builds playlist embeds without inventing a video ID", () => {
  const media = parse("https://www.youtube.com/playlist?list=PL1234567890ABC&index=3");
  const url = new URL(embedUrl(media));
  assert.equal(url.pathname, "/embed/videoseries");
  assert.equal(url.searchParams.get("listType"), "playlist");
  assert.equal(url.searchParams.get("list"), "PL1234567890ABC");
  assert.equal(url.searchParams.get("index"), "3");
});

test("keeps the complete playlist context beside a selected video", () => {
  const media = parse("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890ABC&index=7");
  const url = new URL(embedUrl(media));
  assert.equal(url.pathname, "/embed/dQw4w9WgXcQ");
  assert.equal(url.searchParams.get("listType"), "playlist");
  assert.equal(url.searchParams.get("list"), "PL1234567890ABC");
  assert.equal(url.searchParams.get("index"), "7");
});

test("renders and controls a companion queue from the official iframe API", () => {
  assert.match(playerSource, /Complete playlist/);
  assert.match(playerSource, /\.getPlaylist\(\)/);
  assert.match(playerSource, /\.getPlaylistIndex\(\)/);
  assert.match(playerSource, /\.playVideoAt\(index\)/);
});
