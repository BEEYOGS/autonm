const path = require("node:path");
const { MSICreator } = require("electron-wix-msi");
const packageJson = require("../package.json");

async function buildMsi() {
  const creator = new MSICreator({
    appDirectory: path.resolve("release", "win-unpacked"),
    outputDirectory: path.resolve("release"),
    exe: "Stikerin Studio.exe",
    icon: path.resolve("assets", "stikerin.ico"),
    name: "Stikerin Studio",
    shortName: "StikerinStudio",
    manufacturer: "Stikerin",
    description: "Studio desain untuk Windows",
    version: packageJson.version,
    appUserModelId: "com.stikerin.studio",
    upgradeCode: "8f4c8a0d-9080-4cc2-9dd5-7c48b4b2d046",
    shortcutFolderName: "Stikerin Studio",
    arch: "x64",
  });

  await creator.create();
  await creator.compile();
  console.info("MSI installer dibuat di folder release.");
}

buildMsi().catch((error) => {
  console.error("Gagal membuat MSI. Pastikan WiX Toolset v3 terpasang dan dapat diakses melalui PATH.", error);
  process.exitCode = 1;
});
