// Creates the files the import e2e uses, in a fresh temp directory (nothing is committed).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDocx, imageParagraph, para, run, table, text } from "./docx.mjs";

/** @returns {string} the directory containing the fixture files */
export function makeFixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "collab-docs-e2e-"));
  const write = (name, data) => fs.writeFileSync(path.join(dir, name), data);

  write(
    "Roadmap.md",
    [
      "# Product roadmap", "", "## Q1 goals", "",
      "We will ship **fast**, stay *focused* and keep things <u>simple</u>.", "",
      "- Import files", "- Share documents", "- Autosave", "",
      "1. Design", "2. Build", "3. Ship", "",
      "#### A deeper heading", "",
      "<script>alert('xss')</script>", "", "![logo](http://evil.example/logo.png)", "", "Closing paragraph.", "",
    ].join("\n"),
  );

  write(
    "Quarterly report.docx",
    buildDocx(
      text("Quarterly report", { style: "Heading1" }) +
        text("Highlights", { style: "Heading2" }) +
        para([
          run("Revenue was "), run("up", { bold: true }), run(", costs were "), run("flat", { italic: true }),
          run(" and morale was "), run("great", { underline: true }), run("."),
        ]) +
        text("Launched the beta", { list: 1 }) + text("Hired two engineers", { list: 1 }) +
        text("Plan", { list: 2 }) + text("Execute", { list: 2 }) +
        imageParagraph() + table([["a", "b"]]) + text("Thanks for reading."),
    ),
  );

  write("notes.pdf", "%PDF-1.4 not really");
  write("empty.txt", "");
  write("blank.md", "   \n\n  \n");
  write("corrupt.docx", new Uint8Array(3000).map((_, i) => (i * 37 + 5) % 256));
  write("big.txt", new Uint8Array(3 * 1024 * 1024).fill(97));
  write("plain.txt", "Shopping list\nmilk\neggs\n\nSecond paragraph about bread.");
  return dir;
}
