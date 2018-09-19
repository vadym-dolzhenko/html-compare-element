const fs = require("fs");
const bunyan = require("bunyan");
const {JSDOM} = require("jsdom");

const logger = bunyan.createLogger({name: "app"});

const originFilePath = process.argv[2] || "./test/sample-0-origin.html";

const originElementId = process.argv[4] || "make-everything-ok-button";

const diffFilePath = process.argv[3] || "./test/sample-1-evil-gemini.html";

console.log(process.argv);

const getElementPath = (el) => {
  let path = `${el.nodeName}[${[...el.parentNode.children].indexOf(el)}]`;
  if (el.parentNode.nodeName !== "#document") {
    path = `${getElementPath(el.parentNode)} > ${path}`
  }
  return path;
};

const getFileDom = (filePath) => {
  try {
    const targetFile = fs.readFileSync(filePath);
    return new JSDOM(targetFile);
  } catch (e) {
    logger.error(e);
    throw new Error(`Invalid file ${filePath}`);
  }
};

const searchByInnerHTML = (el, targetDom) => {
  const elements = [];
  const results = targetDom.window.document.evaluate(
    `//${el.nodeName}[contains(., '${el.innerHTML}')]`,
    targetDom.window.document,
    null,
    targetDom.window.XPathResult.ANY_TYPE,
    null
  );
  let result = results.iterateNext();
  while (result) {
    elements.push(result);
    result = results.iterateNext();
  }
  return elements;
};

const searchByAttributes = (el, targetDom) => {
  const searchResults = {};
  const attributes = [...el.attributes];
  attributes.forEach((attr) => {
    const attrQuery = `${attr.name}="${attr.value}"`;
    searchResults[attrQuery] = [];
    const results = [...targetDom.window.document.querySelectorAll(`${el.nodeName}[${attrQuery}]`)];
    results.forEach((result) => {
      searchResults[attrQuery].push(result);
    })
  });
  return searchResults;
};

const originDom = getFileDom(originFilePath);
const originElement = originDom.window.document.getElementById(originElementId);

if (!originElement) {
  const error = new Error(`Element not exist in file ${originFilePath} with id ${originElementId}`);
  logger.error(error);
  throw new Error(error);
}

const diffDom = getFileDom(diffFilePath);

const report = {
  origin: {
    path: getElementPath(originElement),
    HTML: originElement.outerHTML
  },
  diff: {}
};

const addResult = (matchedBy) => (element) => {
  const elemPath = getElementPath(element);
  if (!report.diff[elemPath]) {
    report.diff[elemPath] = {
      HTML: element.outerHTML,
      matched: [
        matchedBy
      ]
    }
  } else {
    report.diff[elemPath].matched.push(matchedBy);
  }
};

const innerHTMLResults = searchByInnerHTML(originElement, diffDom);
const attributeResults = searchByAttributes(originElement, diffDom);

innerHTMLResults.forEach(addResult("innerHTML"));
for (let attrKey in attributeResults) {
  if (attributeResults.hasOwnProperty(attrKey)) {
    attributeResults[attrKey].forEach(addResult(attrKey));
  }
}

fs.writeFileSync("./report.json", JSON.stringify(report));

logger.info("Done");
