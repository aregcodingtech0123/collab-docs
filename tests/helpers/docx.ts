// The .docx / ZIP builder lives in scripts/e2e/lib/docx.mjs so the e2e suites can share it.
// Unit tests import it from here.
export { buildDocx, imageParagraph, para, run, table, text, zip } from "../../scripts/e2e/lib/docx.mjs";
