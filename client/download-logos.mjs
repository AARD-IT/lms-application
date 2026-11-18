
import fs from "node:fs";
import path from "node:path";

const componentPath = path.resolve(
  "src/components/home/MasterAISection.jsx"
);

const outputDir = path.resolve("public/company-logos");

if (!fs.existsSync(componentPath)) {
  console.error("MasterAISection.jsx not found:", componentPath);
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });

const source = fs.readFileSync(componentPath, "utf8");

const match = source.match(
  /const COMPANY_LOGOS\s*=\s*\{([\s\S]*?)\};/
);

if (!match) {
  console.error("COMPANY_LOGOS mapping not found.");
  process.exit(1);
}

const entries = [
  ...match[1].matchAll(/['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/g),
];

console.log(`Found ${entries.length} logos.`);

for (const [, company, slug] of entries) {
  const filePath = path.join(outputDir, `${slug}.svg`);

  if (fs.existsSync(filePath)) continue;

  try {
    const response = await fetch(
      `https://cdn.simpleicons.org/${encodeURIComponent(slug)}`
    );

    if (!response.ok) {
      console.log(`Unavailable: ${company}`);
      continue;
    }

    const svg = await response.text();

    if (!svg.includes("<svg")) continue;

    fs.writeFileSync(filePath, svg, "utf8");
    console.log(`Downloaded: ${company}`);
  } catch (error) {
    console.log(`Failed: ${company}: ${error.message}`);
  }
}

console.log("Download completed.");


